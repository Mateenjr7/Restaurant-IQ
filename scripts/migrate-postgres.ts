/**
 * Applies versioned SQL migrations. Dry-run is the default; --apply is required
 * to connect and execute changes against the configured project.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { createPostgresTlsConfig } from './postgres-tls.ts';

const projectRef = 'idackzrtqfvuppwvuksu';
const migrationsDirectory = path.resolve(process.cwd(), 'supabase', 'migrations');
const advisoryLock = [7419021, 1] as const;

function assertExpectedProject(connectionString: string) {
  const url = new URL(connectionString);
  const username = decodeURIComponent(url.username);
  if (!url.hostname.includes(projectRef) && !username.includes(projectRef)) {
    throw new Error('MIGRATION_DATABASE_URL does not identify the configured RestaurantIQ Supabase project.');
  }
}

async function main() {
  const files = fs.readdirSync(migrationsDirectory)
    .filter((file) => /^\d{12}_[a-z0-9_]+\.sql$/.test(file))
    .sort();
  if (!files.length) throw new Error('No versioned SQL migration files were found.');

  const migrations = files.map((file) => {
    const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
    return {
      version: file.replace(/\.sql$/, ''),
      sql,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
    };
  });
  const apply = process.argv.includes('--apply');
  console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
  for (const migration of migrations) {
    console.log(`${migration.version} sha256=${migration.checksum}`);
  }
  if (!apply) {
    console.log('No database connection was made. Review the migration files, then use --apply only after explicit approval.');
    return;
  }

  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required for --apply.');
  assertExpectedProject(connectionString);

  const client = new Client({
    ...createPostgresTlsConfig(connectionString),
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    query_timeout: 35000,
    application_name: 'restaurantiq-schema-migrator',
  });

  try {
    await client.connect();
    for (const migration of migrations) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [...advisoryLock]);
        const ledgerExists = await client.query<{ exists: boolean }>(
          `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`
        );
        if (ledgerExists.rows[0].exists) {
          const recorded = await client.query<{ checksum_sha256: string }>(
            'SELECT checksum_sha256 FROM public.schema_migrations WHERE version = $1',
            [migration.version]
          );
          if (recorded.rowCount) {
            if (recorded.rows[0].checksum_sha256 !== migration.checksum) {
              throw new Error(`Migration ${migration.version} has already been applied with a different checksum. Add a new migration instead of editing applied SQL.`);
            }
            await client.query('COMMIT');
            console.log(`Already applied: ${migration.version}`);
            continue;
          }
        } else if (migration.version !== '202610220001_initial_restaurantiq_schema') {
          throw new Error('Migration ledger is absent before a non-initial migration; stop and inspect the database schema.');
        }

        await client.query(migration.sql);
        await client.query(
          `INSERT INTO public.schema_migrations (version, checksum_sha256) VALUES ($1, $2)`,
          [migration.version, migration.checksum]
        );
        await client.query('COMMIT');
        console.log(`Applied: ${migration.version}`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
  } catch (error) {
    console.error('Migration failed; transaction rolled back. Review the database before retrying.');
    if (error instanceof Error && /different checksum|ledger is absent|does not identify/.test(error.message)) {
      console.error(error.message);
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error('Migration preflight failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
