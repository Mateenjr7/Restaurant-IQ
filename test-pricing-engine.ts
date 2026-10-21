/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateDynamicPrice } from './server/pricing-engine.ts';

export function runPricingEngineTests(): { passed: number; total: number } {
  console.log('=== RUNNING RESTAURANTIQ PRICING ENGINE TESTS ===\n');
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

  // 1. User Specification Benchmark Test Case
  // "For an item with: Current price: ₹250, Variable cost: ₹150, Minimum required contribution: ₹40, Competitor median: ₹230.
  // The economic floor is ₹190 before considering any higher configured policy floor.
  // Current contribution is ₹100 per unit.
  // A competitor median of ₹230 does not automatically mean the final price should be ₹230."
  const test1 = calculateDynamicPrice({
    currentPrice: 250,
    variableCost: 150,
    minContribution: 40,
    competitorMedian: 230,
    competitorConfidence: 0.9,
    competitorDataFreshnessDays: 1,
    demandIndex: 1.0,
    inventoryRatio: 1.0,
    maxMovementPct: 0.15,
    roundingStep: 5,
  });

  assert(test1.economicFloor === 190, 'Test 1: Economic floor must equal ₹190 (₹150 + ₹40)');
  assert(test1.currentContribution === 100, 'Test 1: Current net contribution must equal ₹100 (₹250 - ₹150)');
  assert(test1.suggestedPrice >= test1.economicFloor, 'Test 1: Suggested price must never breach economic floor (>= ₹190)');
  assert(test1.suggestedPrice <= 250 * 1.15 && test1.suggestedPrice >= 250 * 0.85, 'Test 1: Must respect max 15% step movement limit');
  assert(test1.suggestedPrice !== 230, 'Test 1: Should not blindly set price to competitor median ₹230 without considering bounded weights');
  assert(test1.suggestedContribution >= 40, 'Test 1: Suggested contribution must be at least ₹40');
  assert(test1.policyChecksPassed === true, 'Test 1: Policy checks must pass for valid proposal');
  assert(test1.isBlocked === false, 'Test 1: Valid proposal must not be blocked');

  // 2. High Inflation / Variable Cost Shock Test (within step limit)
  // Cost jumps from ₹150 to ₹220, min contribution ₹40 -> Economic floor becomes ₹260.
  // With maxMovementPct = 0.20 on current price ₹250 (max allowed is ₹300), ₹260 is within step limit.
  const test2 = calculateDynamicPrice({
    currentPrice: 250,
    variableCost: 220,
    minContribution: 40,
    competitorMedian: 270,
    maxMovementPct: 0.20,
    roundingStep: 5,
  });
  assert(test2.economicFloor === 260, 'Test 2: Economic floor adjusts to ₹260 on cost shock');
  assert(test2.suggestedPrice >= 260, 'Test 2: Price must be elevated to meet ₹260 economic floor');
  assert(test2.suggestedContribution >= 40, 'Test 2: Preserves required minimum contribution under cost shock');
  assert(test2.policyChecksPassed === true, 'Test 2: Policy checks pass when shock fits within configured step limit');

  // 3. Step Movement Limit (L) Clipping Test
  // Huge competitor median spike to ₹400 on a ₹200 item. Max movement 10%.
  const test3 = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: 80,
    minContribution: 40,
    competitorMedian: 400,
    maxMovementPct: 0.10,
    roundingStep: 5,
  });
  assert(test3.suggestedPrice <= 220, 'Test 3: Step movement limit clips upward spike to maximum +10% (<= ₹220)');

  // 4. Invalid Policy Configuration: Floor > Ceiling must return BLOCKED recommendation
  const test4 = calculateDynamicPrice({
    currentPrice: 250,
    variableCost: 150,
    minContribution: 40,
    minPolicyPrice: 300,
    maxPolicyPrice: 280, // Floor ₹300 > Ceiling ₹280!
  });
  assert(test4.isBlocked === true, 'Test 4: Must return blocked recommendation when floor > ceiling');
  assert(test4.policyChecksPassed === false, 'Test 4: Policy checks must fail when floor exceeds ceiling');
  assert(test4.suggestedPrice === 250, 'Test 4: Must hold safely at current price and NOT output impossible price');
  assert(test4.flagReasons.some(r => r.includes('BLOCKED') && r.includes('exceeds policy ceiling')), 'Test 4: Explains blocked policy reason');

  // 5. Economic Floor Exceeds Step Movement Limit Exception Test
  // Current price ₹100, variable cost jumps to ₹130, min contribution ₹20 -> Floor is ₹150 (+50% jump).
  // Configured max step is only 15% (max ₹115).
  // ENGINE MUST NOT SILENTLY CLAIM CONSTRAINTS PASSED. It must flag the exception as requiring explicit override!
  const test5 = calculateDynamicPrice({
    currentPrice: 100,
    variableCost: 130,
    minContribution: 20,
    maxMovementPct: 0.15, // max step allows up to ₹115, but floor requires ₹150!
    roundingStep: 5,
  });
  assert(test5.economicFloor === 150, 'Test 5: Economic floor is ₹150');
  assert(test5.requiresStepOverride === true, 'Test 5: Must explicitly flag requiresStepOverride');
  assert(test5.policyChecksPassed === false, 'Test 5: Policy checks must NOT claim passed when step limit is breached by floor');
  assert(test5.suggestedPrice >= 150, 'Test 5: Suggested price enforces economic floor despite step breach');
  assert(test5.flagReasons.some(r => r.includes('exceeds configured maximum step limit')), 'Test 5: Flags explicit warning requiring authorized override');

  // 6. Rounding Invariant Test: Rounding up to preserve economic floor
  const test6 = calculateDynamicPrice({
    currentPrice: 192,
    variableCost: 153,
    minContribution: 40, // Floor is 193
    competitorMedian: 180,
    roundingStep: 5,
  });
  assert(test6.economicFloor === 193, 'Test 6: Floor is 193');
  assert(test6.suggestedPrice >= 195, 'Test 6: Rounding rounds up to ₹195 to strictly preserve economic floor');
  assert(test6.suggestedContribution >= 40, 'Test 6: Contribution satisfies minimum after rounding');

  // 7. Input Validation: Missing or negative variable cost
  const test7a = calculateDynamicPrice({
    currentPrice: 250,
    variableCost: 0, // 0 cost
    minContribution: 40,
  });
  assert(test7a.isBlocked === true, 'Test 7a: Zero cost blocks recommendation');
  assert(test7a.policyChecksPassed === false, 'Test 7a: Zero cost fails policy check');

  const test7b = calculateDynamicPrice({
    currentPrice: 250,
    variableCost: -50, // Negative cost
    minContribution: 40,
  });
  assert(test7b.isBlocked === true, 'Test 7b: Negative cost blocks recommendation');
  assert(test7b.flagReasons.some(r => r.includes('Critical cost data missing')), 'Test 7b: Flags critical cost error');

  // 8. Input Validation: Negative current price
  const test8 = calculateDynamicPrice({
    currentPrice: -100,
    variableCost: 50,
    minContribution: 20,
  });
  assert(test8.isBlocked === true, 'Test 8: Negative current price blocks recommendation');
  assert(test8.flagReasons.some(r => r.includes('Invalid current price')), 'Test 8: Flags invalid current price');

  // 9. Input Validation: Zero or negative rounding step
  const test9 = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: 100,
    minContribution: 30,
    roundingStep: 0, // Invalid rounding step
  });
  assert(test9.flagReasons.some(r => r.includes('Invalid rounding step')), 'Test 9: Flags zero rounding step and falls back');
  assert(test9.suggestedPrice > 0, 'Test 9: Generates valid price using safe fallback');

  // 10. Input Validation: Invalid Delivery Commission (> 1.0 or negative)
  const test10a = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: 100,
    minContribution: 30,
    deliveryCommissionPct: 1.5, // 150% commission is invalid
  });
  assert(test10a.isBlocked === true, 'Test 10a: Commission > 1.0 blocks recommendation');

  const test10b = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: 100,
    minContribution: 30,
    deliveryCommissionPct: -0.1, // Negative commission
  });
  assert(test10b.isBlocked === true, 'Test 10b: Negative commission blocks recommendation');

  // 11. Channel Commission & Net Selling Price Deduction Test
  // In delivery channels, 20% platform commission + 2% processing fee means Net Price = Gross * 0.78
  // If variable cost = ₹150, min contribution = ₹40 -> Net needed = ₹190 -> Gross floor = 190 / 0.78 = ₹244
  const test11 = calculateDynamicPrice({
    currentPrice: 280,
    variableCost: 150,
    minContribution: 40,
    deliveryCommissionPct: 0.20,
    paymentProcessingFeePct: 0.02,
    salesChannel: 'delivery',
    roundingStep: 5,
  });
  assert(test11.economicFloor >= 244, `Test 11: Economic floor accounts for platform commissions (floor: ₹${test11.economicFloor} >= 244)`);
  assert(test11.netSellingPriceSuggested >= 190, 'Test 11: Net selling price after fees covers cost + contribution');
  assert(test11.suggestedContribution >= 40, 'Test 11: Net contribution >= ₹40 after 22% total deductions');

  // 12. Denominator Consistency in Contribution Margins
  // Net contribution margin % must be: (netContribution / netSellingPrice) * 100
  // Gross contribution margin % must be: (grossContribution / grossPrice) * 100
  const expectedNetMargin = Math.round((test11.suggestedContribution / test11.netSellingPriceSuggested) * 1000) / 10;
  assert(test11.suggestedContributionMarginPct === expectedNetMargin, 'Test 12: Net contribution margin denominator is consistently net selling price');
  assert(test11.grossContributionMarginPctSuggested !== undefined, 'Test 12: Gross margin percentage is also explicitly available');

  // 13. Candidate Prices Consistency
  // Candidate prices must use the EXACT same fees, cost, and floor constraint checks
  assert(test11.candidates.length === 8, 'Test 13: Produces candidate price spectrum');
  const candidateViolatingFloor = test11.candidates.find(c => c.candidatePrice < test11.policyFloor);
  if (candidateViolatingFloor) {
    assert(candidateViolatingFloor.isFeasible === false, 'Test 13: Candidate below floor is marked not feasible');
    assert(candidateViolatingFloor.isFloorValid === false, 'Test 13: isFloorValid is false for candidate below floor');
  }

  // 14. Invalid Positive Elasticity Test
  const test14 = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: 80,
    minContribution: 30,
    elasticityCoefficient: 0.8, // Positive elasticity is invalid for normal food items!
  });
  assert(test14.flagReasons.some(r => r.includes('Invalid price elasticity')), 'Test 14: Flags invalid positive elasticity');
  assert(test14.assumptions.elasticityUsed === -1.25, 'Test 14: Falls back to standard dining elasticity (-1.25)');

  // 15. Stale Competitor Observation (> 3 days old)
  const test15 = calculateDynamicPrice({
    currentPrice: 250,
    variableCost: 150,
    minContribution: 40,
    competitorMedian: 290,
    competitorDataFreshnessDays: 5, // Stale!
  });
  assert(test15.flagReasons.some(r => r.includes('stale')), 'Test 15: Flags stale competitor observation');
  assert(test15.confidenceScore < 0.85, 'Test 15: Lowers confidence on stale observation');

  // 16. Impossible Policy Bounds (minPolicyPrice > maxPolicyPrice)
  const test16 = calculateDynamicPrice({
    currentPrice: 250,
    variableCost: 150,
    minContribution: 40,
    minPolicyPrice: 350,
    maxPolicyPrice: 300,
  });
  assert(test16.isBlocked === true, 'Test 16: Min policy > Max policy blocks recommendation');
  assert(test16.flagReasons.some(r => r.includes('Impossible policy bounds')), 'Test 16: Explains impossible policy bounds');

  // 17. Promotional Discount & Compounded Fee Deduction Test
  // 10% discount on ₹200 item with ₹100 variable cost + ₹40 min contribution + 22% total platform fees
  // Overall multiplier = (1 - 0.10) * (1 - 0.22) = 0.702
  // Economic floor = ceil((100 + 40) / 0.702) = 200
  const test17 = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: 100,
    minContribution: 40,
    deliveryCommissionPct: 0.20,
    paymentProcessingFeePct: 0.02,
    discountPct: 0.10,
    roundingStep: 5,
  });
  assert(test17.economicFloor === 200, `Test 17: Economic floor correctly accounts for compounded discounts and fees (floor: ${test17.economicFloor})`);
  assert(test17.suggestedPrice >= 200, 'Test 17: Suggested price covers economic floor under discount');
  assert(test17.suggestedContribution >= 40, 'Test 17: Suggested net contribution covers min contribution');

  // 18. Non-Finite and NaN Validation Checks
  const test18a = calculateDynamicPrice({
    currentPrice: NaN,
    variableCost: 100,
    minContribution: 40,
  });
  assert(test18a.isBlocked === true, 'Test 18a: NaN currentPrice is blocked');

  const test18b = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: Infinity,
    minContribution: 40,
  });
  assert(test18b.isBlocked === true, 'Test 18b: Infinity variableCost is blocked');

  const test18c = calculateDynamicPrice({
    currentPrice: 200,
    variableCost: 100,
    minContribution: 40,
    discountPct: -0.2, // Negative discount
  });
  assert(test18c.isBlocked === true, 'Test 18c: Negative discount is blocked');

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  if (passed === total) {
    console.log('🎉 ALL PRICING ENGINE TESTS PASSED SUCCESSFULLY!\n');
    return { passed, total };
  } else {
    console.error('❌ SOME PRICING ENGINE TESTS FAILED!\n');
    throw new Error(`${total - passed} tests failed in pricing engine`);
  }
}

// Execute if run directly
runPricingEngineTests();
