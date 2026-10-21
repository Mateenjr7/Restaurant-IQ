/**
 * Read-only verification of the RestaurantIQ schema and least-privilege roles.
 */
import 'dotenv/config';
import { Client } from 'pg';
import { createPostgresTlsConfig } from './postgres-tls.ts';

const expectedVersion = '202610220001_initial_restaurantiq_schema';
const expectedChecksum = 'b9d568b5f1a47728d68d298b18f4b0e5a0baa81ed79c14c65a22ca9c9fcc6882';
const applicationTables = [
  'restaurants', 'outlets', 'pricing_policies', 'protected_price_categories',
  'menu_items', 'protected_menu_items', 'daily_sales', 'competitors',
  'competitor_observations', 'menu_matches', 'inventory_items',
  'inventory_menu_items', 'pricing_recommendations', 'price_changes',
  'audit_events', 'agent_executions', 'json_import_batches',
];
const allTables = [...applicationTables, 'schema_migrations'].sort();
const expectedIndexes = [
  'outlets_restaurant_id_idx', 'menu_items_restaurant_category_idx',
  'competitor_observations_item_time_idx', 'daily_sales_date_idx',
  'recommendations_restaurant_status_idx', 'price_changes_item_time_idx',
  'audit_events_restaurant_time_idx', 'inventory_restaurant_idx',
];
const restrictedTableOperations = new Map([
  ['price_changes', ['SELECT', 'INSERT']],
  ['audit_events', ['SELECT', 'INSERT']],
  ['json_import_batches', ['SELECT', 'INSERT', 'UPDATE']],
]);

