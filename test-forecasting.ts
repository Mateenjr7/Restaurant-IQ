/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateDemandForecast } from './server/forecasting.ts';
import { db } from './server/db.ts';

export function runForecastingTests(): { passed: number; total: number } {
  console.log('=== RUNNING RESTAURANTIQ DEMAND FORECASTING TESTS ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? ' -> ' + detail : ''}`);
    }
  }

  // 1. Forecast on item with full 60-day historical time series (item-1: Biryani)
  const forecast1 = generateDemandForecast('item-1');

  assert(forecast1.menuItemId === 'item-1', 'Test 1: Generates forecast for specified item ID');
  assert(forecast1.next7DaysForecast.length === 7, 'Test 1: Produces 7-day forward forecast horizon');
  assert(forecast1.isEstimate === true, 'Test 1: Explicitly labels forecast as estimate');
  assert(forecast1.mae !== null && forecast1.mae > 0, `Test 1: Calculates genuine MAE from out-of-sample residuals (MAE=${forecast1.mae})`);
  assert(forecast1.rmse !== null && forecast1.rmse > 0, `Test 1: Calculates genuine RMSE from out-of-sample residuals (RMSE=${forecast1.rmse})`);
  assert(forecast1.rmse! >= forecast1.mae!, 'Test 1: Mathematical invariant: RMSE >= MAE always holds');
  assert(forecast1.validationStatus.includes('held-out'), 'Test 1: Documents held-out out-of-sample validation split');
  assert(forecast1.assumptions.length >= 3, 'Test 1: Discloses model assumptions');
  assert(forecast1.hasForecastData, 'Test 1: Reports when usable forecast data exists');
  assert(forecast1.isSyntheticDemoData, 'Test 1: Clearly identifies seeded forecast data as synthetic');

  // Verify prediction interval bounds: lowerBound <= forecastedOrders <= upperBound
  const allBoundsValid = forecast1.next7DaysForecast.every(
    (p) => p.lowerBound <= p.forecastedOrders && p.forecastedOrders <= p.upperBound
  );
  assert(allBoundsValid, 'Test 1: Prediction intervals enclose forecasted orders for all 7 days');

  // Verify bounds widen as horizon extends (h=7 margin >= h=1 margin)
  const marginDay1 = forecast1.next7DaysForecast[0].upperBound - forecast1.next7DaysForecast[0].forecastedOrders;
  const marginDay7 = forecast1.next7DaysForecast[6].upperBound - forecast1.next7DaysForecast[6].forecastedOrders;
  assert(marginDay7 >= marginDay1, 'Test 1: Forecast uncertainty widens over time horizon');

  const fullHistoryItem = db.menuItems.find((item) => item.id === 'item-1')!;
  const originalHistory = fullHistoryItem.dailySalesHistory;
  fullHistoryItem.dailySalesHistory = [...(originalHistory || [])].reverse();
  const reverseHistoryForecast = generateDemandForecast('item-1');
  assert(
    reverseHistoryForecast.next7DaysForecast.every(
      (point, index) => point.forecastedOrders === forecast1.next7DaysForecast[index].forecastedOrders
    ),
    'Test 1: Forecast sorts historical observations chronologically before fitting'
  );
  fullHistoryItem.dailySalesHistory = originalHistory;

  let missingItemRejected = false;
  try {
    generateDemandForecast('missing-menu-item');
  } catch {
    missingItemRejected = true;
  }
  assert(missingItemRejected, 'Test 1: Unknown menu item does not silently forecast the first catalog item');

  // 2. Insufficient History Test: Item with < 14 observations must report "Validation metrics unavailable"
  // Temporarily push a test item with only 5 days of history
  const testItemShort = {
    id: 'item-test-short',
    name: 'Experimental Seasonal Drink',
    description: 'Limited seasonal beverage with only 5 days of order history.',
    category: 'Beverages & Desserts' as const,
    sku: 'TST-SH-001',
    currentPrice: 120,
    ingredientCost: 40,
    packagingCost: 10,
    totalVariableCost: 50,
    minContribution: 30,
    minPolicyPrice: 80,
    maxPolicyPrice: 200,
    inventoryQty: 30,
    reorderThreshold: 10,
    status: 'active' as const,
    demandTrend: 'steady' as const,
    portionGrams: 300,
    lastUpdated: new Date().toISOString(),
    historicalSalesLast30Days: 80,
    dailySalesHistory: [
      { date: '2026-10-16', dayOfWeek: 'Fri', orders: 18, revenue: 2160 },
      { date: '2026-10-17', dayOfWeek: 'Sat', orders: 22, revenue: 2640 },
      { date: '2026-10-18', dayOfWeek: 'Sun', orders: 20, revenue: 2400 },
      { date: '2026-10-19', dayOfWeek: 'Mon', orders: 12, revenue: 1440 },
      { date: '2026-10-20', dayOfWeek: 'Tue', orders: 14, revenue: 1680 },
    ],
  };
  db.menuItems.push(testItemShort);

  const forecastShort = generateDemandForecast('item-test-short');
  assert(forecastShort.mae === null, 'Test 2: MAE is strictly null when historical observations < 14');
  assert(forecastShort.rmse === null, 'Test 2: RMSE is strictly null when historical observations < 14');
  assert(
    forecastShort.validationStatus.includes('Validation metrics unavailable'),
    'Test 2: Reports "Validation metrics unavailable" when historical data is insufficient'
  );
  assert(forecastShort.isEstimate === true, 'Test 2: Labels baseline forecast as estimate');
  assert(
    forecastShort.modelType.includes('Heuristic Day-of-Week Seasonality Baseline'),
    'Test 2: Correctly identifies model type as Heuristic Baseline when data is insufficient'
  );

  const testItemNoSales = {
    ...testItemShort,
    id: 'item-test-no-sales',
    name: 'Untracked Test Item',
    historicalSalesLast30Days: 0,
    dailySalesHistory: [],
  };
  db.menuItems.push(testItemNoSales);
  const noSalesForecast = generateDemandForecast(testItemNoSales.id);
  assert(!noSalesForecast.hasForecastData, 'Test 3: Marks forecasts unavailable when no order baseline exists');
  assert(noSalesForecast.next7DaysForecast.length === 0, 'Test 3: Does not fabricate forecast values for missing data');

  // Clean up test item
  db.menuItems = db.menuItems.filter((item) => !['item-test-short', 'item-test-no-sales'].includes(item.id));

  console.log(`\nResults: ${passed}/${total} forecasting tests passed.`);
  if (passed === total) {
    console.log('🎉 ALL DEMAND FORECASTING TESTS PASSED SUCCESSFULLY!\n');
    return { passed, total };
  } else {
    console.error('❌ SOME DEMAND FORECASTING TESTS FAILED!\n');
    throw new Error(`${total - passed} tests failed in forecasting`);
  }
}

// Execute if run directly
runForecastingTests();
