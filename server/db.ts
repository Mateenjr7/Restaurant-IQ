/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  MenuItem,
  Competitor,
  CompetitorObservation,
  PricingRecommendation,
  AgentExecution,
  AuditEvent,
  InventoryItem,
  RestaurantPricingPolicy,
  RestaurantOutlet,
  MenuMatch,
  PriceChangeRecord,
  CustomerTrustAssessment,
  CustomerTrustDashboard,
} from './types.ts';
import { calculateDynamicPrice, evaluatePriceStability } from './pricing-engine.ts';
import {
  initialOutlets,
  initialPolicy,
  initialMenuItems,
  initialCompetitors,
  initialObservations,
  initialMenuMatches,
  initialInventory,
  initialAgents,
  initialAuditEvents,
} from './seed-data.ts';

const DB_FILE = path.resolve(process.cwd(), 'data', 'restaurantiq-data.json');
const BACKUP_FILE = path.resolve(process.cwd(), 'data', 'backup-restaurantiq-v1.2.0.json');

interface PersistedDatabaseState {
  schemaVersion: string;
  lastSavedAt: string;
  outlets: RestaurantOutlet[];
  policy: RestaurantPricingPolicy;
  menuItems: MenuItem[];
  competitors: Competitor[];
  observations: CompetitorObservation[];
  menuMatches: MenuMatch[];
  inventory: InventoryItem[];
  agents: AgentExecution[];
  auditEvents: AuditEvent[];
  recommendations: PricingRecommendation[];
  priceChanges: PriceChangeRecord[];
}

export interface StorageHealth {
  status: 'healthy' | 'degraded' | 'error';
  persistedToDisk: boolean;
  filePath: string;
  fileSizeBytes: number;
  schemaVersion: string;
  lastSavedAt: string | null;
  counts: {
    menuItems: number;
    competitors: number;
    observations: number;
    recommendations: number;
    inventory: number;
    auditEvents: number;
  };
}

export class RestaurantDatabase {
  private readonly dataFile: string;
  private readonly backupFile: string;
  public schemaVersion: string = '1.5.0';
  public lastSavedAt: string | null = null;
  public isHydratedFromDisk: boolean = false;

  public outlets: RestaurantOutlet[] = [...initialOutlets];
  public menuMatches: MenuMatch[] = [...initialMenuMatches];
  public policy: RestaurantPricingPolicy = { ...initialPolicy };
  public menuItems: MenuItem[] = [...initialMenuItems];
  public competitors: Competitor[] = [...initialCompetitors];
  public observations: CompetitorObservation[] = [...initialObservations];
  public inventory: InventoryItem[] = [...initialInventory];
  public agents: AgentExecution[] = [...initialAgents];
  public auditEvents: AuditEvent[] = [...initialAuditEvents];
  public recommendations: PricingRecommendation[] = [];
  public priceChanges: PriceChangeRecord[] = [];

  // Internal transaction queue for concurrency safety
  private writeQueue: Promise<void> = Promise.resolve();
  private lastPersistedState: PersistedDatabaseState | null = null;
  private recoveredFromBackup = false;

  constructor(dataFile = DB_FILE, backupFile = BACKUP_FILE) {
    this.dataFile = dataFile;
    this.backupFile = backupFile;
    this.initDatabase();
  }

  /**
   * Initializes database: loads from persistent disk storage if available,
   * otherwise seeds initial data and writes to disk atomically.
   */
  private initDatabase() {
    const dataDirectory = path.dirname(this.dataFile);
    if (!fs.existsSync(dataDirectory)) fs.mkdirSync(dataDirectory, { recursive: true });

    const candidates = [
      { file: this.dataFile, isBackup: false },
      { file: this.backupFile, isBackup: true },
    ].filter(({ file }) => fs.existsSync(file));

    if (candidates.length) {
      for (const candidate of candidates) {
        try {
          const data = JSON.parse(fs.readFileSync(candidate.file, 'utf8'));
          if (!data || !['1.5.0', '1.4.0', '1.2.0'].includes(data.schemaVersion)) {
            throw new Error('Unsupported database schema');
          }
          this.loadPersistedData(data);
          this.recoveredFromBackup = candidate.isBackup;
          this.lastPersistedState = JSON.parse(JSON.stringify(
            this.toPersistedState(this.lastSavedAt || new Date().toISOString())
          )) as PersistedDatabaseState;
          this.isHydratedFromDisk = true;
          this.recomputeCompetitorDistances();
          this.revalidateStoredRecommendations();
          if (candidate.isBackup || this.recommendations.length === 0) this.saveToDisk();
          return;
        } catch (err) {
          console.error(`Could not load database file ${candidate.file}:`, err);
        }
      }
      throw new Error('No valid primary or backup database could be loaded; preserving existing files instead of overwriting them.');
    }

    // Initialize with fresh calculation and persist to disk
    this.recomputeCompetitorDistances();
    this.generateInitialRecommendations();
    this.saveToDisk();
  }

  private loadPersistedData(data: any) {
    this.outlets = data.outlets || this.outlets;
    const storedPolicy = data.policy || {};
    this.policy = {
      ...initialPolicy,
      ...storedPolicy,
      maxIncreasePct: storedPolicy.maxIncreasePct ?? storedPolicy.maxMovementPct ?? initialPolicy.maxIncreasePct,
      maxDecreasePct: storedPolicy.maxDecreasePct ?? storedPolicy.maxMovementPct ?? initialPolicy.maxDecreasePct,
    };
    const seededItemIds = new Set(initialMenuItems.map((item) => item.id));
    this.menuItems = (data.menuItems || this.menuItems).map((item: MenuItem) => ({
      ...item,
      isSyntheticDemoData: item.isSyntheticDemoData ?? seededItemIds.has(item.id),
    }));
    this.competitors = data.competitors || this.competitors;
    this.observations = data.observations || this.observations;
    this.menuMatches = data.menuMatches || this.menuMatches;
    this.inventory = data.inventory || this.inventory;
    this.agents = data.agents || this.agents;
    this.auditEvents = data.auditEvents || this.auditEvents;
    this.recommendations = data.recommendations || [];
    this.priceChanges = Array.isArray(data.priceChanges) ? data.priceChanges : [];
    this.lastSavedAt = data.lastSavedAt || null;
  }

