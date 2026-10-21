/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CandidatePriceEvaluation, PriceChangeRecord } from './types.ts';

export interface PriceStabilityPolicy {
  maxIncreasePct: number;
  maxDecreasePct: number;
  minimumDaysBetweenPriceChanges: number;
  cumulativeIncreaseLimitPct: number;
  cumulativeIncreaseWindowDays: number;
  warningThresholdPct: number;
  isProtected: boolean;
}

export interface PriceStabilityResult {
  status: 'stable' | 'within_limits' | 'warning' | 'blocked' | 'insufficient_data';
  blocked: boolean;
  cumulativeIncreasePct: number;
  recentPriceChanges: PriceChangeRecord[];
  lastActualPriceChangeAt: string | null;
  reasons: string[];
}

export function evaluatePriceStability(
  currentPrice: number,
  proposedPrice: number,
  history: PriceChangeRecord[],
  policy: PriceStabilityPolicy,
  now: Date = new Date()
): PriceStabilityResult {
  const periodStart = now.getTime() - policy.cumulativeIncreaseWindowDays * 24 * 60 * 60 * 1000;
  const recentPriceChanges = history
    .filter((change) => change.changedAt && new Date(change.changedAt).getTime() >= periodStart)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  const allActualChanges = [...history].sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  const lastActualPriceChangeAt = allActualChanges[0]?.changedAt || null;
  const increasePct = currentPrice > 0 ? ((proposedPrice - currentPrice) / currentPrice) : 0;
  const recentIncreasePct = recentPriceChanges.reduce((sum, change) => {
    if (change.previousPrice <= 0 || change.newPrice <= change.previousPrice) return sum;
    return sum + (change.newPrice - change.previousPrice) / change.previousPrice;
  }, 0);
  const cumulativeIncreasePct = recentIncreasePct + Math.max(0, increasePct);
  const reasons: string[] = [];
  let blocked = false;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(proposedPrice) || proposedPrice <= 0) {
    reasons.push('Price stability validation requires finite positive current and proposed prices.');
    blocked = true;
  } else if (proposedPrice !== currentPrice) {
    if (policy.isProtected) {
      reasons.push('This menu item or category is protected by the stable-price policy.');
      blocked = true;
    }
    if (increasePct > policy.maxIncreasePct + 1e-9) {
      reasons.push(`Increase of ${(increasePct * 100).toFixed(1)}% exceeds the ${(policy.maxIncreasePct * 100).toFixed(1)}% per-change limit.`);
      blocked = true;
    }
    if (increasePct < -policy.maxDecreasePct - 1e-9) {
      reasons.push(`Decrease of ${(Math.abs(increasePct) * 100).toFixed(1)}% exceeds the ${(policy.maxDecreasePct * 100).toFixed(1)}% per-change limit.`);
      blocked = true;
    }
    const latest = allActualChanges[0];
    const lastChangeTime = latest ? new Date(latest.changedAt).getTime() : Number.NaN;
    const minimumWaitMs = policy.minimumDaysBetweenPriceChanges * 24 * 60 * 60 * 1000;
    if (Number.isFinite(lastChangeTime) && now.getTime() - lastChangeTime < minimumWaitMs) {
      const remainingDays = Math.ceil((minimumWaitMs - (now.getTime() - lastChangeTime)) / (24 * 60 * 60 * 1000));
      reasons.push(`Minimum interval between actual price changes has not elapsed (${remainingDays} day(s) remaining).`);
      blocked = true;
    }
    if (increasePct > 0 && cumulativeIncreasePct > policy.cumulativeIncreaseLimitPct + 1e-9) {
      reasons.push(`Cumulative applied-price increases of ${(cumulativeIncreasePct * 100).toFixed(1)}% exceed the ${(policy.cumulativeIncreaseLimitPct * 100).toFixed(1)}% rolling limit.`);
      blocked = true;
    }
  }

  const warningThresholdPct = Math.min(policy.warningThresholdPct, policy.cumulativeIncreaseLimitPct);
  if (!blocked && increasePct > 0 && (increasePct >= warningThresholdPct || cumulativeIncreasePct >= policy.cumulativeIncreaseLimitPct * 0.8)) {
    reasons.push('Increase is unusually large or approaches the rolling cumulative price-movement limit; manager review is recommended.');
  }
  if (!blocked && proposedPrice !== currentPrice && recentPriceChanges.length >= 2) {
    reasons.push('Multiple actual price changes have occurred in the rolling window; manager review is recommended.');
  }

  return {
    status: blocked
      ? 'blocked'
      : proposedPrice === currentPrice
        ? (history.length ? 'stable' : 'insufficient_data')
        : reasons.length
          ? 'warning'
          : 'within_limits',
    blocked,
    cumulativeIncreasePct: Math.round(cumulativeIncreasePct * 10000) / 10000,
    recentPriceChanges,
    lastActualPriceChangeAt,
    reasons,
  };
}