async function main() {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required for catalog verification.');
  const client = new Client({
    ...createPostgresTlsConfig(databaseUrl),
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 20000,
    application_name: 'restaurantiq-catalog-verification',
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const tables = await client.query<{ name: string; rls: boolean }>(
      `SELECT c.relname AS name, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p')
       ORDER BY c.relname`,
    );
    const migration = await client.query<{ version: string; checksum_sha256: string }>(
      'SELECT version, checksum_sha256 FROM public.schema_migrations ORDER BY version',
    );
    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND indexname = ANY($1::text[]) ORDER BY indexname`,
      [expectedIndexes],
    );
    const policies = await client.query<{ tablename: string; policyname: string; roles: string[]; cmd: string; has_using: boolean; has_check: boolean }>(
      `SELECT tablename, policyname, roles::text[], cmd,
         qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_check
       FROM pg_policies WHERE schemaname='public' ORDER BY tablename`,
    );
    const role = await client.query<{
      rolname: string; rolcanlogin: boolean; rolsuper: boolean; rolcreatedb: boolean;
      rolcreaterole: boolean; rolinherit: boolean; rolreplication: boolean; rolbypassrls: boolean;
      app_member: boolean; owns_objects: boolean; extra_membership: boolean;
    }>(
      `SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,
         r.rolreplication,r.rolbypassrls,
         pg_has_role(r.rolname,'restaurantiq_app','member') AS app_member,
         EXISTS (SELECT 1 FROM pg_shdepend d WHERE d.refobjid=r.oid
           AND d.refclassid='pg_authid'::regclass AND d.deptype='o') AS owns_objects,
         EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid
           WHERE m.member=r.oid AND g.rolname <> 'restaurantiq_app') AS extra_membership
       FROM pg_roles r WHERE r.rolname='restaurantiq_runtime'`,
    );
    const privileges = await client.query<{
      table_name: string; select_privilege: boolean; insert_privilege: boolean;
      update_privilege: boolean; delete_privilege: boolean;
      anon_access: boolean; authenticated_access: boolean; service_role_access: boolean;
    }>(
      `SELECT t.relname AS table_name,
         has_table_privilege('restaurantiq_runtime',t.oid,'SELECT') AS select_privilege,
         has_table_privilege('restaurantiq_runtime',t.oid,'INSERT') AS insert_privilege,
         has_table_privilege('restaurantiq_runtime',t.oid,'UPDATE') AS update_privilege,
         has_table_privilege('restaurantiq_runtime',t.oid,'DELETE') AS delete_privilege,
         has_table_privilege('anon',t.oid,'SELECT') OR has_table_privilege('anon',t.oid,'INSERT')
           OR has_table_privilege('anon',t.oid,'UPDATE') OR has_table_privilege('anon',t.oid,'DELETE') AS anon_access,
         has_table_privilege('authenticated',t.oid,'SELECT') OR has_table_privilege('authenticated',t.oid,'INSERT')
           OR has_table_privilege('authenticated',t.oid,'UPDATE') OR has_table_privilege('authenticated',t.oid,'DELETE') AS authenticated_access,
         has_table_privilege('service_role',t.oid,'SELECT') OR has_table_privilege('service_role',t.oid,'INSERT')
           OR has_table_privilege('service_role',t.oid,'UPDATE') OR has_table_privilege('service_role',t.oid,'DELETE') AS service_role_access
       FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname='public' AND t.relkind IN ('r','p') AND t.relname <> 'schema_migrations'
       ORDER BY t.relname`,
    );
    const sequence = await client.query<{ runtime_usage: boolean; runtime_select: boolean; public_access: boolean }>(
      `SELECT has_sequence_privilege('restaurantiq_runtime','public.json_import_batches_id_seq','USAGE') AS runtime_usage,
         has_sequence_privilege('restaurantiq_runtime','public.json_import_batches_id_seq','SELECT') AS runtime_select,
         has_sequence_privilege('anon','public.json_import_batches_id_seq','USAGE')
           OR has_sequence_privilege('authenticated','public.json_import_batches_id_seq','USAGE')
           OR has_sequence_privilege('service_role','public.json_import_batches_id_seq','USAGE') AS public_access`,
    );
    const constraints = await client.query<{ type: string; count: number }>(
      `SELECT con.contype AS type, count(*)::int AS count FROM pg_constraint con
       JOIN pg_class t ON t.oid=con.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname='public' GROUP BY con.contype ORDER BY con.contype`,
    );
    const rowCounts = await client.query<{ table_name: string; row_count: number }>(
      `SELECT relname AS table_name, (xpath('/row/c/text()', query_to_xml(
         format('SELECT count(*) AS c FROM public.%I', relname), false, true, ''
       )))[1]::text::int AS row_count
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY relname`,
    );
    const anonymousAccess = new Map<string, boolean>();
    for (const roleName of ['anon', 'authenticated'] as const) {
      await client.query('SAVEPOINT public_role_probe');
      let denied = false;
      try {
        await client.query(`SET LOCAL ROLE ${roleName}`);
      } catch {
        throw new Error(`Could not assume the ${roleName} role for its read-only permission test.`);
      }
      try {
        await client.query('SELECT id FROM public.menu_items LIMIT 1');
      } catch (error) {
        denied = typeof error === 'object' && error !== null &&
          'code' in error && error.code === '42501';
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT public_role_probe');
        await client.query('RELEASE SAVEPOINT public_role_probe');
      }
      anonymousAccess.set(roleName, denied);
    }

    const actualTables = tables.rows.map((row) => row.name);
    const runtimeRole = role.rows[0];
    const tablePrivilegeValid = privileges.rows.length === applicationTables.length &&
      privileges.rows.every((row) => {
        const expected = restrictedTableOperations.get(row.table_name) ?? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
        const granted = {
          SELECT: row.select_privilege, INSERT: row.insert_privilege,
          UPDATE: row.update_privilege, DELETE: row.delete_privilege,
        };
        return expected.every((name) => granted[name as keyof typeof granted]) &&
          Object.entries(granted).every(([name, has]) => !has || expected.includes(name)) &&
          !row.anon_access && !row.authenticated_access && !row.service_role_access;
      });
    const checks = {
      expectedTables: JSON.stringify(actualTables) === JSON.stringify(allTables),
      rlsOnAllApplicationTables: tables.rows.filter((row) => applicationTables.includes(row.name)).length === applicationTables.length &&
        tables.rows.filter((row) => applicationTables.includes(row.name)).every((row) => row.rls),
      migrationLedger: migration.rowCount === 1 &&
        migration.rows[0].version === expectedVersion &&
        migration.rows[0].checksum_sha256 === expectedChecksum,
      expectedIndexes: indexes.rowCount === expectedIndexes.length,
      rlsPolicies: policies.rowCount === applicationTables.length &&
        policies.rows.every((row) => row.policyname === 'restaurantiq_app_access' &&
          row.roles.includes('restaurantiq_app') && row.cmd === 'ALL' && row.has_using && row.has_check),
      runtimeRoleSafe: Boolean(runtimeRole?.rolcanlogin && !runtimeRole.rolsuper &&
        !runtimeRole.rolcreatedb && !runtimeRole.rolcreaterole && runtimeRole.rolinherit &&
        !runtimeRole.rolreplication && !runtimeRole.rolbypassrls && runtimeRole.app_member &&
        !runtimeRole.owns_objects && !runtimeRole.extra_membership),
      leastPrivilegeGrants: tablePrivilegeValid,
      anonDirectQueryDenied: anonymousAccess.get('anon') === true,
      authenticatedDirectQueryDenied: anonymousAccess.get('authenticated') === true,
      sequencePrivilege: sequence.rows[0]?.runtime_usage === true &&
        sequence.rows[0]?.runtime_select === true && sequence.rows[0]?.public_access === false,
      relationalConstraints: JSON.stringify(constraints.rows) === JSON.stringify([
        { type: 'c', count: 65 }, { type: 'f', count: 25 }, { type: 'p', count: 18 }, { type: 'u', count: 5 },
      ]),
      noImportedRows: rowCounts.rows.every((row) => row.table_name === 'schema_migrations'
        ? row.row_count === 1
        : row.row_count === 0),
    };
    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      checks,
      tableCount: actualTables.length,
      customIndexes: indexes.rows.map((row) => row.indexname),
      policyCount: policies.rowCount,
      constraintCounts: constraints.rows,
      rowCounts: rowCounts.rows,
      secretsPrinted: false,
    }, null, 2));
    if (Object.values(checks).some((passed) => !passed)) process.exitCode = 2;
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error('Read-only PostgreSQL verification failed; see sanitized status and review the remote catalog before proceeding.');
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error('PostgreSQL verification failed; no changes were made.');
  process.exitCode = 1;
});