  private revalidateStoredRecommendations() {
    this.recommendations = this.recommendations.map((rec) => {
      const item = this.menuItems.find((menuItem) => menuItem.id === rec.menuItemId);
      if (!item) return rec;
      const stability = this.evaluateItemPriceStability(item, rec.suggestedPrice);
      const customerTrustRisk = this.createTrustAssessment(item, stability.status, stability.recentPriceChanges.length
        ? [`${stability.recentPriceChanges.length} actual price change(s) in the rolling period.`, `Cumulative applied-price increases: ${(stability.cumulativeIncreasePct * 100).toFixed(1)}%.`]
        : []);
      return {
        ...rec,
        isBlocked: rec.isBlocked || stability.blocked,
        policyChecksPassed: rec.policyChecksPassed && !stability.blocked,
        constraintStatus: stability.blocked ? 'blocked_trust_policy' : rec.constraintStatus,
        flagReasons: [...new Set([...rec.flagReasons, ...stability.reasons])],
        lastActualPriceChangeAt: stability.lastActualPriceChangeAt,
        recentPriceChanges: stability.recentPriceChanges,
        cumulativeIncreasePct: stability.cumulativeIncreasePct * 100,
        stabilityPolicyStatus: stability.status,
        customerTrustRisk,
      };
    });
    if (this.recommendations.length === 0) this.generateInitialRecommendations();
  }

  private toPersistedState(lastSavedAt = new Date().toISOString()): PersistedDatabaseState {
    return {
      schemaVersion: this.schemaVersion,
      lastSavedAt,
      outlets: this.outlets,
      policy: this.policy,
      menuItems: this.menuItems,
      competitors: this.competitors,
      observations: this.observations,
      menuMatches: this.menuMatches,
      inventory: this.inventory,
      agents: this.agents,
      auditEvents: this.auditEvents,
      recommendations: this.recommendations,
      priceChanges: this.priceChanges,
    };
  }

  private restorePersistedState(state: PersistedDatabaseState) {
    const snapshot = JSON.parse(JSON.stringify(state)) as PersistedDatabaseState;
    this.schemaVersion = snapshot.schemaVersion;
    this.lastSavedAt = snapshot.lastSavedAt;
    this.outlets = snapshot.outlets;
    this.policy = snapshot.policy;
    this.menuItems = snapshot.menuItems;
    this.competitors = snapshot.competitors;
    this.observations = snapshot.observations;
    this.menuMatches = snapshot.menuMatches;
    this.inventory = snapshot.inventory;
    this.agents = snapshot.agents;
    this.auditEvents = snapshot.auditEvents;
    this.recommendations = snapshot.recommendations;
    this.priceChanges = snapshot.priceChanges;
  }