export interface PricingInput {
  currentPrice: number;
  variableCost: number;
  minContribution: number;
  minPolicyPrice?: number;
  maxPolicyPrice?: number;
  competitorMedian?: number;
  competitorConfidence?: number; // 0.0 to 1.0
  competitorDataFreshnessDays?: number; // Days since last observation
  demandIndex?: number; // 1.0 is neutral, >1.0 is surge demand, <1.0 is soft demand
  inventoryRatio?: number; // stock / reorderPoint (e.g. 0.5 is low stock, 2.0 is surplus)
  maxMovementPct?: number; // e.g. 0.15 for 15% max step
  roundingStep?: number; // e.g. 5 for ₹5 increments
  baseWeeklyOrders?: number;
  elasticityCoefficient?: number; // default -1.25 for dining
  deliveryCommissionPct?: number; // e.g. 0.20 for 20% platform commission if delivery
  paymentProcessingFeePct?: number; // e.g. 0.02 for 2% payment processing
  discountPct?: number; // e.g. 0.05 for 5% promotional discount
  salesChannel?: 'dine_in' | 'delivery' | 'takeaway';
}

export interface PricingOutput {
  suggestedPrice: number;
  priceDelta: number;
  priceDeltaPct: number;
  economicFloor: number;
  policyFloor: number;
  policyCeiling: number;
  currentContribution: number;
  suggestedContribution: number;
  currentContributionMarginPct: number;
  suggestedContributionMarginPct: number;
  grossContributionCurrent: number;
  grossContributionSuggested: number;
  grossContributionMarginPctCurrent: number;
  grossContributionMarginPctSuggested: number;
  netSellingPriceCurrent: number;
  netSellingPriceSuggested: number;
  marketAdjustment: number;
  demandAdjustment: number;
  stepLimitedTarget: number;
  isFlaggedForReview: boolean;
  flagReasons: string[];
  isBlocked: boolean;
  requiresStepOverride: boolean;
  constraintStatus: 'ok' | 'blocked_policy_conflict' | 'requires_step_override' | 'invalid_input';
  explanation: string;
  confidenceScore: number;
  policyChecksPassed: boolean;
  candidates: CandidatePriceEvaluation[];
  assumptions: {
    elasticityUsed: number;
    isElasticityFallback: boolean;
    commissionDeductedPct: number;
    processingFeeDeductedPct: number;
    discountDeductedPct: number;
    totalDeductionPct: number;
    stepMovementLimitPct: number;
    economicFloorFormula: string;
    netMarginFormula: string;
  };
}

