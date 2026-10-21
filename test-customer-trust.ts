/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { RestaurantDatabase } from './server/db.ts';
import { evaluatePriceStability } from './server/pricing-engine.ts';
import { MenuItem, PricingRecommendation } from './server/types.ts';

export function runCustomerTrustTests(): { passed: number; total: number } {
  console.log('=== RUNNING CUSTOMER TRUST & PRICE STABILITY TESTS ===\n');
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ PASS: ${name}`);
    } else {
      console.error(`❌ FAIL: ${name}`);
    }
  };

  const now = new Date('2026-10-21T12:00:00.000Z');
  const policy = {
    maxIncreasePct: 0.15,
    maxDecreasePct: 0.15,
    minimumDaysBetweenPriceChanges: 7,
    cumulativeIncreaseLimitPct: 0.2,
    cumulativeIncreaseWindowDays: 30,
    warningThresholdPct: 0.1,
    isProtected: false,
  };
  const history = (previousPrice: number, newPrice: number, daysAgo: number) => ({
    id: `${previousPrice}-${newPrice}-${daysAgo}`,
    menuItemId: 'trust-test',
    menuItemName: 'Trust test item',
    previousPrice,
    newPrice,
    changedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
    actor: 'test',
    source: 'recommendation' as const,
    rationale: 'Test event',
  });

  assert(!evaluatePriceStability(100, 115, [], policy, now).blocked, 'Allows increase exactly at the rounded per-change boundary');
  assert(evaluatePriceStability(100, 116, [], policy, now).blocked, 'Blocks rounded final price above the per-change increase limit');
  assert(!evaluatePriceStability(100, 85, [], policy, now).blocked, 'Allows decrease exactly at the configured decrease boundary');
  assert(evaluatePriceStability(100, 84, [], policy, now).blocked, 'Blocks decrease below configured boundary');

  const repeatedSmallIncreases = [history(100, 110, 20), history(110, 121, 10)];
  assert(
    evaluatePriceStability(121, 122.21, repeatedSmallIncreases, policy, now).blocked,
    'Blocks repeated small increases that exceed cumulative rolling limit'
  );
  assert(
    !evaluatePriceStability(121, 122.21, [history(100, 110, 50)], policy, now).blocked,
    'Excludes actual price changes older than the rolling window'
  );
  assert(
    evaluatePriceStability(110, 109, [history(100, 110, 2)], policy, now).blocked,
    'Enforces minimum days between actual changes including decreases'
  );
  assert(
    evaluatePriceStability(100, 101, [], { ...policy, isProtected: true }, now).blocked,
    'Stable-price protection blocks movement for selected protected items'
  );
  assert(
    evaluatePriceStability(100, 100, [], policy, now).status === 'insufficient_data',
    'Reports insufficient data rather than inferring historical stability'
  );

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurantiq-trust-'));
  const dataFile = path.join(testRoot, 'trust-data.json');
  const backupFile = path.join(testRoot, 'trust-backup.json');
  try {
    const db = new RestaurantDatabase(dataFile, backupFile);
    const item: MenuItem = {
      id: 'trust-policy-test-item',
      name: 'Trust policy test item',
      description: 'Test fixture',
      category: 'Biryani & Rice',
      sku: 'TRUST-TEST',
      currentPrice: 200,
      ingredientCost: 15,
      packagingCost: 5,
      totalVariableCost: 20,
      minContribution: 20,
      minPolicyPrice: 30,
      maxPolicyPrice: 700,
      inventoryQty: 10,
      reorderThreshold: 2,
      status: 'active',
      demandTrend: 'steady',
      portionGrams: 300,
      lastUpdated: now.toISOString(),
      historicalSalesLast30Days: 0,
    };
    db.menuItems.push(item);
    db.policy.maxIncreasePct = 0.1;
    db.policy.maxDecreasePct = 0.1;
    db.policy.maxMovementPct = 0.1;
    db.policy.minimumDaysBetweenPriceChanges = 7;
    db.policy.cumulativeIncreaseLimitPct = 0.2;
    db.policy.protectedMenuItemIds = [item.id];
    db.saveToDisk();

    const recommendation: PricingRecommendation = {
      id: 'trust-test-recommendation',
      menuItemId: item.id,
      menuItemName: item.name,
      category: item.category,
      currentPrice: 200,
      suggestedPrice: 210,
      priceDelta: 10,
      priceDeltaPct: 5,
      variableCost: item.totalVariableCost,
      currentContribution: 100,
      suggestedContribution: 108,
      currentContributionMarginPct: 50,
      suggestedContributionMarginPct: 51,
      competitorMedian: 210,
      demandIndex: 1,
      inventoryRatio: 1,
      confidenceScore: 0.8,
      status: 'pending',
      reason: 'Test recommendation',
      economicFloor: 52,
      policyFloor: 52,
      policyCeiling: item.maxPolicyPrice,
      policyChecksPassed: true,
      isBlocked: false,
      requiresStepOverride: false,
      constraintStatus: 'ok',
      flagReasons: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    db.policy.protectedMenuItemIds = [];
    db.recommendations.push(recommendation);
    db.approveRecommendation(recommendation.id, 'Revenue Manager');
    const result = db.applyRecommendation(recommendation.id, 'Revenue Manager');
    assert(result.menuItem.currentPrice === 210, 'Approved recommendation applies after mandatory policy revalidation');
    assert(db.priceChanges.length === 1 && db.priceChanges[0].source === 'recommendation', 'Successful application records actual applied-price history');
    assert(db.auditEvents.some((event) => event.action === 'PRICE_APPLIED' && event.menuItemId === item.id), 'Successful application creates an audit record');

    let duplicateBlocked = false;
    try {
      db.applyRecommendation(recommendation.id, 'Revenue Manager');
    } catch {
      duplicateBlocked = true;
    }
    assert(duplicateBlocked, 'Prevents duplicate application of an already-applied recommendation');

    const stale: PricingRecommendation = {
      ...recommendation,
      id: 'trust-test-stale-recommendation',
      currentPrice: 210,
      suggestedPrice: 215,
      status: 'pending',
    };
    db.recommendations.push(stale);
    item.currentPrice = 211;
    let staleBlocked = false;
    try {
      db.approveRecommendation(stale.id, 'Revenue Manager');
    } catch (error) {
      staleBlocked = error instanceof Error && error.message.includes('stale');
    }
    assert(staleBlocked, 'Rejects stale recommendation approval when current applied price has changed');
    item.currentPrice = 210;

    let overrideBlocked = false;
    try {
      db.overridePrice(item.id, 240, 'Test movement limit override', 'Administrator');
    } catch (error) {
      overrideBlocked = error instanceof Error && error.message.includes('price stability policy');
    }
    assert(overrideBlocked, 'Manual admin overrides cannot bypass stability movement limits');

    db.policy.cumulativeIncreaseLimitPct = 0.06;
    const dashboard = db.getCustomerTrustDashboard();
    const assessment = dashboard.assessments.find((entry) => entry.menuItemId === item.id);
    assert(assessment?.lastActualPriceChangeAt === db.priceChanges[0].changedAt, 'Dashboard reports the actual application timestamp');
    assert(assessment?.customerTrustRisk.riskLevel === 'medium', 'Risk assessment uses recorded applied-price history and discloses limitations');

    db.policy.protectedMenuItemIds = [item.id];
    db.saveToDisk();
    const restarted = new RestaurantDatabase(dataFile, backupFile);
    assert(restarted.priceChanges.length === 1 && restarted.priceChanges[0].newPrice === 210, 'Actual price-change history persists across database restart');
    assert(restarted.policy.maxIncreasePct === 0.1 && restarted.policy.protectedMenuItemIds.includes(item.id), 'Pricing limits and protected-item settings persist across restart');
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  console.log(`\nResults: ${passed}/${total} customer trust tests passed.\n`);
  if (passed !== total) throw new Error(`${total - passed} customer trust regression test(s) failed`);
  return { passed, total };
}
