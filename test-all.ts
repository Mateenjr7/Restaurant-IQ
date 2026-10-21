/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runPricingEngineTests } from './test-pricing-engine.ts';
import { runForecastingTests } from './test-forecasting.ts';
import { runPersistenceAndSecurityTests } from './test-persistence-security.ts';
import { runCustomerTrustTests } from './test-customer-trust.ts';

async function runReleaseGate() {
  console.log('====================================================');
  console.log('    RESTAURANTIQ ENTERPRISE RELEASE GATE TESTS     ');
  console.log('====================================================\n');

  const pricingResults = runPricingEngineTests();
  const forecastingResults = runForecastingTests();
  const persistenceResults = await runPersistenceAndSecurityTests();
  const trustResults = runCustomerTrustTests();

  const totalPassed = pricingResults.passed + forecastingResults.passed + persistenceResults.passed + trustResults.passed;
  const totalTests = pricingResults.total + forecastingResults.total + persistenceResults.total + trustResults.total;
  if (totalPassed !== totalTests) {
    throw new Error(`Release gate failed: ${totalTests - totalPassed} of ${totalTests} assertions failed.`);
  }

  console.log('====================================================');
  console.log(`ALL TEST SUITES COMPLETED: ${totalPassed}/${totalTests} TESTS PASSED.`);
  console.log('RELEASE GATE: PASSED ✅');
  console.log('====================================================');
}

runReleaseGate().catch((err: any) => {
  console.error('\nRELEASE GATE FAILED ❌:', err?.message || err);
  process.exit(1);
});