/**
 * Deterministic Dynamic Pricing Calculation Engine
 * 
 * Objective: Contribution-based optimization with explicit mathematical safeguards.
 * Expected contribution = (net selling price − variable cost per order) × expected orders at that price
 * 
 * Financial Calculation Model:
 * 1. Customer Gross Price: P_gross
 * 2. Customer Discounted Price: P_disc = P_gross * (1 - discountPct)
 * 3. Platform Fee Deductions: applied to discounted price = P_disc * (commissionPct + processingFeePct)
 * 4. Net Recognized Selling Price: P_net = P_disc * (1 - totalFeePct)
 *    P_net = P_gross * (1 - discountPct) * (1 - feeDeductionPct)
 * 5. Net Contribution: Net Contribution = P_net - C_variable
 * 6. Net Contribution Margin % = (Net Contribution / P_net) * 100
 * 7. Gross Contribution Margin % = ((P_gross - C_variable) / P_gross) * 100
 * 8. Economic Floor:
 *    P_floor = ceil((C_variable + M_min) / ((1 - discountPct) * (1 - totalFeePct)))
 *    P_effective_floor = max(P_floor, minPolicyPrice)
 * 9. Policy Ceiling: P_ceiling = maxPolicyPrice
 * 10. If P_effective_floor > P_ceiling => Recommendation is BLOCKED.
 * 11. If P_effective_floor > maxAllowedByStep => FLAGGED as requiring explicit authorized override.
 * 12. Post-Rounding Boundary Recheck: revalidates floor, ceiling, and step after rounding.
 */
