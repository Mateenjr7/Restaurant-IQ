import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createPostgresTlsConfig } from './postgres-tls.ts';

const projectRef = 'idackzrtqfvuppwvuksu';
const sessionPoolerHost = 'aws-0-ap-northeast-1.pooler.supabase.com';
const expectedChecksum = 'b9d568b5f1a47728d68d298b18f4b0e5a0baa81ed79c14c65a22ca9c9fcc6882';

function checkUrl(value: string | undefined, role: 'migration' | 'runtime') {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== sessionPoolerHost ||
        decodeURIComponent(url.pathname.slice(1)) !== 'postgres' ||
        ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslpassword']
          .some((key) => url.searchParams.has(key))) return false;
    const expectedUser = role === 'migration'
      ? `postgres.${projectRef}`
      : `restaurantiq_runtime.${projectRef}`;
    return decodeURIComponent(url.username) === expectedUser && Boolean(url.password);
  } catch {
    return false;
  }
}

try {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  const migrationFile = path.resolve('supabase', 'migrations', '202610220001_initial_restaurantiq_schema.sql');
  const migrationHash = crypto.createHash('sha256').update(fs.readFileSync(migrationFile)).digest('hex');
  const tlsConfig = migrationUrl ? createPostgresTlsConfig(migrationUrl) : null;
  const sslOptions = tlsConfig && typeof tlsConfig.ssl === 'object' ? tlsConfig.ssl : null;
  const checks = {
    persistenceMode: process.env.PERSISTENCE_MODE === 'postgres',
    migrationUrl: checkUrl(migrationUrl, 'migration'),
    runtimeUrl: checkUrl(runtimeUrl, 'runtime'),
    runtimePassword: Boolean(
      process.env.RUNTIME_DB_PASSWORD &&
      process.env.RUNTIME_DB_PASSWORD.length >= 24 &&
      process.env.RUNTIME_DB_PASSWORD.length <= 256 &&
      !/[\u0000-\u001f\u007f]/.test(process.env.RUNTIME_DB_PASSWORD),
    ),
    migrationAndRuntimeCredentialsSeparated: Boolean(
      migrationUrl && runtimeUrl &&
      new URL(migrationUrl).username !== new URL(runtimeUrl).username,
    ),
    verifiedCaLoaded: Boolean(sslOptions?.ca),
    tlsVerificationEnabled: sslOptions?.rejectUnauthorized === true,
    hostnameVerificationEnabled: Boolean(sslOptions?.servername),
    migrationChecksum: migrationHash === expectedChecksum,
  };
  console.log(JSON.stringify({ checks, connectionAttempted: false }));
  if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
} catch {
  console.log(JSON.stringify({ status: 'preflight_failed', secretsPrinted: false, connectionAttempted: false }));
  process.exitCode = 1;
}