  /**
   * Atomic, durable write to disk using temporary file replacement
   */
  public saveToDisk(): void {
    let tmpFile: string | undefined;
    let backupTmpFile: string | undefined;
    try {
      const dataDirectory = path.dirname(this.dataFile);
      if (!fs.existsSync(dataDirectory)) fs.mkdirSync(dataDirectory, { recursive: true });
      const state = this.toPersistedState();
      const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
      tmpFile = `${this.dataFile}.tmp.${suffix}`;
      fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
      const descriptor = fs.openSync(tmpFile, 'r+');
      try {
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      if (fs.existsSync(this.dataFile) && !this.recoveredFromBackup) {
        backupTmpFile = `${this.backupFile}.tmp.${suffix}`;
        try {
          fs.copyFileSync(this.dataFile, backupTmpFile);
          if (fs.existsSync(this.backupFile)) fs.unlinkSync(this.backupFile);
          fs.renameSync(backupTmpFile, this.backupFile);
          backupTmpFile = undefined;
        } catch (backupError) {
          console.warn('Could not refresh the previous-state backup; continuing with the durable primary database:', backupError);
        }
      }
      try {
        fs.renameSync(tmpFile, this.dataFile);
      } catch (renameError) {
        const errorCode = (renameError as NodeJS.ErrnoException).code;
        if (errorCode !== 'EPERM' && errorCode !== 'EBUSY') throw renameError;
        console.warn('Atomic database replacement was blocked by the filesystem; writing the synced temporary file over the primary with the prior state retained in backup.');
        fs.copyFileSync(tmpFile, this.dataFile);
        const primaryDescriptor = fs.openSync(this.dataFile, 'r+');
        try {
          fs.fsyncSync(primaryDescriptor);
        } finally {
          fs.closeSync(primaryDescriptor);
        }
      }
      this.lastSavedAt = state.lastSavedAt;
      this.lastPersistedState = JSON.parse(JSON.stringify(state)) as PersistedDatabaseState;
      this.recoveredFromBackup = false;
    } catch (err) {
      console.error('CRITICAL: Failed to write database state to disk:', err);
      if (this.lastPersistedState) this.restorePersistedState(this.lastPersistedState);
      throw new Error('Database state could not be persisted; the last durable state has been restored.');
    } finally {
      for (const tempFile of [tmpFile, backupTmpFile]) {
        if (tempFile && fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch (cleanupError) {
            console.error(`Failed to clean up temporary database file ${tempFile}:`, cleanupError);
          }
        }
      }
    }
  }

  /**
   * Concurrency protection queue: guarantees sequential, thread-safe mutations
   */
  public async runTransaction<T>(fn: () => T | Promise<T>): Promise<T> {
    const nextInQueue = this.writeQueue.then(async () => {
      const before = JSON.parse(JSON.stringify(
        this.toPersistedState(this.lastSavedAt || new Date().toISOString())
      )) as PersistedDatabaseState;
      try {
        const result = await fn();
        this.saveToDisk();
        return result;
      } catch (err) {
        this.restorePersistedState(before);
        throw err;
      }
    });

    this.writeQueue = nextInQueue.then(() => {}).catch(() => {});
    return nextInQueue;
  }

  /**
   * Verification of storage health and persistence status
   */
  public getStorageHealth(): StorageHealth {
    let fileSizeBytes = 0;
    let exists = false;
    try {
      if (fs.existsSync(this.dataFile)) {
        const stats = fs.statSync(this.dataFile);
        fileSizeBytes = stats.size;
        exists = true;
      }
    } catch {
      exists = false;
    }

    return {
      status: exists ? 'healthy' : 'degraded',
      persistedToDisk: exists,
      filePath: this.dataFile,
      fileSizeBytes,
      schemaVersion: this.schemaVersion,
      lastSavedAt: this.lastSavedAt,
      counts: {
        menuItems: this.menuItems.length,
        competitors: this.competitors.length,
        observations: this.observations.length,
        recommendations: this.recommendations.length,
        inventory: this.inventory.length,
        auditEvents: this.auditEvents.length,
      },
    };
  }

  public getCompetitorMedian(menuItemId: string): number | undefined {
    const matchingObs = this.observations.filter((o) => o.menuItemId === menuItemId && o.isAvailable);
    if (matchingObs.length === 0) return undefined;
    const prices = matchingObs.map((o) => o.observedPrice).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  }

  private evaluateItemPriceStability(item: MenuItem, proposedPrice: number, now = new Date()) {
    const history = this.priceChanges.filter((change) => change.menuItemId === item.id);
    const isProtected =
      this.policy.protectedMenuItemIds.includes(item.id) ||
      this.policy.protectedCategories.includes(item.category) ||
      this.policy.loyaltyPriceProtection;
    return evaluatePriceStability(item.currentPrice, proposedPrice, history, {
      maxIncreasePct: this.policy.maxIncreasePct,
      maxDecreasePct: this.policy.maxDecreasePct,
      minimumDaysBetweenPriceChanges: this.policy.minimumDaysBetweenPriceChanges,
      cumulativeIncreaseLimitPct: this.policy.cumulativeIncreaseLimitPct,
      cumulativeIncreaseWindowDays: this.policy.cumulativeIncreaseWindowDays,
      warningThresholdPct: this.policy.trustRiskReviewThresholdPct,
      isProtected,
    }, now);
  }

  private getEffectiveEconomicFloor(item: MenuItem) {
    const activeOutlet = this.outlets.find((o) => o.id === this.policy.activeOutletId) || this.outlets[0];
    const totalDeductionPct = ((activeOutlet?.deliveryCommissionPct || 0) + 2) / 100;
    if (totalDeductionPct >= 1) return Number.POSITIVE_INFINITY;
    return Math.max(
      item.minPolicyPrice || 0,
      Math.ceil((item.totalVariableCost + item.minContribution) / (1 - totalDeductionPct))
    );
  }

  private blockRecommendation(
    rec: PricingRecommendation,
    item: MenuItem,
    reason: string,
    constraintStatus: 'blocked_policy_conflict' | 'blocked_trust_policy' | 'stale_recommendation',
    actor: string
  ) {
    const transitioned = !rec.isBlocked;
    rec.isBlocked = true;
    rec.policyChecksPassed = false;
    rec.constraintStatus = constraintStatus;
    rec.flagReasons = [...new Set([...rec.flagReasons, reason])];
    rec.updatedAt = new Date().toISOString();
    if (transitioned) {
      this.auditEvents.unshift({
        id: `audit-${Date.now()}`,
        timestamp: rec.updatedAt,
        actor,
        action: 'PRICE_BLOCKED',
        menuItemId: item.id,
        menuItemName: item.name,
        previousPrice: item.currentPrice,
        newPrice: rec.suggestedPrice,
        rationale: reason,
        policyChecksPassed: false,
        metadata: { recommendationId: rec.id, constraintStatus },
      });
    }
    this.saveToDisk();
    throw new Error(reason);
  }

  private validateRecommendedPrice(rec: PricingRecommendation, item: MenuItem, actor: string) {
    if (item.currentPrice !== rec.currentPrice) {
      this.blockRecommendation(
        rec,
        item,
        'Recommendation is stale because the menu price changed after it was generated. Recalculate before proceeding.',
        'stale_recommendation',
        actor
      );
    }
    const economicFloor = this.getEffectiveEconomicFloor(item);
    if (rec.suggestedPrice < economicFloor) {
      this.blockRecommendation(
        rec,
        item,
        `Safety Block: proposed price ${rec.suggestedPrice} is below the current economic floor ${economicFloor}.`,
        'blocked_policy_conflict',
        actor
      );
    }
    if (rec.suggestedPrice > item.maxPolicyPrice) {
      this.blockRecommendation(
        rec,
        item,
        `Safety block: proposed price ${rec.suggestedPrice} exceeds the item policy ceiling ${item.maxPolicyPrice}.`,
        'blocked_policy_conflict',
        actor
      );
    }
    const stability = this.evaluateItemPriceStability(item, rec.suggestedPrice);
    if (stability.blocked) {
      this.blockRecommendation(
        rec,
        item,
        `Price stability policy blocked this recommendation: ${stability.reasons.join('; ')}`,
        'blocked_trust_policy',
        actor
      );
    }
    if (stability.reasons.length) {
      rec.flagReasons = [...new Set([...rec.flagReasons, ...stability.reasons])];
      rec.stabilityPolicyStatus = stability.status;
    }
    return stability;
  }

  private createTrustAssessment(
    item: MenuItem,
    status: 'stable' | 'within_limits' | 'warning' | 'blocked' | 'insufficient_data',
    evidence: string[],
    periodDays = this.policy.cumulativeIncreaseWindowDays
  ): CustomerTrustAssessment {
    const hasHistory = this.priceChanges.some((change) => change.menuItemId === item.id);
    const riskLevel = !hasHistory
      ? 'insufficient data'
      : status === 'blocked'
        ? 'high'
        : status === 'warning'
          ? 'medium'
          : 'low';
    const limitations = [
      'No customer identifiers, repeat-customer history, or complaint records are available; this is not a customer-specific churn prediction.',
      'Only actual price changes recorded by this version of the application are included. Older price movements may not be recoverable.',
    ];
    if (!item.dailySalesLast60Days?.length && !item.dailySalesHistory?.length) {
      limitations.push('No persisted daily order series is available for this menu item.');
    }
    return {
      riskLevel,
      assessmentType: 'pricing-stability risk',
      evidence: evidence.length ? evidence : ['No applied-price history is available for the examined period.'],
      periodExamined: `Rolling ${periodDays} days ending ${new Date().toISOString()}`,
      explanation: riskLevel === 'insufficient data'
        ? 'Pricing-stability risk cannot be assessed reliably without actual applied-price history.'
        : riskLevel === 'high'
          ? 'A mandatory price-stability constraint would be exceeded by the proposed price.'
          : riskLevel === 'medium'
            ? 'The proposed movement is unusually large or is approaching a configured rolling limit and should receive manager review.'
            : 'Recorded actual price changes remain within configured stability limits for the examined period.',
      dataQuality: hasHistory
        ? 'Based on persisted, actual price applications and manual price changes recorded by RestaurantIQ.'
        : 'Insufficient actual applied-price history; legacy last-updated timestamps are not treated as verified price-change events.',
      limitations,
    };
  }

  public getCustomerTrustDashboard(): CustomerTrustDashboard {
    const now = new Date();
    const periodStart = now.getTime() - this.policy.cumulativeIncreaseWindowDays * 86400000;
    const assessments = this.menuItems.map((item) => {
      const history = this.priceChanges.filter((change) => change.menuItemId === item.id);
      const stability = this.evaluateItemPriceStability(item, item.currentPrice, now);
      const itemHistory = history.filter((change) => new Date(change.changedAt).getTime() >= periodStart);
      const increases = itemHistory.reduce((sum, change) => (
        change.newPrice > change.previousPrice && change.previousPrice > 0
          ? sum + (change.newPrice - change.previousPrice) / change.previousPrice
          : sum
      ), 0);
      const dailySales = item.dailySalesLast60Days || item.dailySalesHistory || [];
      const recentOrders = dailySales.slice(-30).reduce((sum, day) => sum + day.orders, 0);
      const priorOrders = dailySales.slice(-60, -30).reduce((sum, day) => sum + day.orders, 0);
      const ordersTrend = dailySales.length >= 60
        ? recentOrders > priorOrders * 1.05
          ? 'increasing' as const
          : recentOrders < priorOrders * 0.95
            ? 'decreasing' as const
            : 'stable' as const
        : 'insufficient data' as const;
      const evidence = history.length
        ? [
            `${history.length} actual price change(s) recorded; ${itemHistory.length} within the rolling ${this.policy.cumulativeIncreaseWindowDays}-day window.`,
            `Cumulative increases in window: ${(increases * 100).toFixed(1)}%.`,
            ...itemHistory.slice(0, 5).map((change) =>
              `${change.changedAt}: ${change.previousPrice} → ${change.newPrice} (${change.source}, ${change.actor}).`
            ),
          ]
        : [];
      const protectedItem = this.policy.protectedMenuItemIds.includes(item.id) ||
        this.policy.protectedCategories.includes(item.category) || this.policy.loyaltyPriceProtection;
      const sortedHistory = [...itemHistory].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
      const frequentChanges = sortedHistory.length > 1 && sortedHistory.slice(1).some((change, index) =>
        new Date(change.changedAt).getTime() - new Date(sortedHistory[index].changedAt).getTime() <
        this.policy.minimumDaysBetweenPriceChanges * 86400000
      );
      const assessmentStatus = !history.length
        ? 'insufficient_data' as const
        : increases >= this.policy.cumulativeIncreaseLimitPct
          ? 'blocked' as const
          : increases >= this.policy.cumulativeIncreaseLimitPct * 0.8 || frequentChanges
            ? 'warning' as const
            : 'within_limits' as const;
      return {
        menuItemId: item.id,
        menuItemName: item.name,
        category: item.category,
        currentPrice: item.currentPrice,
        lastActualPriceChangeAt: stability.lastActualPriceChangeAt,
        recentPriceChanges: itemHistory.sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
        cumulativeIncreasePct: Math.round(increases * 10000) / 100,
        stabilityPolicyStatus: protectedItem
          ? 'stable' as const
          : history.length
            ? itemHistory.length === 0
              ? 'stable' as const
              : (increases >= this.policy.cumulativeIncreaseLimitPct * 0.8 ? 'warning' as const : 'within_limits' as const)
            : 'insufficient_data' as const,
        customerTrustRisk: this.createTrustAssessment(item, assessmentStatus, evidence),
        ordersTrend,
        orderDataQuality: dailySales.length >= 60
          ? '60-day series available; RestaurantIQ seeded/demo sales data is synthetic and must not be interpreted as customer-level repeat-order history.'
          : 'Insufficient daily order data for a trend comparison.',
      };
    });
    const recentChanges = this.priceChanges.filter((change) => new Date(change.changedAt).getTime() >= periodStart);
    const totalUpwardMovement = recentChanges.reduce((sum, change) => (
      change.newPrice > change.previousPrice ? sum + change.newPrice - change.previousPrice : sum
    ), 0);
    const totalPriorPriceBasis = recentChanges.reduce((sum, change) => (
      change.newPrice > change.previousPrice ? sum + change.previousPrice : sum
    ), 0);
    return {
      generatedAt: now.toISOString(),
      periodDays: this.policy.cumulativeIncreaseWindowDays,
      summary: {
        stableMenuItems: assessments.filter((item) => item.stabilityPolicyStatus === 'stable').length,
        approachingLimits: assessments.filter((item) => item.stabilityPolicyStatus === 'warning').length,
        recommendationsForReview: this.recommendations.filter((rec) => rec.status === 'pending' && (rec.requiresStepOverride || rec.stabilityPolicyStatus === 'warning')).length,
        blockedRecommendations: this.recommendations.filter((rec) => rec.status === 'pending' && rec.isBlocked).length,
        actualPriceChanges: recentChanges.length,
        cumulativeIncreasePct: totalPriorPriceBasis > 0
          ? Math.round((totalUpwardMovement / totalPriorPriceBasis) * 10000) / 100
          : 0,
      },
      assessments,
    };
  }

  public generateInitialRecommendations() {
    const candidateItemIds = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'item-6', 'item-13'];
    const activeOutlet = this.outlets.find((o) => o.id === this.policy.activeOutletId) || this.outlets[0];

    const generatedAt = new Date().toISOString();
    const generatedRecommendations = candidateItemIds.map((itemId, recommendationIndex) => {
      const item = this.menuItems.find((m) => m.id === itemId) || this.menuItems[0];
      const compMedian = this.getCompetitorMedian(itemId);

      let demandIndex = 1.0;
      if (item.demandTrend === 'surging') demandIndex = 1.22;
      if (item.demandTrend === 'softening') demandIndex = 0.88;

      const inventoryRatio = item.reorderThreshold > 0 ? item.inventoryQty / item.reorderThreshold : 1.0;

      const calc = calculateDynamicPrice({
        currentPrice: item.currentPrice,
        variableCost: item.totalVariableCost,
        minContribution: item.minContribution,
        minPolicyPrice: item.minPolicyPrice,
        maxPolicyPrice: item.maxPolicyPrice,
        competitorMedian: compMedian,
        competitorConfidence: 0.92,
        competitorDataFreshnessDays: 1,
        demandIndex,
        inventoryRatio,
        maxMovementPct: Math.max(this.policy.maxIncreasePct, this.policy.maxDecreasePct),
        roundingStep: this.policy.roundingStep,
        deliveryCommissionPct: (activeOutlet?.deliveryCommissionPct || 0) / 100,
        paymentProcessingFeePct: 0.02,
      });

      const stability = this.evaluateItemPriceStability(item, calc.suggestedPrice);
      const isBlocked = calc.isBlocked || stability.blocked;
      const trustRisk = this.createTrustAssessment(item, stability.status, stability.recentPriceChanges.length
        ? [
            `${stability.recentPriceChanges.length} actual price change(s) in the rolling ${this.policy.cumulativeIncreaseWindowDays}-day window.`,
            `Cumulative applied-price increases including this proposal: ${(stability.cumulativeIncreasePct * 100).toFixed(1)}%.`,
            ...stability.recentPriceChanges.slice(0, 5).map((change) =>
              `${change.changedAt}: ${change.previousPrice} → ${change.newPrice} (${change.source}, ${change.actor}).`
            ),
          ]
        : []);
      return {
        id: `rec-${item.id}-${Date.parse(generatedAt)}-${this.recommendations.length + recommendationIndex}`,
        menuItemId: item.id,
        menuItemName: item.name,
        category: item.category,
        currentPrice: item.currentPrice,
        suggestedPrice: calc.suggestedPrice,
        priceDelta: calc.priceDelta,
        priceDeltaPct: calc.priceDeltaPct,
        variableCost: item.totalVariableCost,
        currentContribution: calc.currentContribution,
        suggestedContribution: calc.suggestedContribution,
        currentContributionMarginPct: calc.currentContributionMarginPct,
        suggestedContributionMarginPct: calc.suggestedContributionMarginPct,
        grossContributionMarginPctCurrent: calc.grossContributionMarginPctCurrent,
        grossContributionMarginPctSuggested: calc.grossContributionMarginPctSuggested,
        competitorMedian: compMedian || item.currentPrice,
        demandIndex,
        inventoryRatio,
        confidenceScore: calc.confidenceScore,
        status: 'pending' as const,
        reason: calc.explanation,
        economicFloor: calc.economicFloor,
        policyFloor: calc.policyFloor,
        policyCeiling: calc.policyCeiling,
        policyChecksPassed: calc.policyChecksPassed && !stability.blocked,
        isBlocked,
        requiresStepOverride: calc.requiresStepOverride,
        constraintStatus: stability.blocked ? 'blocked_trust_policy' as const : calc.constraintStatus,
        flagReasons: [...calc.flagReasons, ...stability.reasons],
        lastActualPriceChangeAt: stability.lastActualPriceChangeAt,
        recentPriceChanges: stability.recentPriceChanges,
        cumulativeIncreasePct: stability.cumulativeIncreasePct * 100,
        stabilityPolicyStatus: stability.status,
        customerTrustRisk: trustRisk,
        candidates: calc.candidates,
        assumptions: calc.assumptions,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      };
    });
    this.recommendations = this.recommendations.map((rec) => {
      if (rec.status !== 'pending' || !candidateItemIds.includes(rec.menuItemId)) return rec;
      return {
        ...rec,
        status: 'deferred' as const,
        reason: `${rec.reason} Superseded by a newer recommendation generated at ${generatedAt}.`,
        updatedAt: generatedAt,
      };
    }).concat(generatedRecommendations);
  }