export function calculateDynamicPrice(input: PricingInput): PricingOutput {
  const {
    currentPrice,
    variableCost,
    minContribution,
    minPolicyPrice = 0,
    maxPolicyPrice = 100000,
    competitorMedian,
    competitorConfidence = 0.8,
    competitorDataFreshnessDays = 1,
    demandIndex = 1.0,
    inventoryRatio = 1.0,
    maxMovementPct = 0.15,
    roundingStep = 5,
    baseWeeklyOrders = 120,
    elasticityCoefficient,
    deliveryCommissionPct = 0.0,
    paymentProcessingFeePct = 0.0,
    discountPct = 0.0,
  } = input;

  const flagReasons: string[] = [];
  let isFlaggedForReview = false;
  let isBlocked = false;
  let requiresStepOverride = false;
  let constraintStatus: 'ok' | 'blocked_policy_conflict' | 'requires_step_override' | 'invalid_input' = 'ok';

  // --- 1. RIGOROUS INPUT VALIDATION ---

  // Current Price
  if (
    currentPrice === undefined ||
    currentPrice === null ||
    typeof currentPrice !== 'number' ||
    isNaN(currentPrice) ||
    !isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    flagReasons.push('Invalid current price: currentPrice must be verified, finite, and strictly greater than 0');
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'invalid_input';
  }

  // Variable Cost
  if (
    variableCost === undefined ||
    variableCost === null ||
    typeof variableCost !== 'number' ||
    isNaN(variableCost) ||
    !isFinite(variableCost) ||
    variableCost <= 0
  ) {
    flagReasons.push('Critical cost data missing: variableCost must be verified, finite, and strictly greater than 0');
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'invalid_input';
  }

  // Minimum Required Contribution
  if (
    minContribution === undefined ||
    minContribution === null ||
    typeof minContribution !== 'number' ||
    isNaN(minContribution) ||
    !isFinite(minContribution) ||
    minContribution < 0
  ) {
    flagReasons.push('Invalid minimum contribution: minContribution must be a non-negative finite number');
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'invalid_input';
  }

  // Delivery Commission & Processing Fees
  if (
    deliveryCommissionPct === undefined ||
    isNaN(deliveryCommissionPct) ||
    !isFinite(deliveryCommissionPct) ||
    deliveryCommissionPct < 0 ||
    deliveryCommissionPct >= 1.0
  ) {
    flagReasons.push('Invalid delivery commission percentage: must be between 0.0 (0%) and 0.99 (99%)');
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'invalid_input';
  }

  if (
    paymentProcessingFeePct === undefined ||
    isNaN(paymentProcessingFeePct) ||
    !isFinite(paymentProcessingFeePct) ||
    paymentProcessingFeePct < 0 ||
    paymentProcessingFeePct >= 1.0
  ) {
    flagReasons.push('Invalid payment processing fee percentage: must be between 0.0 (0%) and 0.99 (99%)');
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'invalid_input';
  }

  // Discount percentage
  if (
    discountPct !== undefined &&
    (isNaN(discountPct) || !isFinite(discountPct) || discountPct < 0 || discountPct >= 0.9)
  ) {
    flagReasons.push('Invalid discount percentage: discountPct must be between 0.0 and 0.90');
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'invalid_input';
  }

  const rawTotalFeeDeduction = (deliveryCommissionPct || 0) + (paymentProcessingFeePct || 0);
  const safeDiscountPct = Math.max(0, Math.min(0.9, discountPct || 0));

  if (rawTotalFeeDeduction >= 1.0) {
    flagReasons.push(
      `Fee deductions (${Math.round(rawTotalFeeDeduction * 100)}%) equal or exceed 100%, creating economically impossible sales terms`
    );
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'invalid_input';
  }

  // Rounding Step
  let effectiveRoundingStep = roundingStep;
  if (
    roundingStep === undefined ||
    roundingStep === null ||
    isNaN(roundingStep) ||
    !isFinite(roundingStep) ||
    roundingStep <= 0
  ) {
    flagReasons.push('Invalid rounding step: roundingStep must be strictly greater than 0; defaulted to 1');
    isFlaggedForReview = true;
    effectiveRoundingStep = 1;
  }

  // Step Movement Limit L
  let effectiveMaxMovementPct = maxMovementPct;
  if (
    maxMovementPct === undefined ||
    maxMovementPct === null ||
    isNaN(maxMovementPct) ||
    !isFinite(maxMovementPct) ||
    maxMovementPct <= 0 ||
    maxMovementPct > 1.0
  ) {
    flagReasons.push('Invalid maxMovementPct: must be between 0.01 (1%) and 1.0 (100%); defaulted to 0.15 (15%)');
    isFlaggedForReview = true;
    effectiveMaxMovementPct = 0.15;
  }

  // Policy Floor and Ceiling bounds
  if (minPolicyPrice < 0 || isNaN(minPolicyPrice) || !isFinite(minPolicyPrice)) {
    flagReasons.push('Invalid minPolicyPrice: cannot be negative; defaulted to 0');
    isFlaggedForReview = true;
  }
  if (maxPolicyPrice <= 0 || isNaN(maxPolicyPrice) || !isFinite(maxPolicyPrice)) {
    flagReasons.push('Invalid maxPolicyPrice: must be greater than 0; defaulted to 100000');
    isFlaggedForReview = true;
  }
  if (minPolicyPrice > maxPolicyPrice) {
    flagReasons.push(
      `Impossible policy bounds: minPolicyPrice (₹${minPolicyPrice}) exceeds maxPolicyPrice (₹${maxPolicyPrice})`
    );
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'blocked_policy_conflict';
  }

  // Price Elasticity
  const isElasticityFallback =
    elasticityCoefficient === undefined ||
    elasticityCoefficient === null ||
    isNaN(elasticityCoefficient) ||
    !isFinite(elasticityCoefficient);

  let effectiveElasticity = -1.25;
  if (!isElasticityFallback) {
    if (elasticityCoefficient! > 0) {
      flagReasons.push(
        `Invalid price elasticity: elasticityCoefficient should be negative for normal consumer goods; received positive ${elasticityCoefficient}; falling back to standard dining elasticity (-1.25)`
      );
      isFlaggedForReview = true;
    } else {
      effectiveElasticity = elasticityCoefficient!;
    }
  }

  // Safe Working Values
  const safeCost = Math.max(1, typeof variableCost === 'number' && !isNaN(variableCost) ? variableCost : 1);
  const safeCurrentPrice = Math.max(1, typeof currentPrice === 'number' && !isNaN(currentPrice) ? currentPrice : 1);
  const safeMinContribution = Math.max(0, typeof minContribution === 'number' && !isNaN(minContribution) ? minContribution : 0);
  const totalFeeDeductionPct = Math.max(0, Math.min(0.95, rawTotalFeeDeduction || 0));

  // --- 2. EXPLICIT CONSTRAINT CALCULATIONS ---

  // Net selling price = Gross Price * (1 - safeDiscountPct) * (1 - totalFeeDeductionPct)
  // At floor: Gross_Floor * (1 - safeDiscountPct) * (1 - totalFeeDeductionPct) - safeCost = safeMinContribution
  // Therefore Gross_Floor = ceil((safeCost + safeMinContribution) / ((1 - safeDiscountPct) * (1 - totalFeeDeductionPct)))
  const netDiscountMultiplier = Math.max(0.05, 1 - safeDiscountPct);
  const netFeeMultiplier = Math.max(0.05, 1 - totalFeeDeductionPct);
  const overallNetMultiplier = netDiscountMultiplier * netFeeMultiplier;

  const economicFloor = Math.ceil((safeCost + safeMinContribution) / overallNetMultiplier);
  const policyFloor = Math.max(economicFloor, Math.max(0, minPolicyPrice || 0));
  const policyCeiling = Math.max(1, maxPolicyPrice || 100000);

  // Maximum allowed movement by step limit L
  const minAllowedByStep = Math.round(safeCurrentPrice * (1 - effectiveMaxMovementPct) * 100) / 100;
  const maxAllowedByStep = Math.round(safeCurrentPrice * (1 + effectiveMaxMovementPct) * 100) / 100;

  // --- 3. CONSTRAINT CONFLICT CHECKS ---

  // Conflict A: Economic Floor exceeds Policy Ceiling
  if (policyFloor > policyCeiling) {
    flagReasons.push(
      `BLOCKED: Effective economic floor (₹${policyFloor}) exceeds policy ceiling (₹${policyCeiling}). Recommendation is blocked until policy bounds or costs are corrected.`
    );
    isFlaggedForReview = true;
    isBlocked = true;
    constraintStatus = 'blocked_policy_conflict';
  }

  // Conflict B: Economic Floor requires a movement larger than allowed step limit L
  if (policyFloor > maxAllowedByStep && !isBlocked) {
    const requiredJumpPct = Math.round(((policyFloor - safeCurrentPrice) / safeCurrentPrice) * 100);
    flagReasons.push(
      `Economic floor (₹${policyFloor}) requires price movement of +${requiredJumpPct}%, which exceeds configured maximum step limit of ${Math.round(effectiveMaxMovementPct * 100)}%. Requires explicit authorized override or policy change.`
    );
    requiresStepOverride = true;
    isFlaggedForReview = true;
    constraintStatus = 'requires_step_override';
  }

  // --- 4. MARKET & DEMAND ADJUSTMENT CALCULATIONS ---
  let marketAdjustment = 0;
  if (competitorMedian !== undefined && competitorMedian > 0 && !isNaN(competitorMedian)) {
    if (competitorDataFreshnessDays > 3) {
      flagReasons.push(
        `Competitor observation is stale (${competitorDataFreshnessDays} days old; threshold 3 days); dampening benchmark influence.`
      );
    }
    const freshnessFactor = Math.max(0.15, 1.0 - Math.min(10, competitorDataFreshnessDays) * 0.08);
    const effectiveConfidence = Math.min(1.0, Math.max(0.1, competitorConfidence) * freshnessFactor);
    const rawGap = competitorMedian - safeCurrentPrice;
    marketAdjustment = rawGap * 0.35 * effectiveConfidence;
  } else {
    flagReasons.push('No fresh competitor observations available; using internal cost and demand baseline');
  }

  const demandDelta = (demandIndex || 1.0) - 1.0;
  let demandAdjustment = safeCurrentPrice * demandDelta * 0.25;

  // Inventory protection
  if (inventoryRatio < 0.6) {
    if (demandAdjustment < 0) demandAdjustment = 0; // Protect low stock from price discounting
  } else if (inventoryRatio > 1.8) {
    demandAdjustment -= safeCurrentPrice * 0.04; // Encourage stock turnover
  }

  // --- 5. TARGET PRICE & BOUNDARY CLIPPING ---
  const targetRaw = safeCurrentPrice + marketAdjustment + demandAdjustment;
  const stepLimitedTarget = Math.max(minAllowedByStep, Math.min(maxAllowedByStep, targetRaw));

  let candidatePrice: number;
  if (isBlocked) {
    // If blocked by invalid configuration or floor > ceiling, hold safely at current price
    candidatePrice = safeCurrentPrice;
  } else if (requiresStepOverride) {
    // Economic floor takes precedence over step limit to prevent selling below cost,
    // but cannot breach ceiling. Flagged for required override.
    candidatePrice = Math.min(policyCeiling, Math.max(policyFloor, targetRaw));
  } else {
    // Normal case: respects step limit, floor, and ceiling
    candidatePrice = Math.max(policyFloor, Math.min(policyCeiling, stepLimitedTarget));
  }

  // --- 6. CURRENCY PRICING CONVENTION ROUNDING ---
  if (effectiveRoundingStep > 1) {
    candidatePrice = Math.round(candidatePrice / effectiveRoundingStep) * effectiveRoundingStep;
  } else {
    candidatePrice = Math.round(candidatePrice * 100) / 100;
  }

  // --- 7. POST-ROUNDING BOUNDARY REVERIFICATION ---
  if (!isBlocked) {
    // A. Recheck Economic & Policy Floor
    if (candidatePrice < policyFloor) {
      candidatePrice = effectiveRoundingStep > 1
        ? Math.ceil(policyFloor / effectiveRoundingStep) * effectiveRoundingStep
        : policyFloor;
    }

    // B. Recheck Policy Ceiling
    if (candidatePrice > policyCeiling) {
      const roundedCeil = effectiveRoundingStep > 1
        ? Math.floor(policyCeiling / effectiveRoundingStep) * effectiveRoundingStep
        : policyCeiling;

      if (roundedCeil >= policyFloor) {
        candidatePrice = roundedCeil;
      } else {
        // Rounding step cannot fit between policyFloor and policyCeiling!
        flagReasons.push(
          `Rounding boundary conflict: Rounding step of ₹${effectiveRoundingStep} cannot fit between floor (₹${policyFloor}) and ceiling (₹${policyCeiling})`
        );
        isFlaggedForReview = true;
        isBlocked = true;
        constraintStatus = 'blocked_policy_conflict';
        candidatePrice = safeCurrentPrice;
      }
    }

    // C. Recheck Step Movement Limit (if step override was not previously required)
    if (!requiresStepOverride && (candidatePrice > maxAllowedByStep || candidatePrice < minAllowedByStep)) {
      if (candidatePrice > maxAllowedByStep) {
        const roundedDown = effectiveRoundingStep > 1
          ? Math.floor(maxAllowedByStep / effectiveRoundingStep) * effectiveRoundingStep
          : maxAllowedByStep;

        if (roundedDown >= policyFloor) {
          candidatePrice = roundedDown;
        } else {
          flagReasons.push(
            `Rounding boundary note: Rounding increment ₹${effectiveRoundingStep} placed price at ₹${candidatePrice}, slightly exceeding raw step limit (₹${maxAllowedByStep}) to preserve economic floor.`
          );
          isFlaggedForReview = true;
        }
      }
    }
  }

  // --- 8. CONSISTENT FINANCIAL METRICS (NET & GROSS) ---
  const netSellingPriceCurrent = Math.round(safeCurrentPrice * overallNetMultiplier * 100) / 100;
  const netSellingPriceSuggested = Math.round(candidatePrice * overallNetMultiplier * 100) / 100;

  // Net contribution per order (Net Price - Variable Cost)
  const currentContribution = Math.round((netSellingPriceCurrent - safeCost) * 100) / 100;
  const suggestedContribution = Math.round((netSellingPriceSuggested - safeCost) * 100) / 100;

  // Net contribution margin % = (Net Contribution / Net Selling Price) * 100
  const currentContributionMarginPct = netSellingPriceCurrent > 0
    ? Math.round((currentContribution / netSellingPriceCurrent) * 1000) / 10
    : 0;
  const suggestedContributionMarginPct = netSellingPriceSuggested > 0
    ? Math.round((suggestedContribution / netSellingPriceSuggested) * 1000) / 10
    : 0;

  // Gross contribution per order (Gross Price - Variable Cost)
  const grossContributionCurrent = Math.round((safeCurrentPrice - safeCost) * 100) / 100;
  const grossContributionSuggested = Math.round((candidatePrice - safeCost) * 100) / 100;

  const grossContributionMarginPctCurrent = safeCurrentPrice > 0
    ? Math.round((grossContributionCurrent / safeCurrentPrice) * 1000) / 10
    : 0;
  const grossContributionMarginPctSuggested = candidatePrice > 0
    ? Math.round((grossContributionSuggested / candidatePrice) * 1000) / 10
    : 0;

  // Re-verify net contribution against required minimum contribution
  if (!isBlocked && suggestedContribution < safeMinContribution && !isFlaggedForReview) {
    flagReasons.push(
      `Recommendation would yield net contribution ₹${Math.round(suggestedContribution)}, below required ₹${safeMinContribution}`
    );
    isFlaggedForReview = true;
  }

  const priceDelta = candidatePrice - safeCurrentPrice;
  const priceDeltaPct = safeCurrentPrice > 0 ? Math.round((priceDelta / safeCurrentPrice) * 1000) / 10 : 0;

  // Confidence estimation
  let confidenceScore = 0.94;
  if (!competitorMedian) confidenceScore -= 0.18;
  if (competitorConfidence < 0.7) confidenceScore -= 0.12;
  if (competitorDataFreshnessDays > 3) confidenceScore -= 0.15;
  if (isElasticityFallback) confidenceScore -= 0.05;
  if (isFlaggedForReview) confidenceScore = Math.min(confidenceScore, 0.45);
  if (isBlocked) confidenceScore = 0.10;
  confidenceScore = Math.max(0.1, Math.min(0.99, confidenceScore));

  // --- 9. CANDIDATE PRICE SPECTRUM & CONTRIBUTION EVALUATION ---
  // Must use the EXACT same fees, discounts, constraints, demand assumptions, and contribution formula
  const candidateSteps = [-0.15, -0.10, -0.05, 0.0, 0.05, 0.10, 0.15, 0.20];
  const candidates: CandidatePriceEvaluation[] = candidateSteps.map((pct) => {
    let p = effectiveRoundingStep > 1
      ? Math.round((safeCurrentPrice * (1 + pct)) / effectiveRoundingStep) * effectiveRoundingStep
      : Math.round(safeCurrentPrice * (1 + pct));

    const netP = Math.round(p * overallNetMultiplier * 100) / 100;
    const unitContrib = Math.round((netP - safeCost) * 100) / 100;

    const isFloorValid = p >= policyFloor && unitContrib >= safeMinContribution;
    const isCeilValid = p <= policyCeiling;
    const isStepValid = p >= minAllowedByStep && p <= maxAllowedByStep;
    const isFeasible = isFloorValid && isCeilValid && (isStepValid || requiresStepOverride);

    // Expected demand via elasticity: Q_new = Q_base * (1 + deltaPct * elasticity * demandIndex)
    const deltaRatio = (p - safeCurrentPrice) / safeCurrentPrice;
    const expectedDemand = Math.max(5, Math.round(baseWeeklyOrders * (1 + deltaRatio * effectiveElasticity * (demandIndex || 1.0))));
    const totalContrib = Math.round(unitContrib * expectedDemand);
    const currentTotalContrib = Math.round(currentContribution * baseWeeklyOrders);

    let constraintNotes = 'Meets economic floor and policy bounds';
    if (!isFloorValid) {
      constraintNotes = `Violates economic floor of ₹${policyFloor} (net contribution ₹${unitContrib} < ₹${safeMinContribution})`;
    } else if (!isCeilValid) {
      constraintNotes = `Exceeds policy ceiling of ₹${policyCeiling}`;
    } else if (!isStepValid && !requiresStepOverride) {
      constraintNotes = `Exceeds max step movement (±${Math.round(effectiveMaxMovementPct * 100)}%)`;
    }

    return {
      candidatePrice: p,
      expectedDemand,
      contributionPerOrder: unitContrib,
      expectedTotalContribution: totalContrib,
      netDeltaVsCurrent: totalContrib - currentTotalContrib,
      isFeasible,
      isFloorValid,
      isCeilValid,
      isStepValid,
      constraintNotes,
    };
  });

  // --- 10. HUMAN READABLE RATIONALE ---
  const reasons: string[] = [];
  if (isBlocked) {
    reasons.push(`RECOMMENDATION BLOCKED: ${flagReasons.join('; ')}.`);
  } else if (requiresStepOverride) {
    reasons.push(`FLAGGED FOR OVERRIDE: ${flagReasons.join('; ')}.`);
  }

  if (marketAdjustment > 0 && !isBlocked) {
    reasons.push(`Competitor median is higher (₹${competitorMedian}); capturing margin premium.`);
  } else if (marketAdjustment < 0 && !isBlocked) {
    reasons.push(`Competitors benchmark lower (₹${competitorMedian}); aligned to protect order volume.`);
  }

  if (demandIndex > 1.1) {
    reasons.push(`Surge demand pattern (+${Math.round((demandIndex - 1) * 100)}%) supports dynamic yield.`);
  } else if (demandIndex < 0.9) {
    reasons.push(`Soft demand trend (-${Math.round((1 - demandIndex) * 100)}%) incentivizes value positioning.`);
  }

  if (inventoryRatio > 1.7) {
    reasons.push('High ingredient stock levels incentivize turnover.');
  }

  if (totalFeeDeductionPct > 0) {
    reasons.push(`Accounts for ${Math.round(totalFeeDeductionPct * 100)}% platform commission and processing fees.`);
  }

  if (safeDiscountPct > 0) {
    reasons.push(`Includes ${Math.round(safeDiscountPct * 100)}% promotional discount deduction.`);
  }

  if (!isBlocked) {
    reasons.push(
      `Enforces guaranteed economic floor of ₹${policyFloor} (₹${safeCost} variable cost + ₹${safeMinContribution} minimum net contribution).`
    );
  }

  if (isElasticityFallback) {
    reasons.push('Assumes standard category dining price elasticity (ε = -1.25) pending verified order history.');
  }

  const explanation = reasons.join(' ');

  return {
    suggestedPrice: candidatePrice,
    priceDelta,
    priceDeltaPct,
    economicFloor,
    policyFloor,
    policyCeiling,
    currentContribution,
    suggestedContribution,
    currentContributionMarginPct,
    suggestedContributionMarginPct,
    grossContributionCurrent,
    grossContributionSuggested,
    grossContributionMarginPctCurrent,
    grossContributionMarginPctSuggested,
    netSellingPriceCurrent,
    netSellingPriceSuggested,
    marketAdjustment: Math.round(marketAdjustment * 100) / 100,
    demandAdjustment: Math.round(demandAdjustment * 100) / 100,
    stepLimitedTarget: Math.round(stepLimitedTarget * 100) / 100,
    isFlaggedForReview,
    flagReasons,
    isBlocked,
    requiresStepOverride,
    constraintStatus,
    explanation,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    policyChecksPassed: !isFlaggedForReview && !isBlocked && !requiresStepOverride,
    candidates,
    assumptions: {
      elasticityUsed: effectiveElasticity,
      isElasticityFallback,
      commissionDeductedPct: deliveryCommissionPct || 0,
      processingFeeDeductedPct: paymentProcessingFeePct || 0,
      discountDeductedPct: safeDiscountPct,
      totalDeductionPct: totalFeeDeductionPct,
      stepMovementLimitPct: effectiveMaxMovementPct,
      economicFloorFormula: 'P_floor = ceil((VariableCost + MinContribution) / ((1 - DiscountPct) * (1 - TotalFees)))',
      netMarginFormula: 'NetMargin% = ((NetSellingPrice - VariableCost) / NetSellingPrice) * 100',
    },
  };
}
