import 'dotenv/config';
import crypto from 'node:crypto';
import { Client } from 'pg';
import { createPostgresTlsConfig } from './postgres-tls.ts';
import { validatePostgresTestTarget } from './postgres-test-target.ts';
import { PostgresStore } from '../server/postgres-store.ts';

const applicationTables = [
  'restaurants', 'outlets', 'pricing_policies', 'protected_price_categories',
  'menu_items', 'protected_menu_items', 'daily_sales', 'competitors',
  'competitor_observations', 'menu_matches', 'inventory_items',
  'inventory_menu_items', 'pricing_recommendations', 'price_changes',
  'audit_events', 'agent_executions', 'json_import_batches',
];
const testPrefix = `RIQ PG CONCURRENCY ${crypto.randomUUID()}`;
const urls = (process.env.RESTAURANTIQ_TEST_API_URLS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request<T>(
  baseUrl: string,
  token: string | undefined,
  route: string,
  method = 'GET',
  body?: unknown,
) {
  const response = await fetch(new URL(route, baseUrl), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null) as T | null;
  return { status: response.status, body: result };
}

async function main() {
  if (process.env.PERSISTENCE_MODE !== 'postgres') {
    throw new Error('Set PERSISTENCE_MODE=postgres before running PostgreSQL integration tests.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('These integration tests are restricted to a non-production environment.');
  }
  if (urls.length < 2) {
    throw new Error('Set RESTAURANTIQ_TEST_API_URLS to two local API URLs on separate backend processes.');
  }
  for (const apiUrl of urls) {
    let parsed: URL;
    try {
      parsed = new URL(apiUrl);
    } catch {
      throw new Error('RESTAURANTIQ_TEST_API_URLS must contain valid local API URLs.');
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
      throw new Error('PostgreSQL integration tests may target only local API processes.');
    }
  }
  const { connectionString: databaseUrl } = validatePostgresTestTarget(process.env);
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;
  const originalDisposableFlag = process.env.RESTAURANTIQ_TEST_DATABASE_DISPOSABLE;
  try {
    process.env.DATABASE_URL = databaseUrl;
    process.env.RESTAURANTIQ_TEST_DATABASE_DISPOSABLE = 'true';
    const unavailableUrl = new URL(databaseUrl);
    unavailableUrl.port = '1';
    process.env.TEST_DATABASE_URL = unavailableUrl.toString();
    process.env.DATABASE_URL = unavailableUrl.toString();
    const unavailableStore = new PostgresStore();
    let connectionFailureObserved = false;
    try {
      await unavailableStore.health();
    } catch {
      connectionFailureObserved = true;
    } finally {
      await unavailableStore.close();
    }
    assert(connectionFailureObserved, 'An unreachable database endpoint did not produce a connection failure.');
    process.env.TEST_DATABASE_URL = databaseUrl;
    process.env.DATABASE_URL = databaseUrl;
    const recoveryStore = new PostgresStore();
    await recoveryStore.health();
    await recoveryStore.close();
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
    if (originalDisposableFlag === undefined) delete process.env.RESTAURANTIQ_TEST_DATABASE_DISPOSABLE;
    else process.env.RESTAURANTIQ_TEST_DATABASE_DISPOSABLE = originalDisposableFlag;
  }

  const client = new Client({
    ...createPostgresTlsConfig(databaseUrl),
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 20000,
    application_name: 'restaurantiq-isolated-concurrency-test',
  });
  const probeClient = new Client({
    ...createPostgresTlsConfig(databaseUrl),
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 20000,
    application_name: 'restaurantiq-isolated-rollback-probe',
  });
  const tokens: string[] = [];
  let createdIds: string[] = [];
  let preTestAuditIds: string[] = [];
  let createdAuditIds: string[] = [];
  let testStartedAt: Date | undefined;
  let clientConnected = false;
  let probeConnected = false;
  let passed = 0;

  try {
    await client.connect();
    clientConnected = true;
    await probeClient.connect();
    probeConnected = true;
    const access = await client.query<{
      current_user: string;
      bypass_rls: boolean;
      app_member: boolean;
      can_read_schema_migrations: boolean;
    }>(
      `SELECT current_user, r.rolbypassrls AS bypass_rls,
         pg_has_role(current_user, 'restaurantiq_app', 'member') AS app_member,
         has_table_privilege(current_user, 'public.schema_migrations', 'SELECT') AS can_read_schema_migrations
       FROM pg_roles r WHERE r.rolname=current_user`,
    );
    assert(access.rowCount === 1, 'Runtime database identity could not be verified.');
    assert(!access.rows[0].bypass_rls && access.rows[0].app_member, 'Runtime role bypasses RLS or lacks the application role.');
    assert(!access.rows[0].can_read_schema_migrations, 'Runtime role has unexpected migration-ledger access.');
    await client.query('SELECT count(*) FROM public.menu_items');
    let migrationTableDenied = false;
    try {
      await client.query('SELECT count(*) FROM public.schema_migrations');
    } catch (error) {
      migrationTableDenied = typeof error === 'object' && error !== null &&
        'code' in error && error.code === '42501';
    }
    assert(migrationTableDenied, 'Runtime role was not denied access to the migration ledger.');
    passed += 2;

    const beforeCounts: Record<string, number> = {};
    for (const table of applicationTables) {
      const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${table}`);
      beforeCounts[table] = result.rows[0].count;
    }
    assert(Object.values(beforeCounts).every((count) => count === 0),
      'Integration test requires an empty application schema; no writes were made.');
    const beforeAudit = await client.query<{ id: string }>('SELECT id FROM public.audit_events');
    preTestAuditIds = beforeAudit.rows.map((row) => row.id);
    testStartedAt = new Date();

    const loginResults = await Promise.all(urls.map((url) =>
      request<{ token?: string }>(url, undefined, '/api/auth/login', 'POST', { role: 'admin' })));
    for (const result of loginResults) {
      assert(result.status === 200 && typeof result.body?.token === 'string',
        'Local API authentication failed; ensure the servers are in non-production mode.');
      tokens.push(result.body.token);
    }

    for (const url of urls) {
      const ready = await request<{ status?: string }>(url, undefined, '/api/ready');
      assert(ready.status === 200 && ready.body?.status === 'ready',
        'A backend process did not pass the database readiness check.');
    }
    passed += 1;

    const rollbackHash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO public.json_import_batches
          (source_sha256, source_file_name, included_demo_data, record_counts, imported_by)
         VALUES ($1, 'integration-rollback-test.json', false, '{}'::jsonb, 'isolated-test')`,
        [rollbackHash],
      );
      let duplicateRejected = false;
      try {
        await client.query(
          `INSERT INTO public.json_import_batches
            (source_sha256, source_file_name, included_demo_data, record_counts, imported_by)
           VALUES ($1, 'integration-rollback-duplicate.json', false, '{}'::jsonb, 'isolated-test')`,
          [rollbackHash],
        );
      } catch (error) {
        duplicateRejected = typeof error === 'object' && error !== null &&
          'code' in error && error.code === '23505';
      }
      assert(duplicateRejected, 'Duplicate batch constraint was not enforced.');
    } finally {
      await client.query('ROLLBACK');
    }
    const rolledBack = await client.query(
      'SELECT count(*)::int AS count FROM public.json_import_batches WHERE source_sha256=$1',
      [rollbackHash],
    );
    assert(rolledBack.rows[0].count === 0, 'The deliberate failure left a partial database write.');
    passed += 1;

    const createRequests = Array.from({ length: 4 }, (_, index) => {
      const urlIndex = index % urls.length;
      return request<{ id?: string; name?: string }>(
        urls[urlIndex],
        tokens[urlIndex],
        '/api/menu',
        'POST',
        {
          name: `${testPrefix} ${index}`,
          category: 'Integration Test',
          currentPrice: 500,
          ingredientCost: 200,
          packagingCost: 15,
          minContribution: 50,
          restaurantId: 'untrusted-other-restaurant',
        },
      );
    });
    const [createSettlements] = await Promise.all([
      Promise.allSettled(createRequests),
      (async () => {
        try {
          await probeClient.query('BEGIN');
          await probeClient.query(
            `INSERT INTO public.json_import_batches
              (source_sha256, source_file_name, included_demo_data, record_counts, imported_by)
             VALUES ($1, 'concurrent-uncommitted-test.json', false, '{}'::jsonb, 'isolated-test')`,
            [crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex')],
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
        } finally {
          await probeClient.query('ROLLBACK');
        }
      })(),
    ]);
    createdIds = createSettlements.flatMap((result) =>
      result.status === 'fulfilled' && result.value.status === 201 &&
      typeof result.value.body?.id === 'string' ? [result.value.body.id] : []);
    assert(createSettlements.every((result) => result.status === 'fulfilled'),
      'A concurrent menu API request failed.');
    const creates = createSettlements.map((result) =>
      result.status === 'fulfilled' ? result.value : undefined);
    assert(creates.every((result) => result?.status === 201 && typeof result.body?.id === 'string'),
      'Concurrent menu creation failed; inspect API logs for sanitized PostgreSQL error codes.');
    createdIds = creates.map((result) => result!.body!.id!);
    assert(new Set(createdIds).size === creates.length, 'Concurrent creation returned duplicate menu identifiers.');
    const savedItems = await client.query<{ restaurant_id: string }>(
      'SELECT restaurant_id FROM public.menu_items WHERE id=ANY($1::text[])',
      [createdIds],
    );
    assert(savedItems.rowCount === createdIds.length &&
      savedItems.rows.every((row) => row.restaurant_id === 'restaurantiq-primary'),
    'A client-supplied restaurant identifier changed database ownership.');
    passed += 1;

    const firstUrlIndex = 0;
    const secondUrlIndex = 1;
    const firstId = createdIds[0];
    const updates = await Promise.all([
      request<{ name?: string }>(urls[firstUrlIndex], tokens[firstUrlIndex],
        `/api/menu/${encodeURIComponent(firstId)}`, 'PUT', { name: `${testPrefix} renamed` }),
      request<{ description?: string }>(urls[secondUrlIndex], tokens[secondUrlIndex],
        `/api/menu/${encodeURIComponent(firstId)}`, 'PUT', { description: 'cross-process update preserved' }),
    ]);
    assert(updates.every((result) => result.status === 200),
      'Concurrent updates to the same menu item failed.');
    const finalItem = await client.query<{ name: string; description: string }>(
      'SELECT name, description FROM public.menu_items WHERE id=$1',
      [firstId],
    );
    assert(finalItem.rowCount === 1 && finalItem.rows[0].name === `${testPrefix} renamed` &&
      finalItem.rows[0].description === 'cross-process update preserved',
    'Concurrent updates to distinct fields overwrote one another.');
    const otherProcessRead = await request<Array<{ id: string; name: string; description: string }>>(
      urls[secondUrlIndex], tokens[secondUrlIndex], '/api/menu',
    );
    assert(otherProcessRead.status === 200 && Array.isArray(otherProcessRead.body) &&
      otherProcessRead.body.some((item) => item.id === firstId &&
        item.name === `${testPrefix} renamed` &&
        item.description === 'cross-process update preserved'),
    'The second backend process did not observe the committed database state.');
    passed += 1;

    const rejectedWrite = await request<{ error?: string }>(
      urls[0], tokens[0], '/api/competitors/observations', 'POST',
      {
        competitorId: `${testPrefix}-missing-competitor`,
        menuItemId: firstId,
        dishName: 'Rollback verification',
        observedPrice: 100,
      },
    );
    assert(rejectedWrite.status === 503 &&
      rejectedWrite.body?.error === 'Database operation failed; no changes were committed.' &&
      !JSON.stringify(rejectedWrite.body).includes('23503'),
    'A database constraint failure was not rolled back or returned as a sanitized error.');
    const observationsAfterRollback = await request<Array<{ menuItemId: string }>>(
      urls[secondUrlIndex], tokens[secondUrlIndex], '/api/competitors/observations',
    );
    assert(observationsAfterRollback.status === 200 &&
      Array.isArray(observationsAfterRollback.body) &&
      !observationsAfterRollback.body.some((row) => row.menuItemId === firstId),
    'A failed database mutation remained in shared in-memory or persisted state.');
    passed += 1;

    const invalid = await request(urls[0], tokens[0], '/api/menu', 'POST', { name: '   ' });
    assert(invalid.status === 400, 'Invalid menu input did not return a safe client error.');
    passed += 1;
  } finally {
    if (testStartedAt) {
      const testItems = await client.query<{ id: string }>(
        'SELECT id FROM public.menu_items WHERE name LIKE $1',
        [`${testPrefix}%`],
      );
      createdIds = [...new Set([...createdIds, ...testItems.rows.map((row) => row.id)])];
    }
    if (testStartedAt) {
      const newAudit = await client.query<{ id: string }>(
        `SELECT id FROM public.audit_events
         WHERE timestamp >= $1 AND NOT (id = ANY($2::text[]))`,
        [testStartedAt, preTestAuditIds],
      );
      createdAuditIds = newAudit.rows.map((row) => row.id);
    }
    if (createdIds.length || createdAuditIds.length) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(7419021, 2)');
        const currentCounts: Record<string, number> = {};
        for (const table of applicationTables) {
          const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${table}`);
          currentCounts[table] = result.rows[0].count;
        }
        const recommendationCount = await client.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM public.pricing_recommendations WHERE menu_item_id=ANY($1::text[])',
          [createdIds],
        );
        const allowedCounts = new Map<string, number>([
          ['restaurants', 1], ['pricing_policies', 1], ['menu_items', createdIds.length],
          ['pricing_recommendations', recommendationCount.rows[0].count],
          ['audit_events', createdAuditIds.length],
        ]);
        for (const [table, count] of Object.entries(currentCounts)) {
          if (count !== (allowedCounts.get(table) ?? 0)) {
            throw new Error('Unexpected database rows detected; isolated test cleanup was aborted.');
          }
        }
        if (createdAuditIds.length) {
          throw new Error('An append-only audit record was created; manual review is required before cleanup.');
        }
        await client.query(
          'DELETE FROM public.pricing_recommendations WHERE menu_item_id=ANY($1::text[])',
          [createdIds],
        );
        await client.query('DELETE FROM public.menu_items WHERE id=ANY($1::text[])', [createdIds]);
        await client.query('DELETE FROM public.pricing_policies WHERE restaurant_id=$1', ['restaurantiq-primary']);
        await client.query('DELETE FROM public.restaurants WHERE id=$1', ['restaurantiq-primary']);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
    if (clientConnected) await client.end();
    if (probeConnected) await probeClient.end();
  }
  console.log(JSON.stringify({ checksPassed: passed, checksFailed: 0, backendProcesses: urls.length }));
}

main().catch(() => {
  console.error('PostgreSQL integration test failed; details are intentionally suppressed.');
  process.exitCode = 1;
});
