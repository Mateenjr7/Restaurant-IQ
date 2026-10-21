/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RestaurantOutlet {
  id: string;
  name: string;
  city: string;
  locality: string;
  postalCode: string;
  researchRadiusKm: number;
  deliveryCommissionPct: number; // e.g. 20% for platform delivery
  packagingCostDefault: number;
  isActive: boolean;
  latitude: number;
  longitude: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: 'Biryani & Rice' | 'Curries & Gravies' | 'Tandoor & Starters' | 'Breads' | 'Beverages & Desserts';
  sku: string;
  currentPrice: number;
  dineInPrice?: number;
  deliveryPrice?: number;
  ingredientCost: number;
  packagingCost: number;
  totalVariableCost: number;
  minContribution: number;
  minPolicyPrice: number;
  maxPolicyPrice: number;
  inventoryQty: number;
  reorderThreshold: number;
  status: 'active' | 'inactive';
  demandTrend: 'surging' | 'steady' | 'softening';
  portionGrams: number;
  lastUpdated: string;
  historicalSalesLast30Days: number;
  dailySalesHistory?: Array<{
    date: string;
    dayOfWeek: string;
    orders: number;
    revenue: number;
  }>;
  dailySalesLast60Days?: Array<{
    date: string;
    dayOfWeek: string;
    orders: number;
    revenue: number;
  }>;
}

export interface Competitor {
  id: string;
  name: string;
  distanceKm: number;
  rating: number;
  cuisineType: string;
  priceTier: 'Budget' | 'Mid-Tier' | 'Premium Casual' | 'Fine Dining';
  address: string;
  activeMatchesCount: number;
  lastScannedAt: string;
  sourceType?: 'live_api' | 'verified_order' | 'manual_audit' | 'uploaded_menu' | 'demo_data';
  latitude?: number;
  longitude?: number;
}

export interface CompetitorObservation {
  id: string;
  competitorId: string;
  competitorName: string;
  menuItemId: string;
  menuItemName: string;
  dishName: string;
  observedPrice: number;
  isAvailable: boolean;
  portionGrams: number;
  confidenceScore: number; // 0.0 to 1.0
  freshnessTimestamp: string;
  isSimulated: boolean;
  source: 'direct_api' | 'digital_pos' | 'verified_order' | 'manual_audit' | 'uploaded_csv' | 'demo_dataset';
  provenanceLabel?: string;
}

export interface MenuMatch {
  id: string;
  menuItemId: string;
  menuItemName: string;
  competitorDishName: string;
  competitorName: string;
  portionInternalGrams: number;
  portionCompetitorGrams: number;
  observedPrice: number;
  normalizedPrice: number;
  confidenceScore: number;
  matchStatus: 'high_confidence' | 'needs_review' | 'rejected';
  explanation: string;
}

export interface CandidatePriceEvaluation {
  candidatePrice: number;
  expectedDemand: number;
  contributionPerOrder: number;
  expectedTotalContribution: number;
  netDeltaVsCurrent: number;
  isFeasible: boolean;
  isFloorValid: boolean;
  isCeilValid: boolean;
  isStepValid: boolean;
  constraintNotes: string;
}

