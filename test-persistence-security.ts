/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RestaurantDatabase, db } from './server/db.ts';
import {
  signToken,
  verifyToken,
  ROLE_PERMISSIONS,
  DEMO_ACCOUNTS,
  initializeAuthSecret,
} from './server/auth.ts';

export async function runPersistenceAndSecurityTests(): Promise<{ passed: number; total: number }> {
  console.log('=== RUNNING RESTAURANTIQ PERSISTENCE & SECURITY TESTS ===\n');
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

  initializeAuthSecret();
  const runId = Date.now();

  // 1. Storage Health & File Persistence Verification
  const health = db.getStorageHealth();
  assert(health.status === 'healthy', 'Test 1: Storage health reports healthy status');
  assert(health.persistedToDisk === true, 'Test 1: Database confirms active persistence to disk');
  assert(health.fileSizeBytes > 0, `Test 1: Persistence file exists on disk (${health.fileSizeBytes} bytes)`);
  assert(health.schemaVersion === '1.5.0', 'Test 1: Schema version 1.5.0 confirmed');

  // 2. State Mutation & Server Restart Survival Test
  const testSKU = `SKU-PERSIST-${runId}`;
  const testItemId = `item-persist-${runId}`;
  const testItem = {
    id: testItemId,
    name: 'Persistent Hyderabadi Dum Biryani Special',
    description: 'Test dish to verify persistence survival across server restart cycle.',
    category: 'Biryani & Rice' as const,
    sku: testSKU,
    currentPrice: 380,
    ingredientCost: 190,
    packagingCost: 15,
    totalVariableCost: 205,
    minContribution: 80,
    minPolicyPrice: 285,
    maxPolicyPrice: 550,
    inventoryQty: 50,
    reorderThreshold: 20,
    status: 'active' as const,
    demandTrend: 'steady' as const,
    portionGrams: 550,
    lastUpdated: new Date().toISOString(),
    historicalSalesLast30Days: 450,
  };

  db.menuItems.unshift(testItem);
  db.saveToDisk();

  // Simulate server reboot by instantiating a completely new RestaurantDatabase instance from disk
  const restartedDb = new RestaurantDatabase();
  const recoveredItem = restartedDb.menuItems.find((m) => m.sku === testSKU);

  assert(recoveredItem !== undefined, 'Test 2: Newly created item survives simulated server restart');
  assert(recoveredItem?.currentPrice === 380, 'Test 2: Recovered item retains correct persisted price (₹380)');

  // 3. Approval Safeguards: Cannot approve a blocked recommendation
  const blockedRecId = `rec-test-blocked-${runId}`;
  const blockedRec = {
    id: blockedRecId,
    menuItemId: testItemId,
    menuItemName: testItem.name,
    category: testItem.category,
    currentPrice: 380,
    suggestedPrice: 380,
    priceDelta: 0,
    priceDeltaPct: 0,
    variableCost: 205,
    currentContribution: 175,
    suggestedContribution: 175,
    currentContributionMarginPct: 46.1,
    suggestedContributionMarginPct: 46.1,
    competitorMedian: 380,
    demandIndex: 1.0,
    inventoryRatio: 1.0,
    confidenceScore: 0.1,
    status: 'pending' as const,
    reason: 'BLOCKED: Effective economic floor exceeds policy ceiling.',
    economicFloor: 600, // Floor > Ceiling!
    policyFloor: 600,
    policyCeiling: 550,
    policyChecksPassed: false,
    isBlocked: true,
    requiresStepOverride: false,
    constraintStatus: 'blocked_policy_conflict' as const,
    flagReasons: ['BLOCKED: Effective economic floor (₹600) exceeds policy ceiling (₹550).'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  restartedDb.recommendations.push(blockedRec);

  let blockedApprovalThrew = false;
  try {
    restartedDb.approveRecommendation(blockedRecId, 'Revenue Manager');
  } catch (err: any) {
    blockedApprovalThrew = true;
    assert(err.message.includes('Approval blocked'), 'Test 3: Blocked recommendation throws descriptive block error');
  }
  assert(blockedApprovalThrew === true, 'Test 3: Enforces prohibition against approving blocked recommendation');

  // 4. Approval Safeguards: Explicit overrides cannot bypass mandatory movement limits
  const stepBreachRecId = `rec-test-step-breach-${runId}`;
  const stepBreachRec = {
    id: stepBreachRecId,
    menuItemId: testItemId,
    menuItemName: testItem.name,
    category: testItem.category,
    currentPrice: 380,
    suggestedPrice: 450,
    priceDelta: 70,
    priceDeltaPct: 18.4,
    variableCost: 210,
    currentContribution: -10,
    suggestedContribution: 50,
    currentContributionMarginPct: -5,
    suggestedContributionMarginPct: 19.2,
    competitorMedian: 250,
    demandIndex: 1.0,
    inventoryRatio: 1.0,
    confidenceScore: 0.45,
    status: 'pending' as const,
    reason: 'Economic floor requires movement exceeding max step limit.',
    economicFloor: 450,
    policyFloor: 450,
    policyCeiling: 400,
    policyChecksPassed: false,
    isBlocked: false,
    requiresStepOverride: true, // Step limit breached!
    constraintStatus: 'requires_step_override' as const,
    flagReasons: ['Economic floor requires price movement of +30%, exceeding step limit of 15%.'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  restartedDb.recommendations.push(stepBreachRec);

  let unprivilegedApprovalThrew = false;
  try {
    restartedDb.approveRecommendation(stepBreachRecId, 'Revenue Manager', false); // allowStepOverride = false
  } catch (err: any) {
    unprivilegedApprovalThrew = true;
    assert(err.message.toLowerCase().includes('price stability policy'), 'Test 4: Hard movement policy blocks the recommendation', err.message);
  }
  assert(unprivilegedApprovalThrew === true, 'Test 4: Enforces mandatory increase limit during approval');

  let authorizedOverrideStillBlocked = false;
  try {
    restartedDb.approveRecommendation(stepBreachRecId, 'Revenue Director (Admin)', true);
  } catch {
    authorizedOverrideStillBlocked = true;
  }
  assert(authorizedOverrideStillBlocked, 'Test 4: Explicit step override cannot bypass customer-trust movement limits');

  // 5. Application Safeguards: Cannot apply unapproved or blocked recommendation
  let applyUnapprovedThrew = false;
  try {
    restartedDb.applyRecommendation(blockedRecId, 'Revenue Manager');
  } catch (err: any) {
    applyUnapprovedThrew = true;
    assert(err.message.includes('must be approved'), 'Test 5: Prevents applying unapproved/blocked recommendation');
  }
  assert(applyUnapprovedThrew === true, 'Test 5: Strict state transition: Only approved recommendations can be applied');

  // 6. Application Safeguards: Cannot apply if price would violate current economic floor with fees
  const underfloorRecId = `rec-test-underfloor-${runId}`;
  const underfloorRec = {
    id: underfloorRecId,
    menuItemId: testItemId,
    menuItemName: testItem.name,
    category: testItem.category,
    currentPrice: 380,
    suggestedPrice: 150, // Far below testItem variable cost (205) + minContribution (80)
    priceDelta: -230,
    priceDeltaPct: -60.5,
    variableCost: 205,
    currentContribution: 175,
    suggestedContribution: -55,
    currentContributionMarginPct: 46.1,
    suggestedContributionMarginPct: -36.6,
    competitorMedian: 350,
    demandIndex: 1.0,
    inventoryRatio: 1.0,
    confidenceScore: 0.5,
    status: 'approved' as const, // Forged or outdated approval status
    reason: 'Outdated proposal',
    economicFloor: 366,
    policyFloor: 366,
    policyCeiling: 550,
    policyChecksPassed: false,
    isBlocked: false,
    requiresStepOverride: false,
    constraintStatus: 'ok' as const,
    flagReasons: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  restartedDb.recommendations.push(underfloorRec);

  let underfloorApplyThrew = false;
  try {
    restartedDb.applyRecommendation(underfloorRecId, 'Revenue Manager');
  } catch (err: any) {
    underfloorApplyThrew = true;
    assert(err.message.includes('Safety Block'), 'Test 6: Application rejected because suggested price violates current economic floor');
  }
  assert(underfloorApplyThrew === true, 'Test 6: Re-checks economic floor at time of POS application');

  // 7. Idempotent Approval: Calling approve twice does not fail or duplicate
  const validRecId = `rec-test-valid-${runId}`;
  restartedDb.recommendations.push({
    ...stepBreachRec,
    id: validRecId,
    currentPrice: 380,
    suggestedPrice: 400,
    priceDelta: 20,
    priceDeltaPct: 5.3,
    economicFloor: 366,
    policyFloor: 366,
    requiresStepOverride: false,
    isBlocked: false,
    policyChecksPassed: true,
    constraintStatus: 'ok',
    flagReasons: [],
    status: 'pending',
  });
  const firstApprove = restartedDb.approveRecommendation(validRecId, 'Revenue Manager');
  const secondApprove = restartedDb.approveRecommendation(validRecId, 'Revenue Manager');
  assert(firstApprove.status === 'approved' && secondApprove.status === 'approved', 'Test 7: Idempotent approval returns approved state on repeat call');

  // 8. Manual Override Floor Check accounting for delivery commissions & processing fees
  let overrideBelowFloorThrew = false;
  try {
    restartedDb.overridePrice(testItemId, 100, 'Test invalid override below floor'); // Floor with fees is > ₹360!
  } catch (err: any) {
    overrideBelowFloorThrew = true;
    assert(err.message.includes('violates economic floor'), 'Test 8: Manual override below economic floor is rejected');
  }
  assert(overrideBelowFloorThrew === true, 'Test 8: Manual override protects economic floor');

  // ==========================================
  // 9. AUTHENTICATION & AUTHORIZATION SECURITY TESTS
  // ==========================================

  // A. Token Generation & Verification
  const adminAccount = DEMO_ACCOUNTS.find((a) => a.role === 'admin')!;
  const adminToken = signToken(adminAccount);
  const adminPayload = verifyToken(adminToken);
  assert(adminPayload !== null, 'Test 9: Successfully verifies genuine signed admin token');
  assert(adminPayload?.role === 'admin', 'Test 9: Admin token payload contains correct role');
  assert(adminPayload?.sub === adminAccount.id, 'Test 9: Admin token contains correct subject');
  assert(
    adminPayload?.iss === 'restaurantiq' && adminPayload.aud === 'restaurantiq-api',
    'Test 9: Authenticated tokens are restricted to the RestaurantIQ API audience'
  );

  // B. Forged / Tampered Token Detection
  const tokenParts = adminToken.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...adminPayload, role: 'admin', sub: 'hacker' })).toString('base64url');
  const forgedToken = `${tokenParts[0]}.${forgedPayload}.${tokenParts[2]}`; // Tampered payload with old signature
  const tamperedResult = verifyToken(forgedToken);
  assert(tamperedResult === null, 'Test 10: Rejects tampered token with invalid signature');

  // C. Expired Token Handling
  const shortLivedToken = signToken(adminAccount, 1);
  const originalNow = Date.now;
  Date.now = () => originalNow() + 2000;
  const expiredResult = verifyToken(shortLivedToken);
  Date.now = originalNow;
  assert(expiredResult === null, 'Test 11: Rejects expired token');
  let invalidLifetimeRejected = false;
  try {
    signToken(adminAccount, 86401);
  } catch {
    invalidLifetimeRejected = true;
  }
  assert(invalidLifetimeRejected, 'Test 11: Refuses to issue tokens with excessive lifetimes');

  // D. Role Permission Matrix Integrity
  assert(ROLE_PERMISSIONS.admin.includes('pricing:override'), 'Test 12: Admin role grants price override permission');
  assert(ROLE_PERMISSIONS.admin.includes('policy:write'), 'Test 12: Admin role grants policy write permission');
  assert(!ROLE_PERMISSIONS.revenue_manager.includes('pricing:override'), 'Test 12: Revenue Manager cannot execute manual override');
  assert(!ROLE_PERMISSIONS.kitchen_ops.includes('pricing:approve'), 'Test 12: Kitchen Ops cannot approve dynamic prices');
  assert(!ROLE_PERMISSIONS.auditor.includes('pricing:approve'), 'Test 12: Auditor cannot approve dynamic prices');
  assert(!ROLE_PERMISSIONS.auditor.includes('inventory:write'), 'Test 12: Auditor has read-only access and cannot mutate inventory');

  const isolatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurantiq-persistence-'));
  const isolatedDataFile = path.join(isolatedDirectory, 'database.json');
  const isolatedBackupFile = path.join(isolatedDirectory, 'database-backup.json');
  try {
    const isolatedDb = new RestaurantDatabase(isolatedDataFile, isolatedBackupFile);
    const baselineRoundingStep = isolatedDb.policy.roundingStep;
    isolatedDb.policy.roundingStep = baselineRoundingStep + 1;
    isolatedDb.saveToDisk();
    fs.writeFileSync(isolatedDataFile, '{corrupt primary', 'utf8');
    const recoveredDb = new RestaurantDatabase(isolatedDataFile, isolatedBackupFile);
    assert(
      recoveredDb.policy.roundingStep === baselineRoundingStep,
      'Test 13: Corrupt primary database recovers from the previous durable backup'
    );
    assert(
      JSON.parse(fs.readFileSync(isolatedDataFile, 'utf8')).policy.roundingStep === baselineRoundingStep,
      'Test 13: Recovered database is atomically restored as the primary file'
    );

    const transactionDb = new RestaurantDatabase(
      path.join(isolatedDirectory, 'transaction.json'),
      path.join(isolatedDirectory, 'transaction-backup.json')
    );
    const transactionBaseline = transactionDb.policy.roundingStep;
    const originalSave = transactionDb.saveToDisk.bind(transactionDb);
    transactionDb.saveToDisk = () => {
      throw new Error('Simulated persistence failure');
    };
    let transactionRejected = false;
    try {
      await transactionDb.runTransaction(() => {
        transactionDb.policy.roundingStep = transactionBaseline + 1;
      });
    } catch {
      transactionRejected = true;
    } finally {
      transactionDb.saveToDisk = originalSave;
    }
    assert(transactionRejected, 'Test 14: Transaction surfaces persistence failures');
    assert(
      transactionDb.policy.roundingStep === transactionBaseline,
      'Test 14: Failed transaction restores the previous in-memory policy'
    );

    const corruptPrimary = '{corrupt primary retained';
    const corruptBackup = '{corrupt backup retained';
    fs.writeFileSync(isolatedDataFile, corruptPrimary, 'utf8');
    fs.writeFileSync(isolatedBackupFile, corruptBackup, 'utf8');
    let invalidDatabaseRejected = false;
    try {
      new RestaurantDatabase(isolatedDataFile, isolatedBackupFile);
    } catch {
      invalidDatabaseRejected = true;
    }
    assert(
      invalidDatabaseRejected &&
        fs.readFileSync(isolatedDataFile, 'utf8') === corruptPrimary &&
        fs.readFileSync(isolatedBackupFile, 'utf8') === corruptBackup,
      'Test 15: Invalid primary and backup files fail closed without overwriting evidence'
    );
  } finally {
    fs.rmSync(isolatedDirectory, { recursive: true, force: true });
  }

  // Clean up test records completely so database stays pristine
  const cleanItemIdx = db.menuItems.findIndex((m) => m.id === testItemId);
  if (cleanItemIdx !== -1) db.menuItems.splice(cleanItemIdx, 1);
  db.recommendations = db.recommendations.filter((r) => !r.id.startsWith('rec-test'));
  db.saveToDisk();

  const cleanItemIdx2 = restartedDb.menuItems.findIndex((m) => m.id === testItemId);
  if (cleanItemIdx2 !== -1) restartedDb.menuItems.splice(cleanItemIdx2, 1);
  restartedDb.recommendations = restartedDb.recommendations.filter((r) => !r.id.startsWith('rec-test'));
  restartedDb.saveToDisk();

  console.log(`\nResults: ${passed}/${total} persistence & security tests passed.`);
  if (passed === total) {
    console.log('🎉 ALL PERSISTENCE & SECURITY TESTS PASSED SUCCESSFULLY!\n');
  }

  return { passed, total };
}
