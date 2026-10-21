import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';
import { RestaurantDatabase, type PersistedDatabaseState } from './db.ts';
import { createPostgresTlsConfig } from '../scripts/postgres-tls.ts';
import { validatePostgresTestTarget } from '../scripts/postgres-test-target.ts';
import type {
  AgentExecution,
  AuditEvent,
  Competitor,
  CompetitorObservation,
  InventoryItem,
  MenuItem,
  MenuMatch,
  PriceChangeRecord,
  PricingRecommendation,
  RestaurantOutlet,
} from './types.ts';

const restaurantId = 'restaurantiq-primary';
const projectRef = 'idackzrtqfvuppwvuksu';
const expectedPoolerHost = 'aws-0-ap-northeast-1.pooler.supabase.com';
const requestLock = [7419021, 2] as const;

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for PostgreSQL application mode.');
  }

  if (process.env.RESTAURANTIQ_TEST_DATABASE_DISPOSABLE === 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Disposable PostgreSQL test mode is unavailable in production.');
    }
    const testTarget = validatePostgresTestTarget(process.env, { allowRuntimeMatch: true });
    if (testTarget.connectionString !== connectionString) {
      throw new Error('DATABASE_URL must exactly match TEST_DATABASE_URL in disposable test mode.');
    }
    return new Pool({
      ...createPostgresTlsConfig(connectionString),
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: false,
      statement_timeout: 20000,
      query_timeout: 25000,
      application_name: 'restaurantiq-postgres-test',
    });
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection URL.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== expectedPoolerHost ||
    decodeURIComponent(url.username) !== `restaurantiq_runtime.${projectRef}` ||
    decodeURIComponent(url.pathname.slice(1)) !== 'postgres'
  ) {
    throw new Error('DATABASE_URL must target the configured Supabase Session Pooler using the restricted restaurantiq_runtime role.');
  }

  return new Pool({
    ...createPostgresTlsConfig(connectionString),
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: false,
    statement_timeout: 20000,
    query_timeout: 25000,
    application_name: 'restaurantiq-express-runtime',
  });
}

function numericFields(row: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    if (row[field] !== null && row[field] !== undefined) {
      row[field] = finiteNumber(row[field]);
    }
  }
}

function updateAssignments(columns: string[], conflictColumns: string[]) {
  const protectedColumns = new Set(conflictColumns);
  const updates = columns.filter((column) => !protectedColumns.has(column));
  if (!updates.length) return 'DO NOTHING';
  return `DO UPDATE SET ${updates.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}`;
}

function changedRecords<T>(current: T[], previous: T[], key: (record: T) => string): T[] {
  const previousByKey = new Map(previous.map((record) => [key(record), JSON.stringify(record)]));
  return current.filter((record) => previousByKey.get(key(record)) !== JSON.stringify(record));
}

function removedRecords<T>(current: T[], previous: T[], key: (record: T) => string): T[] {
  const currentKeys = new Set(current.map(key));
  return previous.filter((record) => !currentKeys.has(key(record)));
}

