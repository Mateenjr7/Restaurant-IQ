import assert from 'node:assert/strict';
import { validatePostgresTestTarget } from './postgres-test-target.ts';

const baseEnvironment = {
  RESTAURANTIQ_TEST_DATABASE_DISPOSABLE: 'true',
  TEST_DATABASE_URL: 'postgresql://restaurantiq_test:test-only@127.0.0.1:5432/restaurantiq_test',
  DATABASE_URL: 'postgresql://restaurantiq_runtime.idackzrtqfvuppwvuksu:runtime@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  MIGRATION_DATABASE_URL: 'postgresql://postgres.idackzrtqfvuppwvuksu:migration@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
};

assert.equal(validatePostgresTestTarget(baseEnvironment).kind, 'local');
assert.equal(validatePostgresTestTarget({
  ...baseEnvironment,
  TEST_DATABASE_URL: 'postgresql://restaurantiq_runtime.abcdefghijklmnopqrst@test-pooler.pooler.supabase.com:5432/postgres',
}).kind, 'remote');
assert.equal(validatePostgresTestTarget({
  ...baseEnvironment,
  DATABASE_URL: baseEnvironment.TEST_DATABASE_URL,
}, { allowRuntimeMatch: true }).kind, 'local');
assert.equal(validatePostgresTestTarget({
  ...baseEnvironment,
  DATABASE_URL: baseEnvironment.TEST_DATABASE_URL,
  MIGRATION_DATABASE_URL: undefined,
}, { allowRuntimeMatch: true }).kind, 'local');
assert.throws(
  () => validatePostgresTestTarget({ ...baseEnvironment, TEST_DATABASE_URL: undefined }),
  /TEST_DATABASE_URL/,
);
assert.throws(
  () => validatePostgresTestTarget({
    ...baseEnvironment,
    TEST_DATABASE_URL: baseEnvironment.DATABASE_URL,
  }),
  /separate/,
);
assert.throws(
  () => validatePostgresTestTarget({
    ...baseEnvironment,
    TEST_DATABASE_URL: 'postgresql://restaurantiq_runtime.idackzrtqfvuppwvuksu@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  }),
  /separate|remote test target/,
);
assert.throws(
  () => validatePostgresTestTarget({
    ...baseEnvironment,
    TEST_DATABASE_URL: 'postgresql://restaurantiq_test:test-only@127.0.0.1:5432/postgres',
  }),
  /local test target/,
);
assert.throws(
  () => validatePostgresTestTarget({
    ...baseEnvironment,
    RESTAURANTIQ_TEST_DATABASE_DISPOSABLE: undefined,
  }),
  /DISPOSABLE/,
);
assert.throws(
  () => validatePostgresTestTarget({
    ...baseEnvironment,
    TEST_DATABASE_URL: 'not-a-postgresql-url',
  }),
  /Valid TEST_DATABASE_URL/,
);

console.log('PostgreSQL test-target validation: 10/10 passed (offline; no connection attempted).');