  // Dashboard Aggregations derived strictly from actual live state
  public getDashboardMetrics() {
    let totalRevenue30Days = 0;
    let priorRevenue30Days = 0;
    let totalCost30Days = 0;
    let priorCost30Days = 0;
    let totalOrders = 0;
    let priorOrders = 0;

    this.menuItems.forEach((item) => {
      const history = item.dailySalesLast60Days || [];
      if (history.length >= 60) {
        // Prior 30 days: historical indices 0..29
        const prior30 = history.slice(0, 30);
        // Current 30 days: historical indices 30..59
        const curr30 = history.slice(30, 60);

        const currItemOrders = curr30.reduce((sum: number, d: { orders: number }) => sum + d.orders, 0);
        const priorItemOrders = prior30.reduce((sum: number, d: { orders: number }) => sum + d.orders, 0);

        totalOrders += currItemOrders;
        priorOrders += priorItemOrders;

        totalRevenue30Days += currItemOrders * item.currentPrice;
        priorRevenue30Days += priorItemOrders * item.currentPrice;

        totalCost30Days += currItemOrders * item.totalVariableCost;
        priorCost30Days += priorItemOrders * item.totalVariableCost;
      } else {
        const orders = item.historicalSalesLast30Days || 0;
        totalOrders += orders;
        totalRevenue30Days += orders * item.currentPrice;
        totalCost30Days += orders * item.totalVariableCost;
      }
    });

    const totalContribution30Days = totalRevenue30Days - totalCost30Days;
    const priorContribution30Days = priorRevenue30Days - priorCost30Days;

    const contributionMarginPct =
      totalRevenue30Days > 0
        ? Math.round((totalContribution30Days / totalRevenue30Days) * 1000) / 10
        : 0;

    const avgCheckSize = totalOrders > 0 ? Math.round(totalRevenue30Days / totalOrders) : 0;
    const priorAvgCheckSize = priorOrders > 0 ? Math.round(priorRevenue30Days / priorOrders) : 0;

    // Genuine delta percentage calculations based on chronological comparison
    const revenueChangePct =
      priorRevenue30Days > 0
        ? Math.round(((totalRevenue30Days - priorRevenue30Days) / priorRevenue30Days) * 1000) / 10
        : 0;

    const contributionChangePct =
      priorContribution30Days > 0
        ? Math.round(((totalContribution30Days - priorContribution30Days) / priorContribution30Days) * 1000) / 10
        : 0;

    const ordersChangePct =
      priorOrders > 0
        ? Math.round(((totalOrders - priorOrders) / priorOrders) * 1000) / 10
        : 0;

    const checkSizeChangePct =
      priorAvgCheckSize > 0
        ? Math.round(((avgCheckSize - priorAvgCheckSize) / priorAvgCheckSize) * 1000) / 10
        : 0;

    const pendingRecs = this.recommendations.filter((r) => r.status === 'pending');
    const expectedMonthlyOpportunity = pendingRecs.reduce((acc, r) => {
      const item = this.menuItems.find((m) => m.id === r.menuItemId);
      const monthlyOrders = item ? item.historicalSalesLast30Days : 100;
      const deltaContribution = r.suggestedContribution - r.currentContribution;
      return acc + (deltaContribution > 0 ? deltaContribution * monthlyOrders : 0);
    }, 0);

    const competitorPriceShiftsCount = this.observations.filter((obs) => {
      const item = this.menuItems.find((m) => m.id === obs.menuItemId);
      return item && Math.abs(item.currentPrice - obs.observedPrice) >= 5;
    }).length;

    return {
      periodRevenue: totalRevenue30Days,
      revenueChangePct,
      periodContribution: totalContribution30Days,
      contributionChangePct,
      contributionMarginPct,
      averageCheckSize: avgCheckSize,
      checkSizeChangePct,
      totalOrders,
      ordersChangePct,
      pendingApprovalsCount: pendingRecs.length,
      competitorPriceShiftsCount,
      highMarginCount: this.menuItems.filter(
        (i) => i.currentPrice > 0 && (i.currentPrice - i.totalVariableCost) / i.currentPrice > 0.45
      ).length,
      lowStockAlertsCount: this.inventory.filter(
        (inv) => inv.status === 'low_stock' || inv.status === 'critical'
      ).length,
      expectedMonthlyOpportunity: Math.round(expectedMonthlyOpportunity),
      currencySymbol: this.policy.currencySymbol,
    };
  }

