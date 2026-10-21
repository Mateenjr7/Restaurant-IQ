/**
 * Provisions the narrowly privileged login role used by the Express server.
 * This script connects only when explicitly invoked with --apply.
 */
import 'dotenv/config';
import { Client } from 'pg';
import { createPostgresTlsConfig } from './postgres-tls.ts';

const runtimeRole = 'restaurantiq_runtime';
const applicationRole = 'restaurantiq_app';
const tablePrivileges = new Map<string, string[]>([
  ['price_changes', ['SELECT', 'INSERT']],
  ['audit_events', ['SELECT', 'INSERT']],
  ['json_import_batches', ['SELECT', 'INSERT', 'UPDATE']],
]);
const applicationTables = [
  'restaurants', 'outlets', 'pricing_policies', 'protected_price_categories',
  'menu_items', 'protected_menu_items', 'daily_sales', 'competitors',
  'competitor_observations', 'menu_matches', 'inventory_items',
  'inventory_menu_items', 'pricing_recommendations', 'price_changes',
  'audit_events', 'agent_executions', 'json_import_batches',
];

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('No database connection was made. Provisioning plan:');
    console.log(`- Create LOGIN role ${runtimeRole} with no elevated PostgreSQL attributes.`);
    console.log(`- Grant membership in ${applicationRole} for the schema/table privileges defined by the migration.`);
    console.log('Review, then rerun with --apply to execute this change using MIGRATION_DATABASE_URL.');
    return;
  }

  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const runtimePassword = process.env.RUNTIME_DB_PASSWORD;
  if (!migrationUrl) throw new Error('MIGRATION_DATABASE_URL is required.');
  if (!runtimePassword || runtimePassword.length < 24 || runtimePassword.length > 256 || /[\u0000-\u001f\u007f]/.test(runtimePassword)) {
    throw new Error('Set RUNTIME_DB_PASSWORD to a unique printable password of 24 to 256 characters in the ignored local .env file.');
  }

  const client = new Client({
    ...createPostgresTlsConfig(migrationUrl),
    connectionTimeoutMillis: 10000,
    application_name: 'restaurantiq-role-provisioner',
  });

  try {
    await client.connect();
    await client.query('BEGIN');

    const roles = await client.query<{
      runtime_exists: boolean;
      app_exists: boolean;
      runtime_is_safe: boolean | null;
      is_member: boolean;
      has_other_memberships: boolean;
      owns_objects: boolean;
    }>(
      `SELECT
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS runtime_exists,
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2) AS app_exists,
         (SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
            FROM pg_roles WHERE rolname = $1) AS runtime_is_safe,
         EXISTS (
           SELECT 1 FROM pg_auth_members m
           JOIN pg_roles granted_role ON granted_role.oid = m.roleid
           JOIN pg_roles member_role ON member_role.oid = m.member
           WHERE member_role.rolname = $1 AND granted_role.rolname <> $2
         ) AS has_other_memberships,
         EXISTS (
           SELECT 1 FROM pg_shdepend d
           JOIN pg_roles r ON r.oid = d.refobjid
           WHERE r.rolname = $1 AND d.refclassid = 'pg_authid'::regclass AND d.deptype = 'o'
         ) AS owns_objects,
         CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
                AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2)
           THEN pg_has_role($1, $2, 'member')
           ELSE false
         END AS is_member`,
      [runtimeRole, applicationRole]
    );
    const roleState = roles.rows[0];
    if (!roleState.app_exists) {
      throw new Error('The schema migration must be applied before provisioning the runtime role.');
    }
    if (roleState.runtime_exists && (
      !roleState.runtime_is_safe ||
      !roleState.is_member ||
      roleState.has_other_memberships ||
      roleState.owns_objects
    )) {
      throw new Error(`Existing ${runtimeRole} role has unexpected attributes, memberships, or ownership; inspect it manually before proceeding.`);
    }
    if (!roleState.runtime_exists) {
      const roleSql = await client.query<{ statement: string }>(
        `SELECT format(
          'CREATE ROLE restaurantiq_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
          $1::text
        ) AS statement`,
        [runtimePassword]
      );
      await client.query(roleSql.rows[0].statement);
      await client.query(`GRANT ${applicationRole} TO ${runtimeRole}`);
    }

    const permissions = await client.query<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      anon_can_select: boolean;
      anon_can_insert: boolean;
      anon_can_update: boolean;
      anon_can_delete: boolean;
      authenticated_can_select: boolean;
      authenticated_can_insert: boolean;
      authenticated_can_update: boolean;
      authenticated_can_delete: boolean;
      service_role_can_select: boolean;
      service_role_can_insert: boolean;
      service_role_can_update: boolean;
      service_role_can_delete: boolean;
    }>(
      `SELECT expected.table_name,
         has_table_privilege($1::name, format('public.%I', expected.table_name), 'SELECT') AS can_select,
         has_table_privilege($1::name, format('public.%I', expected.table_name), 'INSERT') AS can_insert,
         has_table_privilege($1::name, format('public.%I', expected.table_name), 'UPDATE') AS can_update,
         has_table_privilege($1::name, format('public.%I', expected.table_name), 'DELETE') AS can_delete,
         has_table_privilege('anon', format('public.%I', expected.table_name), 'SELECT') AS anon_can_select,
         has_table_privilege('anon', format('public.%I', expected.table_name), 'INSERT') AS anon_can_insert,
         has_table_privilege('anon', format('public.%I', expected.table_name), 'UPDATE') AS anon_can_update,
         has_table_privilege('anon', format('public.%I', expected.table_name), 'DELETE') AS anon_can_delete,
         has_table_privilege('authenticated', format('public.%I', expected.table_name), 'SELECT') AS authenticated_can_select,
         has_table_privilege('authenticated', format('public.%I', expected.table_name), 'INSERT') AS authenticated_can_insert,
         has_table_privilege('authenticated', format('public.%I', expected.table_name), 'UPDATE') AS authenticated_can_update,
         has_table_privilege('authenticated', format('public.%I', expected.table_name), 'DELETE') AS authenticated_can_delete,
         has_table_privilege('service_role', format('public.%I', expected.table_name), 'SELECT') AS service_role_can_select,
         has_table_privilege('service_role', format('public.%I', expected.table_name), 'INSERT') AS service_role_can_insert,
         has_table_privilege('service_role', format('public.%I', expected.table_name), 'UPDATE') AS service_role_can_update,
         has_table_privilege('service_role', format('public.%I', expected.table_name), 'DELETE') AS service_role_can_delete
       FROM unnest($2::text[]) AS expected(table_name)
       ORDER BY expected.table_name`,
      [runtimeRole, applicationTables]
    );
    for (const row of permissions.rows) {
      const expected = tablePrivileges.get(row.table_name) ?? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
      const effective = {
        SELECT: row.can_select,
        INSERT: row.can_insert,
        UPDATE: row.can_update,
        DELETE: row.can_delete,
      };
      if (expected.some((privilege) => !effective[privilege as keyof typeof effective]) ||
          Object.entries(effective).some(([privilege, granted]) => granted && !expected.includes(privilege))) {
        throw new Error(`Effective ${runtimeRole} table privileges do not match the reviewed policy for ${row.table_name}.`);
      }
      if ([
        row.anon_can_select, row.anon_can_insert, row.anon_can_update, row.anon_can_delete,
        row.authenticated_can_select, row.authenticated_can_insert,
        row.authenticated_can_update, row.authenticated_can_delete,
        row.service_role_can_select, row.service_role_can_insert,
        row.service_role_can_update, row.service_role_can_delete,
      ].some(Boolean)) {
        throw new Error(`Anonymous or authenticated table access is present for ${row.table_name}; inspect grants before proceeding.`);
      }
    }
    if (permissions.rowCount !== applicationTables.length) {
      throw new Error('The expected application tables are incomplete; apply and verify the schema migration first.');
    }

    const sequencePermissions = await client.query<{
      runtime_usage: boolean;
      runtime_select: boolean;
      anon_usage: boolean;
      anon_select: boolean;
      authenticated_usage: boolean;
      authenticated_select: boolean;
      service_role_usage: boolean;
      service_role_select: boolean;
    }>(
      `SELECT
         has_sequence_privilege($1::name, 'public.json_import_batches_id_seq', 'USAGE') AS runtime_usage,
         has_sequence_privilege($1::name, 'public.json_import_batches_id_seq', 'SELECT') AS runtime_select,
         has_sequence_privilege('anon', 'public.json_import_batches_id_seq', 'USAGE') AS anon_usage,
         has_sequence_privilege('anon', 'public.json_import_batches_id_seq', 'SELECT') AS anon_select,
         has_sequence_privilege('authenticated', 'public.json_import_batches_id_seq', 'USAGE') AS authenticated_usage,
         has_sequence_privilege('authenticated', 'public.json_import_batches_id_seq', 'SELECT') AS authenticated_select,
         has_sequence_privilege('service_role', 'public.json_import_batches_id_seq', 'USAGE') AS service_role_usage,
         has_sequence_privilege('service_role', 'public.json_import_batches_id_seq', 'SELECT') AS service_role_select`,
      [runtimeRole]
    );
    const sequence = sequencePermissions.rows[0];
    if (!sequence.runtime_usage || !sequence.runtime_select ||
        sequence.anon_usage || sequence.anon_select ||
        sequence.authenticated_usage || sequence.authenticated_select ||
        sequence.service_role_usage || sequence.service_role_select) {
      throw new Error('Effective import-sequence privileges do not match the reviewed policy.');
    }

    const policies = await client.query<{ table_name: string; app_policy: boolean; rls_enabled: boolean }>(
      `SELECT expected.table_name,
         EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = expected.table_name
             AND p.policyname = 'restaurantiq_app_access'
             AND p.roles @> ARRAY['restaurantiq_app']::name[]
             AND p.cmd = 'ALL' AND p.qual IS NOT NULL AND p.with_check IS NOT NULL
         ) AS app_policy,
         COALESCE(c.relrowsecurity, false) AS rls_enabled
       FROM unnest($1::text[]) AS expected(table_name)
       LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', expected.table_name))
       ORDER BY expected.table_name`,
      [applicationTables]
    );
    if (policies.rowCount !== applicationTables.length ||
        policies.rows.some((row) => !row.app_policy || !row.rls_enabled)) {
      throw new Error('Application-table RLS policies do not match the reviewed schema migration.');
    }

    await client.query('COMMIT');
    console.log(`Provisioned ${runtimeRole} with least-privilege membership in ${applicationRole}.`);
    console.log('Set DATABASE_URL to a connection string authenticated as this role. No credential was printed.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Runtime-role provisioning failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
