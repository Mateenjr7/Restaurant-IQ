/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function runReleaseGate() {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurantiq-tests-'));
  process.env.PERSISTENCE_MODE = 'json';
  process.env.RESTAURANTIQ_DATA_FILE = path.join(testDirectory, 'restaurantiq-data.json');
  process.env.RESTAURANTIQ_BACKUP_FILE = path.join(testDirectory, 'backup-restaurantiq.json');

  try {
    const [
      { runPricingEngineTests },
      { runForecastingTests },
      { runPersistenceAndSecurityTests },
      { runCustomerTrustTests },
      { runMetricsSecurityTests },
    ] = await Promise.all([
      import('./test-pricing-engine.ts'),
      import('./test-forecasting.ts'),
      import('./test-persistence-security.ts'),
      import('./test-customer-trust.ts'),
      import('./test-metrics.ts'),
    ]);

    console.log('====================================================');
    console.log('    RESTAURANTIQ ENTERPRISE RELEASE GATE TESTS     ');
    console.log('====================================================\n');

    const pricingResults = runPricingEngineTests();
    const forecastingResults = runForecastingTests();
    const persistenceResults = await runPersistenceAndSecurityTests();
    const trustResults = runCustomerTrustTests();
    const metricsResults = runMetricsSecurityTests();

    const totalPassed = pricingResults.passed + forecastingResults.passed + persistenceResults.passed + trustResults.passed + metricsResults.passed;
    const totalTests = pricingResults.total + forecastingResults.total + persistenceResults.total + trustResults.total + metricsResults.total;
    if (totalPassed !== totalTests) {
      throw new Error(`Release gate failed: ${totalTests - totalPassed} of ${totalTests} assertions failed.`);
    }

    console.log('====================================================');
    console.log(`ALL TEST SUITES COMPLETED: ${totalPassed}/${totalTests} TESTS PASSED.`);
    console.log('RELEASE GATE: PASSED ✅');
    console.log('====================================================');
  } finally {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
}

runReleaseGate().catch((error: unknown) => {
  console.error('\nRELEASE GATE FAILED ❌:', error instanceof Error ? error.message : 'Unknown test failure');
  process.exitCode = 1;
});
