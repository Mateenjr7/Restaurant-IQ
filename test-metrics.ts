import {
  isMetricsAuthorizationValid,
  normalizeHttpMethod,
} from './server/metrics.ts';

export function runMetricsSecurityTests(): { passed: number; total: number } {
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`PASS: ${name}`);
    } else {
      console.error(`FAIL: ${name}`);
    }
  }

  assert(
    isMetricsAuthorizationValid('Bearer a-valid-private-token', 'a-valid-private-token'),
    'Accepts the configured bearer token'
  );
  assert(
    !isMetricsAuthorizationValid('a-valid-private-token', 'a-valid-private-token'),
    'Rejects a token without the Bearer scheme'
  );
  assert(
    !isMetricsAuthorizationValid('Bearer wrong-token', 'a-valid-private-token'),
    'Rejects an incorrect bearer token'
  );
  assert(
    !isMetricsAuthorizationValid('Bearer a-valid-private-token', undefined),
    'Rejects requests when the server token is not configured'
  );
  assert(
    normalizeHttpMethod('GET') === 'GET',
    'Preserves standard HTTP method labels'
  );
  assert(
    normalizeHttpMethod('CUSTOM-VERB-123') === 'OTHER',
    'Collapses nonstandard methods to bound metric cardinality'
  );

  return { passed, total };
}
