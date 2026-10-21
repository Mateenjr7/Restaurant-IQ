const productionProjectRef = 'idackzrtqfvuppwvuksu';
const postgresProtocols = new Set(['postgres:', 'postgresql:']);

function parsePostgresUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!postgresProtocols.has(url.protocol)) return undefined;
    decodeURIComponent(url.username);
    decodeURIComponent(url.pathname);
    return url;
  } catch {
    return undefined;
  }
}

function endpointKey(url: URL) {
  const username = decodeURIComponent(url.username);
  const projectRef = username.match(/\.([a-z0-9]{20})$/)?.[1] ?? '';
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${decodeURIComponent(url.pathname)}:${projectRef}`;
}

export function validatePostgresTestTarget(
  environment: NodeJS.ProcessEnv,
  options: { allowRuntimeMatch?: boolean } = {},
) {
  if (environment.RESTAURANTIQ_TEST_DATABASE_DISPOSABLE !== 'true') {
    throw new Error('Set RESTAURANTIQ_TEST_DATABASE_DISPOSABLE=true only for a verified disposable test database.');
  }

  const testUrl = parsePostgresUrl(environment.TEST_DATABASE_URL);
  const runtimeUrl = parsePostgresUrl(environment.DATABASE_URL);
  const migrationUrl = parsePostgresUrl(environment.MIGRATION_DATABASE_URL);
  if (!testUrl || !runtimeUrl || (!migrationUrl && !options.allowRuntimeMatch)) {
    throw new Error('Valid TEST_DATABASE_URL, DATABASE_URL, and MIGRATION_DATABASE_URL values are required; no database connection was attempted.');
  }

  if ((!options.allowRuntimeMatch && endpointKey(testUrl) === endpointKey(runtimeUrl)) ||
      (migrationUrl && endpointKey(testUrl) === endpointKey(migrationUrl))) {
    throw new Error('The test database must be separate from both runtime and migration database endpoints.');
  }

  const databaseName = decodeURIComponent(testUrl.pathname.slice(1));
  const username = decodeURIComponent(testUrl.username);
  const isLoopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(testUrl.hostname.toLowerCase());
  if (isLoopback) {
    if (databaseName !== 'restaurantiq_test' || username !== 'restaurantiq_test') {
      throw new Error('A local test target must use the restaurantiq_test database and role.');
    }
    return { connectionString: environment.TEST_DATABASE_URL!, kind: 'local' as const };
  }

  const projectRef = username.match(/^restaurantiq_runtime\.([a-z0-9]{20})$/)?.[1];
  if (
    !testUrl.hostname.endsWith('.pooler.supabase.com') ||
    databaseName !== 'postgres' ||
    !projectRef ||
    projectRef === productionProjectRef
  ) {
    throw new Error('A remote test target must be a separate Supabase project using its restricted runtime role.');
  }

  return { connectionString: environment.TEST_DATABASE_URL!, kind: 'remote' as const };
}