export interface PricingRecommendation {
  id: string;
  menuItemId: string;
  menuItemName: string;
  category: string;
  currentPrice: number;
  suggestedPrice: number;
  priceDelta: number;
  priceDeltaPct: number;
  variableCost: number;
  currentContribution: number;
  suggestedContribution: number;
  currentContributionMarginPct: number;
  suggestedContributionMarginPct: number;
  grossContributionMarginPctCurrent?: number;
  grossContributionMarginPctSuggested?: number;
  competitorMedian: number;
  demandIndex: number;
  inventoryRatio: number;
  confidenceScore: number;
  status: 'pending' | 'approved' | 'applied' | 'rejected' | 'deferred';
  reason: string;
  economicFloor: number;
  policyFloor: number;
  policyCeiling: number;
  policyChecksPassed: boolean;
  isBlocked: boolean;
  requiresStepOverride: boolean;
  constraintStatus: 'ok' | 'blocked_policy_conflict' | 'blocked_trust_policy' | 'stale_recommendation' | 'requires_step_override' | 'invalid_input';
  flagReasons: string[];
  lastActualPriceChangeAt?: string | null;
  recentPriceChanges?: PriceChangeRecord[];
  cumulativeIncreasePct?: number;
  stabilityPolicyStatus?: 'stable' | 'within_limits' | 'warning' | 'blocked' | 'insufficient_data';
  customerTrustRisk?: CustomerTrustAssessment;
  candidates?: CandidatePriceEvaluation[];
  assumptions?: Record<string, any>;
  approvedBy?: string;
  appliedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemandForecastPoint {
  date: string;
  dayOfWeek: string;
  forecastedOrders: number;
  lowerBound: number;
  upperBound: number;
}

export interface DemandForecastItem {
  menuItemId: string;
  itemName: string;
  historicalDailyAverage: number;
  next7DaysForecast: DemandForecastPoint[];
  mae: number | null;
  rmse: number | null;
  validationStatus: string;
  isEstimate: boolean;
  modelType: string;
  trend: 'surging' | 'steady' | 'softening';
  evaluationWindow?: string;
  assumptions: string[];
  methodDescription: string;
}

export interface AgentExecution {
  id: string;
  name: string;
  key: 'market_intel' | 'menu_match' | 'demand_forecast' | 'pricing_strategy' | 'policy_guard' | 'orchestrator';
  role: string;
  status: 'active' | 'idle' | 'running' | 'warning';
  lastRun: string;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  itemsProcessed: number;
  qualityScore?: number;
  confidenceScore?: number;
  isSimulatedTelemetry: boolean;
  executionMode: 'deterministic_pipeline' | 'simulated_telemetry';
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: 'PRICE_APPLIED' | 'PRICE_APPROVED' | 'PRICE_REJECTED' | 'PRICE_BLOCKED' | 'MANUAL_OVERRIDE' | 'POLICY_UPDATED' | 'STOCK_ADJUSTED' | 'MENU_MATCH_UPDATED';
  menuItemId?: string;
  menuItemName?: string;
  previousPrice?: number;
  newPrice?: number;
  rationale: string;
  policyChecksPassed: boolean;
  metadata?: Record<string, any>;
}

export interface PriceChangeRecord {
  id: string;
  menuItemId: string;
  menuItemName: string;
  previousPrice: number;
  newPrice: number;
  changedAt: string;
  actor: string;
  source: 'recommendation' | 'manual_override';
  rationale: string;
}

export interface CustomerTrustAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'insufficient data';
  assessmentType: 'pricing-stability risk';
  evidence: string[];
  periodExamined: string;
  explanation: string;
  dataQuality: string;
  limitations: string[];
}

export interface CustomerTrustDashboard {
  generatedAt: string;
  periodDays: number;
  summary: {
    stableMenuItems: number;
    approachingLimits: number;
    recommendationsForReview: number;
    blockedRecommendations: number;
    actualPriceChanges: number;
    cumulativeIncreasePct: number;
  };
  assessments: Array<{
    menuItemId: string;
    menuItemName: string;
    category: string;
    currentPrice: number;
    lastActualPriceChangeAt: string | null;
    recentPriceChanges: PriceChangeRecord[];
    cumulativeIncreasePct: number;
    stabilityPolicyStatus: 'stable' | 'within_limits' | 'warning' | 'blocked' | 'insufficient_data';
    customerTrustRisk: CustomerTrustAssessment;
    ordersTrend: 'increasing' | 'decreasing' | 'stable' | 'insufficient data';
    orderDataQuality: string;
  }>;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'Meat & Poultry' | 'Dairy & Paneer' | 'Grains & Spices' | 'Produce' | 'Packaging';
  stockQty: number;
  unit: string;
  reorderPoint: number;
  costPerUnit: number;
  priceChangeLast30DaysPct: number;
  linkedMenuItemIds: string[];
  status: 'healthy' | 'low_stock' | 'critical' | 'surplus';
  lastRestocked: string;
}

export interface RestaurantPricingPolicy {
  restaurantName: string;
  activeOutletId: string;
  currencySymbol: string;
  currencyCode: string;
  maxMovementPct: number; // e.g. 0.15 = 15%
  maxIncreasePct: number;
  maxDecreasePct: number;
  minimumDaysBetweenPriceChanges: number;
  cumulativeIncreaseLimitPct: number;
  cumulativeIncreaseWindowDays: number;
  trustRiskReviewThresholdPct: number;
  protectedMenuItemIds: string[];
  protectedCategories: string[];
  loyaltyPriceProtection: boolean;
  defaultMinContribution: number;
  roundingStep: number;
  dataFreshnessMaxDays: number;
  requireManualApprovalThresholdPct: number;
  posIntegration: {
    provider: 'Toast' | 'Square' | 'Clover' | 'Petpooja' | 'Manual';
    status: 'connected' | 'demo_mode';
    syncIntervalMinutes: number;
    lastSyncTimestamp: string;
  };
}

export interface DashboardMetrics {
  periodRevenue: number;
  revenueChangePct: number;
  periodContribution: number;
  contributionChangePct: number;
  contributionMarginPct: number;
  averageCheckSize: number;
  checkSizeChangePct: number;
  totalOrders: number;
  ordersChangePct: number;
  pendingApprovalsCount: number;
  competitorPriceShiftsCount: number;
  highMarginCount: number;
  lowStockAlertsCount: number;
  expectedMonthlyOpportunity: number;
  currencySymbol: string;
}