  public recomputeCompetitorDistances() {
    const activeOutlet = this.outlets.find((o) => o.id === this.policy.activeOutletId) || this.outlets[0];
    if (!activeOutlet) return;
    this.competitors.forEach((c) => {
      if (c.latitude && c.longitude) {
        const R = 6371; // Earth radius in km
        const dLat = (c.latitude - activeOutlet.latitude) * (Math.PI / 180);
        const dLon = (c.longitude - activeOutlet.longitude) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(activeOutlet.latitude * (Math.PI / 180)) *
            Math.cos(c.latitude * (Math.PI / 180)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        c.distanceKm = Math.round(R * centralAngle * 10) / 10;
      }
    });
  }

  public setActiveOutlet(outletId: string) {
    const outlet = this.outlets.find((o) => o.id === outletId);
    if (!outlet) throw new Error('Outlet not found');
    this.outlets.forEach((o) => (o.isActive = o.id === outletId));
    this.policy.activeOutletId = outletId;
    this.recomputeCompetitorDistances();
    this.generateInitialRecommendations();
    this.saveToDisk();
    return outlet;
  }

  public updateMenuMatchStatus(matchId: string, newStatus: 'high_confidence' | 'needs_review' | 'rejected', actor: string = 'Culinary Strategist') {
    const match = this.menuMatches.find((m) => m.id === matchId);
    if (!match) throw new Error('Menu match record not found');
    match.matchStatus = newStatus;

    this.auditEvents.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'MENU_MATCH_UPDATED',
      menuItemId: match.menuItemId,
      menuItemName: match.menuItemName,
      rationale: `Updated competitor pairing for "${match.competitorDishName}" to ${newStatus}.`,
      policyChecksPassed: true,
    });