async function insertMany(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictColumns: string[],
  appendOnly = false,
) {
  if (!rows.length) return;
  const batchSize = 500;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const values: unknown[] = [];
    const placeholders = rows.slice(offset, offset + batchSize).map((row) => {
      const expressions = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${expressions.join(', ')})`;
    });
    const conflictTarget = conflictColumns.join(', ');
    const action = appendOnly
      ? 'DO NOTHING'
      : updateAssignments(columns, conflictColumns);
    await client.query(
      `INSERT INTO public.${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT (${conflictTarget}) ${action}`,
      values,
    );
  }
}

function toPolicy(row: Record<string, unknown>, categories: string[], protectedIds: string[]) {
  const integration = asJson<Record<string, unknown>>(row.pos_integration, {});
  return {
    restaurantName: String(row.restaurant_name ?? 'Restaurant'),
    activeOutletId: String(row.active_outlet_id ?? ''),
    currencySymbol: String(row.currency_symbol ?? '₹'),
    currencyCode: String(row.currency_code ?? 'INR'),
    maxMovementPct: finiteNumber(row.max_movement_pct, 0.15),
    maxIncreasePct: finiteNumber(row.max_increase_pct, 0.15),
    maxDecreasePct: finiteNumber(row.max_decrease_pct, 0.15),
    minimumDaysBetweenPriceChanges: finiteNumber(row.minimum_days_between_price_changes, 7),
    cumulativeIncreaseLimitPct: finiteNumber(row.cumulative_increase_limit_pct, 0.2),
    cumulativeIncreaseWindowDays: finiteNumber(row.cumulative_increase_window_days, 30),
    trustRiskReviewThresholdPct: finiteNumber(row.trust_risk_review_threshold_pct, 0.1),
    protectedMenuItemIds: protectedIds,
    protectedCategories: categories,
    loyaltyPriceProtection: row.loyalty_price_protection === true,
    defaultMinContribution: finiteNumber(row.default_min_contribution, 60),
    roundingStep: finiteNumber(row.rounding_step, 5),
    dataFreshnessMaxDays: finiteNumber(row.data_freshness_max_days, 3),
    requireManualApprovalThresholdPct: finiteNumber(row.require_manual_approval_threshold_pct, 10),
    posIntegration: {
      provider: (integration.provider ?? 'Manual') as 'Toast' | 'Square' | 'Clover' | 'Petpooja' | 'Manual',
      status: (integration.status ?? 'demo_mode') as 'connected' | 'demo_mode',
      syncIntervalMinutes: finiteNumber(integration.syncIntervalMinutes, 15),
      lastSyncTimestamp: String(integration.lastSyncTimestamp ?? new Date(0).toISOString()),
    },
  };
}

export class PostgresStore {
  private pool: Pool | null = null;

  private getPool() {
    if (!this.pool) this.pool = createPool();
    return this.pool;
  }

  public acquireClient() {
    return this.getPool().connect();
  }

  public async initialize(database: RestaurantDatabase) {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT 1');
      const state = await this.loadState(client, database);
      await client.query('COMMIT');
      database.replaceState(state);
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error('PostgreSQL startup verification failed; the API was not started.');
    } finally {
      client.release();
    }
  }

  public async beginRequest(client: PoolClient, database: RestaurantDatabase) {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [...requestLock]);
    const state = await this.loadState(client, database);
    database.replaceState(state);
    return state;
  }

  public async loadState(client: PoolClient, defaults: RestaurantDatabase): Promise<PersistedDatabaseState> {
    const result = await client.query<{
      restaurant: Record<string, unknown> | null;
      policy: Record<string, unknown> | null;
      outlets: Record<string, unknown>[];
      protected_categories: string[];
      protected_items: string[];
      menu_items: Record<string, unknown>[];
      daily_sales: Record<string, unknown>[];
      competitors: Record<string, unknown>[];
      observations: Record<string, unknown>[];
      menu_matches: Record<string, unknown>[];
      inventory: Record<string, unknown>[];
      inventory_links: Record<string, unknown>[];
      recommendations: Record<string, unknown>[];
      price_changes: Record<string, unknown>[];
      audit_events: Record<string, unknown>[];
      agents: Record<string, unknown>[];
    }>(
      `SELECT
         (SELECT to_jsonb(r) FROM public.restaurants r WHERE r.id = $1) AS restaurant,
         (SELECT to_jsonb(p) || jsonb_build_object('restaurant_name', r.name)
            FROM public.pricing_policies p JOIN public.restaurants r ON r.id = p.restaurant_id
            WHERE p.restaurant_id = $1) AS policy,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.outlets WHERE restaurant_id = $1 ORDER BY id) x), '[]'::jsonb) AS outlets,
         COALESCE((SELECT jsonb_agg(category ORDER BY category) FROM public.protected_price_categories WHERE restaurant_id = $1), '[]'::jsonb) AS protected_categories,
         COALESCE((SELECT jsonb_agg(menu_item_id ORDER BY menu_item_id) FROM public.protected_menu_items WHERE restaurant_id = $1), '[]'::jsonb) AS protected_items,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.menu_items WHERE restaurant_id = $1 ORDER BY id) x), '[]'::jsonb) AS menu_items,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT s.* FROM public.daily_sales s JOIN public.menu_items m ON m.id = s.menu_item_id WHERE m.restaurant_id = $1 ORDER BY s.menu_item_id, s.sales_date, s.series_name) x), '[]'::jsonb) AS daily_sales,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.competitors WHERE restaurant_id = $1 ORDER BY id) x), '[]'::jsonb) AS competitors,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.competitor_observations WHERE restaurant_id = $1 ORDER BY freshness_timestamp DESC) x), '[]'::jsonb) AS observations,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.menu_matches WHERE restaurant_id = $1 ORDER BY id) x), '[]'::jsonb) AS menu_matches,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.inventory_items WHERE restaurant_id = $1 ORDER BY id) x), '[]'::jsonb) AS inventory,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT l.* FROM public.inventory_menu_items l JOIN public.inventory_items i ON i.id = l.inventory_item_id WHERE i.restaurant_id = $1 ORDER BY l.inventory_item_id,l.menu_item_id) x), '[]'::jsonb) AS inventory_links,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pricing_recommendations WHERE restaurant_id = $1 ORDER BY created_at DESC) x), '[]'::jsonb) AS recommendations,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.price_changes WHERE restaurant_id = $1 ORDER BY changed_at DESC) x), '[]'::jsonb) AS price_changes,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.audit_events WHERE restaurant_id = $1 ORDER BY timestamp DESC) x), '[]'::jsonb) AS audit_events,
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.agent_executions WHERE restaurant_id = $1 ORDER BY id) x), '[]'::jsonb) AS agents`,
      [restaurantId],
    );
    const data = result.rows[0];
    const list = <T>(value: unknown) => asJson<T[]>(value, []);
    const outletRows = list<Record<string, unknown>>(data.outlets);
    const outlets = outletRows.map((row) => {
      numericFields(row, ['research_radius_km', 'delivery_commission_pct', 'packaging_cost_default', 'latitude', 'longitude']);
      return {
        id: String(row.id), name: String(row.name), city: String(row.city), locality: String(row.locality),
        postalCode: String(row.postal_code), researchRadiusKm: finiteNumber(row.research_radius_km),
        deliveryCommissionPct: finiteNumber(row.delivery_commission_pct), packagingCostDefault: finiteNumber(row.packaging_cost_default),
        isActive: row.is_active === true, latitude: finiteNumber(row.latitude), longitude: finiteNumber(row.longitude),
      } satisfies RestaurantOutlet;
    });
    const categories = list<string>(data.protected_categories);
    const protectedItems = list<string>(data.protected_items);
    const menuItems = list<Record<string, unknown>>(data.menu_items).map((row) => {
      numericFields(row, [
        'current_price', 'dine_in_price', 'delivery_price', 'ingredient_cost', 'packaging_cost',
        'total_variable_cost', 'min_contribution', 'min_policy_price', 'max_policy_price', 'inventory_qty',
        'reorder_threshold', 'portion_grams', 'historical_sales_last_30_days',
      ]);
      return {
        id: String(row.id), name: String(row.name), description: String(row.description ?? ''), category: String(row.category),
        sku: String(row.sku), currentPrice: finiteNumber(row.current_price),
        ...(row.dine_in_price === null ? {} : { dineInPrice: finiteNumber(row.dine_in_price) }),
        ...(row.delivery_price === null ? {} : { deliveryPrice: finiteNumber(row.delivery_price) }),
        ingredientCost: finiteNumber(row.ingredient_cost), packagingCost: finiteNumber(row.packaging_cost),
        totalVariableCost: finiteNumber(row.total_variable_cost), minContribution: finiteNumber(row.min_contribution),
        minPolicyPrice: finiteNumber(row.min_policy_price), maxPolicyPrice: finiteNumber(row.max_policy_price),
        inventoryQty: finiteNumber(row.inventory_qty), reorderThreshold: finiteNumber(row.reorder_threshold),
        status: String(row.status), demandTrend: String(row.demand_trend), portionGrams: finiteNumber(row.portion_grams),
        lastUpdated: String(row.last_updated), historicalSalesLast30Days: finiteNumber(row.historical_sales_last_30_days),
        isSyntheticDemoData: row.is_synthetic_demo_data === true,
      } as MenuItem;
    });
    const menuById = new Map(menuItems.map((item) => [item.id, item]));
    for (const row of list<Record<string, unknown>>(data.daily_sales)) {
      const item = menuById.get(String(row.menu_item_id));
      if (!item) continue;
      const point = {
        date: String(row.sales_date).slice(0, 10), dayOfWeek: String(row.day_of_week),
        orders: finiteNumber(row.orders), revenue: finiteNumber(row.revenue),
      };
      if (row.series_name === 'dailySalesHistory') (item.dailySalesHistory ??= []).push(point);
      else (item.dailySalesLast60Days ??= []).push(point);
    }
    const competitors = list<Record<string, unknown>>(data.competitors).map((row) => ({
      id: String(row.id), name: String(row.name), distanceKm: finiteNumber(row.distance_km),
      rating: finiteNumber(row.rating), cuisineType: String(row.cuisine_type), priceTier: String(row.price_tier),
      address: String(row.address), activeMatchesCount: finiteNumber(row.active_matches_count),
      lastScannedAt: String(row.last_scanned_at), ...(row.source_type ? { sourceType: String(row.source_type) } : {}),
      ...(row.latitude === null ? {} : { latitude: finiteNumber(row.latitude) }),
      ...(row.longitude === null ? {} : { longitude: finiteNumber(row.longitude) }),
    } as Competitor));
    const observations = list<Record<string, unknown>>(data.observations).map((row) => ({
      id: String(row.id), competitorId: String(row.competitor_id), competitorName: String(row.competitor_name),
      menuItemId: String(row.menu_item_id), menuItemName: String(row.menu_item_name), dishName: String(row.dish_name),
      observedPrice: finiteNumber(row.observed_price), isAvailable: row.is_available === true,
      portionGrams: finiteNumber(row.portion_grams), confidenceScore: finiteNumber(row.confidence_score),
      freshnessTimestamp: String(row.freshness_timestamp), isSimulated: row.is_simulated === true,
      source: String(row.source), ...(row.provenance_label ? { provenanceLabel: String(row.provenance_label) } : {}),
    } as CompetitorObservation));
    const menuMatches = list<Record<string, unknown>>(data.menu_matches).map((row) => ({
      id: String(row.id), menuItemId: String(row.menu_item_id), menuItemName: String(row.menu_item_name),
      competitorDishName: String(row.competitor_dish_name), competitorName: String(row.competitor_name),
      portionInternalGrams: finiteNumber(row.portion_internal_grams), portionCompetitorGrams: finiteNumber(row.portion_competitor_grams),
      observedPrice: finiteNumber(row.observed_price), normalizedPrice: finiteNumber(row.normalized_price),
      confidenceScore: finiteNumber(row.confidence_score), matchStatus: String(row.match_status), explanation: String(row.explanation),
    } as MenuMatch));
    const inventoryLinks = list<Record<string, unknown>>(data.inventory_links);
    const inventory = list<Record<string, unknown>>(data.inventory).map((row) => ({
      id: String(row.id), name: String(row.name), category: String(row.category), stockQty: finiteNumber(row.stock_qty),
      unit: String(row.unit), reorderPoint: finiteNumber(row.reorder_point), costPerUnit: finiteNumber(row.cost_per_unit),
      priceChangeLast30DaysPct: finiteNumber(row.price_change_last_30_days_pct),
      linkedMenuItemIds: inventoryLinks.filter((link) => link.inventory_item_id === row.id).map((link) => String(link.menu_item_id)),
      status: String(row.status), lastRestocked: String(row.last_restocked),
    } as InventoryItem));
    const recommendations = list<Record<string, unknown>>(data.recommendations).map((row) => {
      numericFields(row, [
        'current_price', 'suggested_price', 'price_delta', 'price_delta_pct', 'variable_cost',
        'current_contribution', 'suggested_contribution', 'current_contribution_margin_pct',
        'suggested_contribution_margin_pct', 'gross_contribution_margin_pct_current',
        'gross_contribution_margin_pct_suggested', 'competitor_median', 'demand_index', 'inventory_ratio',
        'confidence_score', 'economic_floor', 'policy_floor', 'policy_ceiling', 'cumulative_increase_pct',
      ]);
      return {
        id: String(row.id), menuItemId: String(row.menu_item_id), menuItemName: String(row.menu_item_name),
        category: String(row.category), currentPrice: finiteNumber(row.current_price),
        suggestedPrice: finiteNumber(row.suggested_price), priceDelta: finiteNumber(row.price_delta),
        priceDeltaPct: finiteNumber(row.price_delta_pct), variableCost: finiteNumber(row.variable_cost),
        currentContribution: finiteNumber(row.current_contribution), suggestedContribution: finiteNumber(row.suggested_contribution),
        currentContributionMarginPct: finiteNumber(row.current_contribution_margin_pct),
        suggestedContributionMarginPct: finiteNumber(row.suggested_contribution_margin_pct),
        ...(row.gross_contribution_margin_pct_current === null ? {} : { grossContributionMarginPctCurrent: finiteNumber(row.gross_contribution_margin_pct_current) }),
        ...(row.gross_contribution_margin_pct_suggested === null ? {} : { grossContributionMarginPctSuggested: finiteNumber(row.gross_contribution_margin_pct_suggested) }),
        competitorMedian: finiteNumber(row.competitor_median), demandIndex: finiteNumber(row.demand_index),
        inventoryRatio: finiteNumber(row.inventory_ratio), confidenceScore: finiteNumber(row.confidence_score),
        status: String(row.status), reason: String(row.reason), economicFloor: finiteNumber(row.economic_floor),
        policyFloor: finiteNumber(row.policy_floor), policyCeiling: finiteNumber(row.policy_ceiling),
        policyChecksPassed: row.policy_checks_passed === true, isBlocked: row.is_blocked === true,
        requiresStepOverride: row.requires_step_override === true, constraintStatus: String(row.constraint_status),
        flagReasons: asJson<string[]>(row.flag_reasons, []),
        ...(row.last_actual_price_change_at ? { lastActualPriceChangeAt: String(row.last_actual_price_change_at) } : {}),
        ...(row.recent_price_changes ? { recentPriceChanges: asJson(row.recent_price_changes, []) } : {}),
        ...(row.cumulative_increase_pct === null ? {} : { cumulativeIncreasePct: finiteNumber(row.cumulative_increase_pct) }),
        ...(row.stability_policy_status ? { stabilityPolicyStatus: String(row.stability_policy_status) } : {}),
        ...(row.customer_trust_risk ? { customerTrustRisk: asJson(row.customer_trust_risk, undefined) } : {}),
        ...(row.candidates ? { candidates: asJson(row.candidates, undefined) } : {}),
        ...(row.assumptions ? { assumptions: asJson(row.assumptions, undefined) } : {}),
        ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
        ...(row.applied_by ? { appliedBy: String(row.applied_by) } : {}),
        ...(row.rejected_by ? { rejectedBy: String(row.rejected_by) } : {}),
        ...(row.rejection_reason ? { rejectionReason: String(row.rejection_reason) } : {}),
        ...(row.idempotency_key ? { idempotencyKey: String(row.idempotency_key) } : {}),
        createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      } as PricingRecommendation;
    });
    const priceChanges = list<Record<string, unknown>>(data.price_changes).map((row) => ({
      id: String(row.id), menuItemId: String(row.menu_item_id), menuItemName: String(row.menu_item_name),
      previousPrice: finiteNumber(row.previous_price), newPrice: finiteNumber(row.new_price),
      changedAt: String(row.changed_at), actor: String(row.actor), source: String(row.source), rationale: String(row.rationale),
    } as PriceChangeRecord));
    const auditEvents = list<Record<string, unknown>>(data.audit_events).map((row) => ({
      id: String(row.id), timestamp: String(row.timestamp), actor: String(row.actor), action: String(row.action),
      ...(row.menu_item_id ? { menuItemId: String(row.menu_item_id) } : {}),
      ...(row.menu_item_name ? { menuItemName: String(row.menu_item_name) } : {}),
      ...(row.previous_price === null ? {} : { previousPrice: finiteNumber(row.previous_price) }),
      ...(row.new_price === null ? {} : { newPrice: finiteNumber(row.new_price) }),
      rationale: String(row.rationale), policyChecksPassed: row.policy_checks_passed === true,
      metadata: asJson<Record<string, unknown>>(row.metadata, {}),
    } as AuditEvent));
    const agents = list<Record<string, unknown>>(data.agents).map((row) => ({
      id: String(row.id), name: String(row.name), key: String(row.agent_key), role: String(row.role),
      status: String(row.status), lastRun: String(row.last_run), durationMs: finiteNumber(row.duration_ms),
      inputSummary: String(row.input_summary), outputSummary: String(row.output_summary),
      itemsProcessed: finiteNumber(row.items_processed),
      ...(row.quality_score === null ? {} : { qualityScore: finiteNumber(row.quality_score) }),
      ...(row.confidence_score === null ? {} : { confidenceScore: finiteNumber(row.confidence_score) }),
      isSimulatedTelemetry: row.is_simulated_telemetry === true, executionMode: String(row.execution_mode),
    } as AgentExecution));

    const emptyDefaults = new RestaurantDatabase('', '', { memoryOnly: true });
    return {
      schemaVersion: '1.5.0',
      lastSavedAt: data.restaurant ? String(data.restaurant.updated_at ?? data.restaurant.created_at) : new Date(0).toISOString(),
      outlets,
      policy: data.policy
        ? toPolicy(data.policy, categories, protectedItems)
        : { ...emptyDefaults.policy },
      menuItems,
      competitors,
      observations,
      menuMatches,
      inventory,
      agents,
      auditEvents,
      recommendations,
      priceChanges,
    };
  }

  public async persist(
    client: PoolClient,
    database: RestaurantDatabase,
    previous: PersistedDatabaseState,
  ) {
    const policyChanged = JSON.stringify(previous.policy) !== JSON.stringify(database.policy);
    await client.query(
      `INSERT INTO public.restaurants (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) ${previous.policy.restaurantName !== database.policy.restaurantName
        ? 'DO UPDATE SET name = EXCLUDED.name, updated_at = now()'
        : 'DO NOTHING'}`,
      [restaurantId, database.policy.restaurantName || 'Restaurant'],
    );
    const activeOutlet = database.outlets.some((outlet) => outlet.id === database.policy.activeOutletId)
      ? database.policy.activeOutletId
      : null;
    const policyConflictAction = policyChanged
      ? `DO UPDATE SET
         active_outlet_id=EXCLUDED.active_outlet_id, currency_symbol=EXCLUDED.currency_symbol,
         currency_code=EXCLUDED.currency_code, max_movement_pct=EXCLUDED.max_movement_pct,
         max_increase_pct=EXCLUDED.max_increase_pct, max_decrease_pct=EXCLUDED.max_decrease_pct,
         minimum_days_between_price_changes=EXCLUDED.minimum_days_between_price_changes,
         cumulative_increase_limit_pct=EXCLUDED.cumulative_increase_limit_pct,
         cumulative_increase_window_days=EXCLUDED.cumulative_increase_window_days,
         trust_risk_review_threshold_pct=EXCLUDED.trust_risk_review_threshold_pct,
         loyalty_price_protection=EXCLUDED.loyalty_price_protection,
         default_min_contribution=EXCLUDED.default_min_contribution, rounding_step=EXCLUDED.rounding_step,
         data_freshness_max_days=EXCLUDED.data_freshness_max_days,
         require_manual_approval_threshold_pct=EXCLUDED.require_manual_approval_threshold_pct,
         pos_integration=EXCLUDED.pos_integration, updated_at=now()`
      : 'DO NOTHING';
    await client.query(
      `INSERT INTO public.pricing_policies (
         restaurant_id, active_outlet_id, currency_symbol, currency_code, max_movement_pct,
         max_increase_pct, max_decrease_pct, minimum_days_between_price_changes,
         cumulative_increase_limit_pct, cumulative_increase_window_days, trust_risk_review_threshold_pct,
         loyalty_price_protection, default_min_contribution, rounding_step, data_freshness_max_days,
         require_manual_approval_threshold_pct, pos_integration
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
       ON CONFLICT (restaurant_id) ${policyConflictAction}`,
      [
        restaurantId, activeOutlet, database.policy.currencySymbol, database.policy.currencyCode,
        database.policy.maxMovementPct, database.policy.maxIncreasePct, database.policy.maxDecreasePct,
        database.policy.minimumDaysBetweenPriceChanges, database.policy.cumulativeIncreaseLimitPct,
        database.policy.cumulativeIncreaseWindowDays, database.policy.trustRiskReviewThresholdPct,
        database.policy.loyaltyPriceProtection, database.policy.defaultMinContribution,
        database.policy.roundingStep, database.policy.dataFreshnessMaxDays,
        database.policy.requireManualApprovalThresholdPct, JSON.stringify(database.policy.posIntegration),
      ],
    );

    const outlets = changedRecords(database.outlets, previous.outlets, (r) => r.id);
    await insertMany(client, 'outlets',
      ['id','restaurant_id','name','city','locality','postal_code','research_radius_km','delivery_commission_pct','packaging_cost_default','is_active','latitude','longitude'],
      outlets.map((r) => [r.id,restaurantId,r.name,r.city,r.locality,r.postalCode,r.researchRadiusKm,r.deliveryCommissionPct,r.packagingCostDefault,r.isActive,r.latitude,r.longitude]),
      ['id']);

    const addedCategories = database.policy.protectedCategories.filter(
      (category) => !previous.policy.protectedCategories.includes(category),
    );
    const removedCategories = previous.policy.protectedCategories.filter(
      (category) => !database.policy.protectedCategories.includes(category),
    );
    if (removedCategories.length) {
      await client.query(
        'DELETE FROM public.protected_price_categories WHERE restaurant_id=$1 AND category=ANY($2::text[])',
        [restaurantId, removedCategories],
      );
    }
    await insertMany(client, 'protected_price_categories', ['restaurant_id','category'],
      addedCategories.map((category) => [restaurantId, category]), ['restaurant_id','category']);

    const menuItems = changedRecords(database.menuItems, previous.menuItems, (r) => r.id);
    await insertMany(client, 'menu_items',
      ['id','restaurant_id','name','description','category','sku','current_price','dine_in_price','delivery_price','ingredient_cost','packaging_cost','total_variable_cost','min_contribution','min_policy_price','max_policy_price','inventory_qty','reorder_threshold','status','demand_trend','portion_grams','last_updated','historical_sales_last_30_days','is_synthetic_demo_data'],
      menuItems.map((r) => [r.id,restaurantId,r.name,r.description,r.category,r.sku,r.currentPrice,r.dineInPrice ?? null,r.deliveryPrice ?? null,r.ingredientCost,r.packagingCost,r.totalVariableCost,r.minContribution,r.minPolicyPrice,r.maxPolicyPrice,r.inventoryQty,r.reorderThreshold,r.status,r.demandTrend,r.portionGrams,r.lastUpdated,r.historicalSalesLast30Days,r.isSyntheticDemoData ?? false]),
      ['id']);
    const addedProtectedItems = database.policy.protectedMenuItemIds.filter(
      (id) => !previous.policy.protectedMenuItemIds.includes(id),
    );
    const removedProtectedItems = previous.policy.protectedMenuItemIds.filter(
      (id) => !database.policy.protectedMenuItemIds.includes(id),
    );
    if (removedProtectedItems.length) {
      await client.query(
        'DELETE FROM public.protected_menu_items WHERE restaurant_id=$1 AND menu_item_id=ANY($2::text[])',
        [restaurantId, removedProtectedItems],
      );
    }
    await insertMany(client, 'protected_menu_items', ['restaurant_id','menu_item_id'],
      addedProtectedItems.map((id) => [restaurantId, id]), ['restaurant_id','menu_item_id']);
    const previousSalesRows: unknown[][] = [];
    for (const item of previous.menuItems) {
      for (const point of item.dailySalesHistory ?? []) previousSalesRows.push([item.id,point.date,point.dayOfWeek,point.orders,point.revenue,'dailySalesHistory']);
      for (const point of item.dailySalesLast60Days ?? []) previousSalesRows.push([item.id,point.date,point.dayOfWeek,point.orders,point.revenue,'dailySalesLast60Days']);
    }
    const currentSalesRows: unknown[][] = [];
    for (const item of database.menuItems) {
      for (const point of item.dailySalesHistory ?? []) currentSalesRows.push([item.id,point.date,point.dayOfWeek,point.orders,point.revenue,'dailySalesHistory']);
      for (const point of item.dailySalesLast60Days ?? []) currentSalesRows.push([item.id,point.date,point.dayOfWeek,point.orders,point.revenue,'dailySalesLast60Days']);
    }
    const salesKey = (row: unknown[]) => JSON.stringify([row[0], row[1], row[5] ?? row[2]]);
    const oldSalesValues = new Map(previousSalesRows.map((row) => [salesKey(row), JSON.stringify(row)]));
    const newSalesKeys = new Set(currentSalesRows.map(salesKey));
    for (const row of previousSalesRows) {
      if (!newSalesKeys.has(salesKey(row))) {
        await client.query(
          'DELETE FROM public.daily_sales WHERE menu_item_id=$1 AND sales_date=$2 AND series_name=$3',
          [row[0], row[1], row[2]],
        );
      }
    }
    await insertMany(client, 'daily_sales', ['menu_item_id','sales_date','day_of_week','orders','revenue','series_name'],
      currentSalesRows.filter((row) => oldSalesValues.get(salesKey(row)) !== JSON.stringify(row)),
      ['menu_item_id','sales_date','series_name']);

    const competitors = changedRecords(database.competitors, previous.competitors, (r) => r.id);
    await insertMany(client, 'competitors',
      ['id','restaurant_id','name','distance_km','rating','cuisine_type','price_tier','address','active_matches_count','last_scanned_at','source_type','latitude','longitude'],
      competitors.map((r) => [r.id,restaurantId,r.name,r.distanceKm,r.rating,r.cuisineType,r.priceTier,r.address,r.activeMatchesCount,r.lastScannedAt,r.sourceType ?? null,r.latitude ?? null,r.longitude ?? null]),
      ['id']);
    const observations = changedRecords(database.observations, previous.observations, (r) => r.id);
    await insertMany(client, 'competitor_observations',
      ['id','restaurant_id','competitor_id','menu_item_id','competitor_name','menu_item_name','dish_name','observed_price','is_available','portion_grams','confidence_score','freshness_timestamp','is_simulated','source','provenance_label'],
      observations.map((r) => [r.id,restaurantId,r.competitorId,r.menuItemId,r.competitorName,r.menuItemName,r.dishName,r.observedPrice,r.isAvailable,r.portionGrams,r.confidenceScore,r.freshnessTimestamp,r.isSimulated,r.source,r.provenanceLabel ?? null]),
      ['id']);
    const menuMatches = changedRecords(database.menuMatches, previous.menuMatches, (r) => r.id);
    await insertMany(client, 'menu_matches',
      ['id','restaurant_id','menu_item_id','menu_item_name','competitor_dish_name','competitor_name','portion_internal_grams','portion_competitor_grams','observed_price','normalized_price','confidence_score','match_status','explanation'],
      menuMatches.map((r) => [r.id,restaurantId,r.menuItemId,r.menuItemName,r.competitorDishName,r.competitorName,r.portionInternalGrams,r.portionCompetitorGrams,r.observedPrice,r.normalizedPrice,r.confidenceScore,r.matchStatus,r.explanation]),
      ['id']);

    const inventory = changedRecords(database.inventory, previous.inventory, (r) => r.id);
    await insertMany(client, 'inventory_items',
      ['id','restaurant_id','name','category','stock_qty','unit','reorder_point','cost_per_unit','price_change_last_30_days_pct','status','last_restocked'],
      inventory.map((r) => [r.id,restaurantId,r.name,r.category,r.stockQty,r.unit,r.reorderPoint,r.costPerUnit,r.priceChangeLast30DaysPct,r.status,r.lastRestocked]),
      ['id']);
    const links = (items: PersistedDatabaseState['inventory']) => items.flatMap((r) =>
      r.linkedMenuItemIds.map((menuItemId) => [r.id, menuItemId] as const));
    const currentLinks = links(database.inventory);
    const previousLinks = links(previous.inventory);
    const linkKey = (link: readonly [string, string]) => JSON.stringify(link);
    const currentLinkKeys = new Set(currentLinks.map(linkKey));
    for (const [inventoryId, menuItemId] of previousLinks) {
      if (!currentLinkKeys.has(linkKey([inventoryId, menuItemId]))) {
        await client.query(
          'DELETE FROM public.inventory_menu_items WHERE inventory_item_id=$1 AND menu_item_id=$2',
          [inventoryId, menuItemId],
        );
      }
    }
    const previousLinkKeys = new Set(previousLinks.map(linkKey));
    await insertMany(client, 'inventory_menu_items', ['inventory_item_id','menu_item_id'],
      currentLinks.filter((link) => !previousLinkKeys.has(linkKey(link))).map((link) => [...link]),
      ['inventory_item_id','menu_item_id']);

    const recommendations = changedRecords(database.recommendations, previous.recommendations, (r) => r.id);
    await insertMany(client, 'pricing_recommendations',
      ['id','restaurant_id','menu_item_id','menu_item_name','category','current_price','suggested_price','price_delta','price_delta_pct','variable_cost','current_contribution','suggested_contribution','current_contribution_margin_pct','suggested_contribution_margin_pct','gross_contribution_margin_pct_current','gross_contribution_margin_pct_suggested','competitor_median','demand_index','inventory_ratio','confidence_score','status','reason','economic_floor','policy_floor','policy_ceiling','policy_checks_passed','is_blocked','requires_step_override','constraint_status','flag_reasons','last_actual_price_change_at','recent_price_changes','cumulative_increase_pct','stability_policy_status','customer_trust_risk','candidates','assumptions','approved_by','applied_by','rejected_by','rejection_reason','idempotency_key','created_at','updated_at'],
      recommendations.map((r) => [r.id,restaurantId,r.menuItemId,r.menuItemName,r.category,r.currentPrice,r.suggestedPrice,r.priceDelta,r.priceDeltaPct,r.variableCost,r.currentContribution,r.suggestedContribution,r.currentContributionMarginPct,r.suggestedContributionMarginPct,r.grossContributionMarginPctCurrent ?? null,r.grossContributionMarginPctSuggested ?? null,r.competitorMedian,r.demandIndex,r.inventoryRatio,r.confidenceScore,r.status,r.reason,r.economicFloor,r.policyFloor,r.policyCeiling,r.policyChecksPassed,r.isBlocked,r.requiresStepOverride,r.constraintStatus,JSON.stringify(r.flagReasons ?? []),r.lastActualPriceChangeAt ?? null,JSON.stringify(r.recentPriceChanges ?? null),r.cumulativeIncreasePct ?? null,r.stabilityPolicyStatus ?? null,JSON.stringify(r.customerTrustRisk ?? null),JSON.stringify(r.candidates ?? null),JSON.stringify(r.assumptions ?? null),r.approvedBy ?? null,r.appliedBy ?? null,r.rejectedBy ?? null,r.rejectionReason ?? null,r.idempotencyKey ?? null,r.createdAt,r.updatedAt]),
      ['id']);
    const priceChanges = changedRecords(database.priceChanges, previous.priceChanges, (r) => r.id);
    await insertMany(client, 'price_changes',
      ['id','restaurant_id','menu_item_id','menu_item_name','previous_price','new_price','changed_at','actor','source','rationale'],
      priceChanges.map((r) => [r.id,restaurantId,r.menuItemId,r.menuItemName,r.previousPrice,r.newPrice,r.changedAt,r.actor,r.source,r.rationale]),
      ['id'], true);
    const auditEvents = changedRecords(database.auditEvents, previous.auditEvents, (r) => r.id);
    await insertMany(client, 'audit_events',
      ['id','restaurant_id','timestamp','actor','action','menu_item_id','menu_item_name','previous_price','new_price','rationale','policy_checks_passed','metadata'],
      auditEvents.map((r) => [r.id,restaurantId,r.timestamp,r.actor,r.action,r.menuItemId ?? null,r.menuItemName ?? null,r.previousPrice ?? null,r.newPrice ?? null,r.rationale,r.policyChecksPassed,JSON.stringify(r.metadata ?? {})]),
      ['id'], true);
    const agents = changedRecords(database.agents, previous.agents, (r) => r.id);
    await insertMany(client, 'agent_executions',
      ['id','restaurant_id','name','agent_key','role','status','last_run','duration_ms','input_summary','output_summary','items_processed','quality_score','confidence_score','is_simulated_telemetry','execution_mode'],
      agents.map((r) => [r.id,restaurantId,r.name,r.key,r.role,r.status,r.lastRun,r.durationMs,r.inputSummary,r.outputSummary,r.itemsProcessed,r.qualityScore ?? null,r.confidenceScore ?? null,r.isSimulatedTelemetry,r.executionMode]),
      ['id']);
  }

  public async health() {
    const result = await this.getPool().query(
      `SELECT
         (SELECT count(*)::int FROM public.menu_items) menu_items,
         (SELECT count(*)::int FROM public.competitors) competitors,
         (SELECT count(*)::int FROM public.competitor_observations) observations,
         (SELECT count(*)::int FROM public.pricing_recommendations) recommendations,
         (SELECT count(*)::int FROM public.inventory_items) inventory,
         (SELECT count(*)::int FROM public.audit_events) audit_events`,
    );
    return {
      status: 'healthy' as const,
      driver: 'postgresql',
      counts: result.rows[0],
    };
  }

  public async close() {
    if (!this.pool) return;
    const pool = this.pool;
    this.pool = null;
    await pool.end();
  }
}

export const postgresStore = new PostgresStore();
