import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ClientConfig } from 'pg';

const defaultCertificatePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'certs',
  'prod-ca-2021.crt',
);
const sslQueryParameters = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslpassword'];

export function createPostgresTlsConfig(connectionString: string): Pick<ClientConfig, 'connectionString' | 'ssl'> {
  let connectionUrl: URL;
  try {
    connectionUrl = new URL(connectionString);
  } catch {
    throw new Error('The PostgreSQL connection URL is invalid.');
  }

  if (connectionUrl.protocol !== 'postgres:' && connectionUrl.protocol !== 'postgresql:') {
    throw new Error('The database URL must use the PostgreSQL protocol.');
  }

  if (sslQueryParameters.some((parameter) => connectionUrl.searchParams.has(parameter))) {
    throw new Error('Remove SSL query parameters from the database URL; TLS is configured using the Supabase CA certificate.');
  }

  const configuredPath = process.env.SUPABASE_CA_CERT_PATH;
  const certificatePath = configuredPath
    ? path.resolve(configuredPath)
    : defaultCertificatePath;

  let ca: string;
  try {
    ca = fs.readFileSync(certificatePath, 'utf8');
  } catch {
    throw new Error('The Supabase CA certificate could not be read. Set SUPABASE_CA_CERT_PATH to its local file path.');
  }

  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(ca);
  } catch {
    throw new Error('The Supabase CA certificate is not a valid PEM-encoded X.509 certificate.');
  }

  const now = Date.now();
  if (
    !certificate.ca ||
    Date.parse(certificate.validFrom) > now ||
    Date.parse(certificate.validTo) <= now
  ) {
    throw new Error('The Supabase CA certificate must be a currently valid CA certificate.');
  }

  return {
    connectionString,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: connectionUrl.hostname,
      checkServerIdentity: tls.checkServerIdentity,
    },
  };
}