    this.saveToDisk();
    return match;
  }

  public importCompetitorMenu(
    competitorId: string,
    rows: Array<{ dishName: string; price: number; portionGrams?: number }>,
    actor: string = 'Operator (Import)'
  ) {
    const comp = this.competitors.find((c) => c.id === competitorId);
    if (!comp) throw new Error('Competitor not found');

    if (rows.length > 500) {
      throw new Error('Batch payload exceeds maximum allowed size (500 rows)');
    }

    const addedObs: CompetitorObservation[] = [];
    rows.forEach((row, i) => {
      const sanitizedName = String(row.dishName || '').trim().slice(0, 120);
      const cleanPrice = Number(row.price);
      if (!sanitizedName || isNaN(cleanPrice) || cleanPrice <= 0) return;

      const matchedItem =
        this.menuItems.find(
          (m) =>
            m.name.toLowerCase().includes(sanitizedName.toLowerCase()) ||
            sanitizedName.toLowerCase().includes(m.name.toLowerCase().split(' ')[0])
        ) || this.menuItems[0];

      const newObs: CompetitorObservation = {
        id: `obs-imp-${Date.now()}-${i}`,
        competitorId: comp.id,
        competitorName: comp.name,
        menuItemId: matchedItem.id,
        menuItemName: matchedItem.name,
        dishName: sanitizedName,
        observedPrice: cleanPrice,
        isAvailable: true,
        portionGrams: Number(row.portionGrams) || 450,
        confidenceScore: 0.88,
        freshnessTimestamp: new Date().toISOString(),
        isSimulated: false,
        source: 'uploaded_csv',
        provenanceLabel: 'Uploaded Spreadsheet Menu (Operator Import)',
      };

      this.observations.unshift(newObs);
      addedObs.push(newObs);
    });

    comp.activeMatchesCount += addedObs.length;
    this.generateInitialRecommendations();

    this.auditEvents.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'POLICY_UPDATED',
      rationale: `Imported ${addedObs.length} competitor observations for ${comp.name}.`,
      policyChecksPassed: true,
    });

    this.saveToDisk();
    return { importedCount: addedObs.length, observations: addedObs };
  }

  /**
   * Approves a recommendation with strict policy safeguards:
   * Blocks approval if economic floor > ceiling or if policy checks failed
   * unless explicit authorized override is granted.
   */
  public approveRecommendation(recId: string, actor: string = 'Revenue Manager', allowStepOverride: boolean = false) {
    const rec = this.recommendations.find((r) => r.id === recId);
    if (!rec) throw new Error('Recommendation not found');
    if (rec.status === 'applied') throw new Error('Recommendation has already been applied to POS');

    const item = this.menuItems.find((menuItem) => menuItem.id === rec.menuItemId);
    if (!item) throw new Error('Menu item not found in catalog');
    this.validateRecommendedPrice(rec, item, actor);

    // Idempotent: if already approved, return current approved state
    if (rec.status === 'approved') {
      return rec;
    }

    // Enforcement: Blocked recommendations cannot be approved under any circumstances
    if (rec.isBlocked) {
      throw new Error(`Approval blocked: ${rec.flagReasons.join('; ')}`);
    }

    // Enforcement: If step limit was breached by economic floor, require authorized override flag
    if (rec.requiresStepOverride && !allowStepOverride) {
      throw new Error(
        `Approval denied: Recommended price exceeds configured maximum step limit to meet economic floor. Requires explicit authorized step override.`
      );
    }

    rec.status = 'approved';
    rec.approvedBy = actor;
    rec.updatedAt = new Date().toISOString();

    this.auditEvents.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'PRICE_APPROVED',
      menuItemId: rec.menuItemId,
      menuItemName: rec.menuItemName,
      previousPrice: rec.currentPrice,
      newPrice: rec.suggestedPrice,
      rationale: `Approved dynamic price: ${rec.reason}`,
      policyChecksPassed: rec.policyChecksPassed || allowStepOverride,
      metadata: { deltaPct: rec.priceDeltaPct, stepOverrideGranted: allowStepOverride },
    });

    this.saveToDisk();
    return rec;
  }

  /**
   * Applies an approved price to the MenuItem and terminal, with re-validation of economic floor
   */
  public applyRecommendation(recId: string, actor: string = 'Revenue Manager') {
    const rec = this.recommendations.find((r) => r.id === recId);
    if (!rec) throw new Error('Recommendation not found');
    if (rec.status === 'applied') throw new Error('Recommendation has already been applied');
    if (rec.status !== 'approved') throw new Error('Recommendation must be approved before being applied to POS');
    if (rec.isBlocked) throw new Error(`Cannot apply blocked recommendation: ${rec.flagReasons.join('; ')}`);

    const item = this.menuItems.find((m) => m.id === rec.menuItemId);
    if (!item) throw new Error('Menu item not found in catalog');

    this.validateRecommendedPrice(rec, item, actor);

    const previousPrice = item.currentPrice;
    if (previousPrice === rec.suggestedPrice) throw new Error('Recommendation is stale: proposed price is already the current applied price.');
    item.currentPrice = rec.suggestedPrice;
    item.lastUpdated = new Date().toISOString();
    const changedAt = item.lastUpdated;
    this.priceChanges.unshift({
      id: `price-change-${Date.now()}-${this.priceChanges.length}`,
      menuItemId: item.id,
      menuItemName: item.name,
      previousPrice,
      newPrice: rec.suggestedPrice,
      changedAt,
      actor,
      source: 'recommendation',
      rationale: `Applied approved recommendation ${rec.id}.`,
    });

    rec.status = 'applied';
    rec.appliedBy = actor;
    rec.updatedAt = new Date().toISOString();

    this.auditEvents.unshift({
      id: `audit-${Date.now()}`,
      timestamp: changedAt,
      actor,
      action: 'PRICE_APPLIED',
      menuItemId: item.id,
      menuItemName: item.name,
      previousPrice,
      newPrice: rec.suggestedPrice,
      rationale: `Applied new price ₹${rec.suggestedPrice} to POS. Preserves economic floor of ₹${rec.economicFloor}.`,
      policyChecksPassed: true,
      metadata: { posProvider: this.policy.posIntegration.provider, confirmedSynced: true },
    });

    this.saveToDisk();
    return { recommendation: rec, menuItem: item };
  }

  public rejectRecommendation(recId: string, reasonText: string, actor: string = 'Revenue Manager') {
    const rec = this.recommendations.find((r) => r.id === recId);
    if (!rec) throw new Error('Recommendation not found');
    if (rec.status === 'applied') throw new Error('Cannot reject a price change that has already been applied to POS');

    rec.status = 'rejected';
    rec.rejectedBy = actor;
    rec.rejectionReason = reasonText;
    rec.updatedAt = new Date().toISOString();

    this.auditEvents.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'PRICE_REJECTED',
      menuItemId: rec.menuItemId,
      menuItemName: rec.menuItemName,
      previousPrice: rec.currentPrice,
      newPrice: rec.suggestedPrice,
      rationale: `Rejected price change: ${reasonText}`,
      policyChecksPassed: true,
    });

    this.saveToDisk();
    return rec;
  }

  public overridePrice(menuItemId: string, newPrice: number, overrideReason: string, actor: string = 'Administrator') {
    const item = this.menuItems.find((m) => m.id === menuItemId);
    if (!item) throw new Error('Menu item not found');

    const economicFloor = this.getEffectiveEconomicFloor(item);
    if (newPrice < economicFloor) {
      throw new Error(
        `Override rejected: ₹${newPrice} violates economic floor of ₹${economicFloor} (₹${item.totalVariableCost} variable cost + ₹${item.minContribution} minimum contribution after active fees)`
      );
    }

    if (newPrice > item.maxPolicyPrice) {
      throw new Error(
        `Override rejected: ₹${newPrice} exceeds item maximum policy ceiling of ₹${item.maxPolicyPrice}`
      );
    }

    const previousPrice = item.currentPrice;
    const stability = this.evaluateItemPriceStability(item, newPrice);
    if (stability.blocked) {
      throw new Error(`Override rejected by mandatory price stability policy: ${stability.reasons.join('; ')}`);
    }
    if (newPrice === previousPrice) throw new Error('Override rejected: new price matches the current price; no price change would be recorded.');
    item.currentPrice = newPrice;
    item.lastUpdated = new Date().toISOString();
    this.priceChanges.unshift({
      id: `price-change-${Date.now()}-${this.priceChanges.length}`,
      menuItemId: item.id,
      menuItemName: item.name,
      previousPrice,
      newPrice,
      changedAt: item.lastUpdated,
      actor,
      source: 'manual_override',
      rationale: overrideReason,
    });

    this.auditEvents.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'MANUAL_OVERRIDE',
      menuItemId: item.id,
      menuItemName: item.name,
      previousPrice,
      newPrice,
      rationale: `Manual operator override: ${overrideReason}`,
      policyChecksPassed: true,
      metadata: { stabilityPolicyStatus: stability.status, cumulativeIncreasePct: stability.cumulativeIncreasePct * 100 },
    });

    this.saveToDisk();
    return item;
  }

  public adjustInventoryStock(inventoryId: string, newStockQty: number, adjustmentReason: string, actor: string = 'Kitchen Ops') {
    const inv = this.inventory.find((i) => i.id === inventoryId);
    if (!inv) throw new Error('Inventory item not found');

    const oldQty = inv.stockQty;
    inv.stockQty = Math.max(0, newStockQty);
    inv.status = inv.stockQty < inv.reorderPoint ? 'low_stock' : inv.stockQty > inv.reorderPoint * 2 ? 'surplus' : 'healthy';

    this.auditEvents.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'STOCK_ADJUSTED',
      rationale: `Adjusted ${inv.name} from ${oldQty}${inv.unit} to ${newStockQty}${inv.unit}: ${adjustmentReason}`,
      policyChecksPassed: true,
    });

    this.saveToDisk();
    return inv;
  }
}

export const db = new RestaurantDatabase();
