/**
 * Validates and imports the existing JSON snapshot. Dry-run is the default;
 * --apply is required before this script can connect to PostgreSQL.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { createPostgresTlsConfig } from './postgres-tls.ts';

type JsonRecord = Record<string, unknown>;
type ImportState = Record<string, unknown>;

const restaurantId = 'restaurantiq-primary';
const defaultSource = path.resolve(process.cwd(), 'data', 'restaurantiq-data.json');

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function records(state: ImportState, field: string): JsonRecord[] {
  const value = state[field] ?? [];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`${field} must be an array of objects.`);
  }
  return value;
}

function requiredString(row: JsonRecord, field: string, context: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}.${field} must be a non-empty string.`);
  }
  return value;
}

function requiredNumber(row: JsonRecord, field: string, context: string, minimum = -Infinity): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${context}.${field} must be a finite number${Number.isFinite(minimum) ? ` >= ${minimum}` : ''}.`);
  }
  return value;
}

function requiredBoolean(row: JsonRecord, field: string, context: string): boolean {
  const value = row[field];
  if (typeof value !== 'boolean') throw new Error(`${context}.${field} must be a boolean.`);
  return value;
}

function requiredTimestamp(row: JsonRecord, field: string, context: string) {
  const value = requiredString(row, field, context);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${context}.${field} must be a valid timestamp.`);
  }
}

function requiredArray(row: JsonRecord, field: string, context: string): unknown[] {
  const value = row[field] ?? [];
  if (!Array.isArray(value)) throw new Error(`${context}.${field} must be an array.`);
  return value;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function validateUniqueIds(rows: JsonRecord[], field: string) {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const id = requiredString(row, 'id', `${field}[${index}]`);
    if (seen.has(id)) throw new Error(`${field} contains duplicate ID '${id}'.`);
    seen.add(id);
  });
}

function validateState(state: ImportState) {
  if (!['1.2.0', '1.4.0', '1.5.0'].includes(String(state.schemaVersion))) {
    throw new Error('Unsupported JSON schema version; supported versions are 1.2.0, 1.4.0, and 1.5.0.');
  }
  const fields = [
    'outlets', 'menuItems', 'competitors', 'observations', 'menuMatches',
    'inventory', 'recommendations', 'priceChanges', 'auditEvents', 'agents',
  ];
  const data = Object.fromEntries(fields.map((field) => [field, records(state, field)])) as Record<string, JsonRecord[]>;

  for (const field of ['outlets', 'menuItems', 'competitors', 'observations', 'menuMatches', 'inventory', 'recommendations', 'priceChanges', 'auditEvents', 'agents']) {
    validateUniqueIds(data[field], field);
  }

  const outletIds = new Set(data.outlets.map((row, index) => requiredString(row, 'id', `outlets[${index}]`)));
  const menuItemIds = new Set(data.menuItems.map((row, index) => requiredString(row, 'id', `menuItems[${index}]`)));
  const competitorIds = new Set(data.competitors.map((row, index) => requiredString(row, 'id', `competitors[${index}]`)));
  const inventoryIds = new Set(data.inventory.map((row, index) => requiredString(row, 'id', `inventory[${index}]`)));
  const policy = state.policy;
  if (!isRecord(policy)) throw new Error('policy must be an object.');
  const activeOutletId = requiredString(policy, 'activeOutletId', 'policy');
  if (!outletIds.has(activeOutletId)) throw new Error(`policy.activeOutletId '${activeOutletId}' does not reference an outlet.`);
  requiredString(policy, 'restaurantName', 'policy');
  for (const field of [
    'maxMovementPct', 'maxIncreasePct', 'maxDecreasePct', 'cumulativeIncreaseLimitPct',
    'trustRiskReviewThresholdPct', 'defaultMinContribution', 'roundingStep',
    'dataFreshnessMaxDays', 'requireManualApprovalThresholdPct',
  ]) requiredNumber(policy, field, 'policy', field === 'defaultMinContribution' ? 0 : 0);
  for (const field of ['minimumDaysBetweenPriceChanges', 'cumulativeIncreaseWindowDays']) {
    const value = requiredNumber(policy, field, 'policy', 0);
    if (!Number.isInteger(value)) throw new Error(`policy.${field} must be an integer.`);
  }
  if (!Array.isArray(policy.protectedMenuItemIds) || !Array.isArray(policy.protectedCategories)) {
    throw new Error('policy protected item/category settings must be arrays.');
  }
  for (const field of ['currencySymbol', 'currencyCode']) requiredString(policy, field, 'policy');
  requiredBoolean(policy, 'loyaltyPriceProtection', 'policy');
  if (policy.posIntegration !== undefined &&
      (!isRecord(policy.posIntegration) || typeof policy.posIntegration.provider !== 'string' || typeof policy.posIntegration.status !== 'string')) {
    throw new Error('policy.posIntegration must contain a provider and status.');
  }
  if (isRecord(policy.posIntegration)) requiredTimestamp(policy.posIntegration, 'lastSyncTimestamp', 'policy.posIntegration');

  data.menuItems.forEach((item, index) => {
    const context = `menuItems[${index}]`;
    requiredString(item, 'name', context);
    requiredString(item, 'sku', context);
    requiredNumber(item, 'currentPrice', context, 0.01);
    requiredNumber(item, 'ingredientCost', context, 0);
    requiredNumber(item, 'packagingCost', context, 0);
    requiredNumber(item, 'totalVariableCost', context, 0);
    requiredNumber(item, 'minContribution', context, 0);
    requiredNumber(item, 'minPolicyPrice', context, 0);
    requiredNumber(item, 'maxPolicyPrice', context, 0);
    for (const field of ['category', 'sku', 'status', 'demandTrend']) requiredString(item, field, context);
    if (Number(item.maxPolicyPrice) < Number(item.currentPrice)) {
      throw new Error(`${context}.maxPolicyPrice cannot be lower than currentPrice.`);
    }
    requiredTimestamp(item, 'lastUpdated', context);
    for (const seriesName of ['dailySalesHistory', 'dailySalesLast60Days']) {
      const series = requiredArray(item, seriesName, context);
      series.forEach((point, pointIndex) => {
        const pointContext = `${context}.${seriesName}[${pointIndex}]`;
        if (!isRecord(point)) throw new Error(`${pointContext} must be an object.`);
        const date = requiredString(point, 'date', pointContext);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
          throw new Error(`${pointContext}.date must be a valid YYYY-MM-DD date.`);
        }
        requiredString(point, 'dayOfWeek', pointContext);
        requiredNumber(point, 'orders', pointContext, 0);
        requiredNumber(point, 'revenue', pointContext, 0);
      });
    }
  });
  data.outlets.forEach((row, index) => {
    const context = `outlets[${index}]`;
    for (const field of ['name', 'city', 'locality', 'postalCode']) requiredString(row, field, context);
    for (const field of ['researchRadiusKm', 'deliveryCommissionPct', 'packagingCostDefault']) requiredNumber(row, field, context, 0);
    for (const field of ['latitude', 'longitude']) requiredNumber(row, field, context);
    requiredBoolean(row, 'isActive', context);
  });
  data.competitors.forEach((row, index) => {
    const context = `competitors[${index}]`;
    for (const field of ['name', 'cuisineType', 'priceTier', 'address']) requiredString(row, field, context);
    requiredNumber(row, 'distanceKm', context, 0);
    requiredNumber(row, 'rating', context, 0);
    requiredNumber(row, 'activeMatchesCount', context, 0);
    requiredTimestamp(row, 'lastScannedAt', context);
  });
  data.observations.forEach((row, index) => {
    const context = `observations[${index}]`;
    if (!competitorIds.has(requiredString(row, 'competitorId', `observations[${index}]`))) {
      throw new Error(`observations[${index}].competitorId does not reference a competitor.`);
    }
    if (!menuItemIds.has(requiredString(row, 'menuItemId', `observations[${index}]`))) {
      throw new Error(`observations[${index}].menuItemId does not reference a menu item.`);
    }
    for (const field of ['competitorName', 'menuItemName', 'dishName', 'source']) requiredString(row, field, context);
    requiredNumber(row, 'observedPrice', context, 0.01);
    requiredNumber(row, 'portionGrams', context, 0.01);
    const confidence = requiredNumber(row, 'confidenceScore', context, 0);
    if (confidence > 1) throw new Error(`${context}.confidenceScore cannot exceed 1.`);
    requiredTimestamp(row, 'freshnessTimestamp', context);
    requiredBoolean(row, 'isAvailable', context);
    requiredBoolean(row, 'isSimulated', context);
  });
  data.menuMatches.forEach((row, index) => {
    const context = `menuMatches[${index}]`;
    if (!menuItemIds.has(requiredString(row, 'menuItemId', `menuMatches[${index}]`))) {
      throw new Error(`menuMatches[${index}].menuItemId does not reference a menu item.`);
    }
    for (const field of ['menuItemName', 'competitorDishName', 'competitorName', 'matchStatus', 'explanation']) requiredString(row, field, context);
    for (const field of ['portionInternalGrams', 'portionCompetitorGrams', 'observedPrice', 'normalizedPrice']) requiredNumber(row, field, context, 0.01);
    const confidence = requiredNumber(row, 'confidenceScore', context, 0);
    if (confidence > 1) throw new Error(`${context}.confidenceScore cannot exceed 1.`);
  });
  data.inventory.forEach((row, index) => {
    const context = `inventory[${index}]`;
    for (const field of ['name', 'category', 'unit', 'status']) requiredString(row, field, context);
    for (const field of ['stockQty', 'reorderPoint', 'costPerUnit']) requiredNumber(row, field, context, 0);
    requiredNumber(row, 'priceChangeLast30DaysPct', context);
    requiredTimestamp(row, 'lastRestocked', context);
    const links = row.linkedMenuItemIds ?? [];
    if (!Array.isArray(links) || links.some((id) => typeof id !== 'string' || !menuItemIds.has(id))) {
      throw new Error(`inventory[${index}].linkedMenuItemIds contains an unknown menu item.`);
    }
  });
  data.recommendations.forEach((row, index) => {
    const context = `recommendations[${index}]`;
    if (!menuItemIds.has(requiredString(row, 'menuItemId', `recommendations[${index}]`))) {
      throw new Error(`recommendations[${index}].menuItemId does not reference a menu item.`);
    }
    for (const field of ['menuItemName', 'category', 'status', 'reason', 'constraintStatus']) requiredString(row, field, context);
    for (const field of ['currentPrice', 'suggestedPrice', 'economicFloor', 'policyFloor', 'policyCeiling']) requiredNumber(row, field, context, 0);
    requiredTimestamp(row, 'createdAt', context);
    requiredTimestamp(row, 'updatedAt', context);
    requiredBoolean(row, 'policyChecksPassed', context);
    requiredBoolean(row, 'isBlocked', context);
  });
  data.priceChanges.forEach((row, index) => {
    const context = `priceChanges[${index}]`;
    if (!menuItemIds.has(requiredString(row, 'menuItemId', `priceChanges[${index}]`))) {
      throw new Error(`priceChanges[${index}].menuItemId does not reference a menu item.`);
    }
    const oldPrice = requiredNumber(row, 'previousPrice', context, 0.01);
    const newPrice = requiredNumber(row, 'newPrice', context, 0.01);
    if (oldPrice === newPrice) throw new Error(`${context} must represent an actual price change.`);
    requiredString(row, 'actor', context);
    requiredString(row, 'source', context);
    requiredTimestamp(row, 'changedAt', context);
  });
  data.auditEvents.forEach((row, index) => {
    const context = `auditEvents[${index}]`;
    requiredString(row, 'actor', context);
    requiredString(row, 'action', context);
    requiredString(row, 'rationale', context);
    requiredTimestamp(row, 'timestamp', context);
    requiredBoolean(row, 'policyChecksPassed', context);
  });
  data.agents.forEach((row, index) => {
    const context = `agents[${index}]`;
    for (const field of ['name', 'key', 'role', 'status', 'inputSummary', 'outputSummary', 'executionMode']) requiredString(row, field, context);
    requiredString(row, 'lastRun', context);
    requiredNumber(row, 'durationMs', context, 0);
    requiredNumber(row, 'itemsProcessed', context, 0);
    requiredBoolean(row, 'isSimulatedTelemetry', context);
  });
  return data;
}

function clearMissingAuditMenuItemReferences(data: Record<string, JsonRecord[]>) {
  const menuItemIds = new Set(data.menuItems.map((row) => row.id));
  let clearedReferences = 0;
  for (const event of data.auditEvents) {
    if (typeof event.menuItemId === 'string' && !menuItemIds.has(event.menuItemId)) {
      event.menuItemId = null;
      clearedReferences += 1;
    }
  }
  return clearedReferences;
}

function isSynthetic(state: ImportState, data: Record<string, JsonRecord[]>) {
  const menuItems = data.menuItems.some((row) => row.isSyntheticDemoData === true);
  const observations = data.observations.some((row) => row.isSimulated === true || row.source === 'demo_dataset');
  const competitors = data.competitors.some((row) => row.sourceType === 'demo_data');
  const agents = data.agents.some((row) => row.isSimulatedTelemetry === true);
  const seededAuditTrail = data.auditEvents.some((row) => String(row.id ?? '').startsWith('audit-seed-'));
  return menuItems || observations || competitors || agents || seededAuditTrail || state.schemaVersion === 'seed';
}

const pendingInserts = new Map<string, { columns: string[]; rows: unknown[][] }>();

async function insertWithoutOverwrite(_client: Client, table: string, columns: string[], values: unknown[]) {
  const pending = pendingInserts.get(table);
  if (pending && (pending.columns.length !== columns.length ||
      pending.columns.some((column, index) => column !== columns[index]))) {
    throw new Error(`Inconsistent insert columns for ${table}.`);
  }
  if (values.length !== columns.length) {
    throw new Error(`Invalid insert value count for ${table}.`);
  }
  if (pending) {
    pending.rows.push(values);
  } else {
    pendingInserts.set(table, { columns, rows: [values] });
  }
}

function conflictTarget(table: string) {
  return table === 'protected_price_categories'
    ? '(restaurant_id, category)'
    : table === 'protected_menu_items'
      ? '(restaurant_id, menu_item_id)'
      : table === 'daily_sales'
        ? '(menu_item_id, sales_date, series_name)'
        : table === 'inventory_menu_items'
          ? '(inventory_item_id, menu_item_id)'
          : table === 'pricing_policies'
            ? '(restaurant_id)'
          : '(id)';
}

async function flushPendingInserts(client: Client) {
  const maxRowsPerInsert = 500;
  for (const [table, { columns, rows }] of pendingInserts) {
    for (let start = 0; start < rows.length; start += maxRowsPerInsert) {
      const batch = rows.slice(start, start + maxRowsPerInsert);
      const placeholders = batch.map((_, rowIndex) => (
        `(${columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(', ')})`
      )).join(', ');
      const result = await client.query(
        `INSERT INTO public.${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT ${conflictTarget(table)} DO NOTHING RETURNING 1`,
        batch.flat(),
      );
      if (result.rowCount !== batch.length) {
        throw new Error(`Import conflict in ${table}; an existing row would not be overwritten. No partial import was committed.`);
      }
    }
  }
  pendingInserts.clear();
}

async function main() {
  const sourceFile = defaultSource;
  const apply = process.argv.includes('--apply');
  const includeDemo = process.argv.includes('--include-demo-data');
  if (!fs.existsSync(sourceFile)) throw new Error(`JSON snapshot does not exist: ${sourceFile}`);

  const raw = fs.readFileSync(sourceFile, 'utf8');
  const stateValue: unknown = JSON.parse(raw);
  if (!isRecord(stateValue)) throw new Error('JSON snapshot root must be an object.');
  const state = stateValue as ImportState;
  const data = validateState(state);
  const unlinkedAuditEvents = clearMissingAuditMenuItemReferences(data);
  const hasDemoData = isSynthetic(state, data);
  if (hasDemoData && !includeDemo) {
    throw new Error('Snapshot contains synthetic/demo records. No connection was made. Review them, then pass --include-demo-data only if their import is intentional.');
  }

  const policy = state.policy as JsonRecord;
  const counts = {
    ...Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])),
    protectedMenuItems: Array.isArray(policy.protectedMenuItemIds) ? policy.protectedMenuItemIds.length : 0,
    protectedCategories: Array.isArray(policy.protectedCategories) ? policy.protectedCategories.length : 0,
    dailySales: data.menuItems.reduce((sum, item) => (
      sum + (Array.isArray(item.dailySalesHistory) ? item.dailySalesHistory.length : 0) +
      (Array.isArray(item.dailySalesLast60Days) ? item.dailySalesLast60Days.length : 0)
    ), 0),
    inventoryMenuItemLinks: data.inventory.reduce((sum, item) => (
      sum + (Array.isArray(item.linkedMenuItemIds) ? item.linkedMenuItemIds.length : 0)
    ), 0),
  };
  const sourceHash = crypto.createHash('sha256').update(raw).digest('hex');
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    sourceFile: path.basename(sourceFile),
    sourceSha256: sourceHash,
    includedDemoData: includeDemo,
    records: counts,
    normalizations: { auditEventsUnlinkedFromMissingMenuItems: unlinkedAuditEvents },
    skipped: 0,
    rejected: 0,
    failed: 0,
    note: apply ? 'Database import requested.' : 'No database connection was made. Rerun with --apply after reviewing this summary.',
  }, null, 2));
  if (!apply) return;

  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required for --apply; DATABASE_URL is intentionally not used by the importer.');

  const client = new Client({
    ...createPostgresTlsConfig(databaseUrl),
    connectionTimeoutMillis: 10000,
    application_name: 'restaurantiq-json-import',
  });

  try {
    await client.connect();
    await client.query('BEGIN');
    const batch = await client.query(
      `INSERT INTO public.json_import_batches (source_sha256, source_file_name, included_demo_data, record_counts, imported_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (source_sha256) DO NOTHING
       RETURNING id`,
      [sourceHash, path.basename(sourceFile), includeDemo, json(counts), process.env.USERNAME || process.env.USER || 'local-operator']
    );
    if (batch.rowCount !== 1) {
      await client.query('ROLLBACK');
      console.log('This exact source snapshot was already imported; no rows were modified.');
      return;
    }

    await insertWithoutOverwrite(client, 'restaurants', ['id', 'name'], [restaurantId, requiredString(isRecord(state.policy) ? state.policy : {}, 'restaurantName', 'policy')]);

    for (const row of data.outlets) {
      await insertWithoutOverwrite(client, 'outlets',
        ['id', 'restaurant_id', 'name', 'city', 'locality', 'postal_code', 'research_radius_km', 'delivery_commission_pct', 'packaging_cost_default', 'is_active', 'latitude', 'longitude'],
        [row.id, restaurantId, row.name, row.city, row.locality, row.postalCode, row.researchRadiusKm, row.deliveryCommissionPct, row.packagingCostDefault, row.isActive, row.latitude, row.longitude]);
    }

    await insertWithoutOverwrite(client, 'pricing_policies',
      ['restaurant_id', 'active_outlet_id', 'currency_symbol', 'currency_code', 'max_movement_pct', 'max_increase_pct', 'max_decrease_pct', 'minimum_days_between_price_changes', 'cumulative_increase_limit_pct', 'cumulative_increase_window_days', 'trust_risk_review_threshold_pct', 'loyalty_price_protection', 'default_min_contribution', 'rounding_step', 'data_freshness_max_days', 'require_manual_approval_threshold_pct', 'pos_integration'],
      [restaurantId, policy.activeOutletId, policy.currencySymbol, policy.currencyCode, policy.maxMovementPct, policy.maxIncreasePct, policy.maxDecreasePct, policy.minimumDaysBetweenPriceChanges, policy.cumulativeIncreaseLimitPct, policy.cumulativeIncreaseWindowDays, policy.trustRiskReviewThresholdPct, policy.loyaltyPriceProtection, policy.defaultMinContribution, policy.roundingStep, policy.dataFreshnessMaxDays, policy.requireManualApprovalThresholdPct, json(policy.posIntegration)]);
    for (const category of (policy.protectedCategories as unknown[] ?? [])) {
      if (typeof category !== 'string') throw new Error('policy.protectedCategories must contain strings.');
      await insertWithoutOverwrite(client, 'protected_price_categories', ['restaurant_id', 'category'], [restaurantId, category]);
    }

    for (const row of data.menuItems) {
      await insertWithoutOverwrite(client, 'menu_items',
        ['id', 'restaurant_id', 'name', 'description', 'category', 'sku', 'current_price', 'dine_in_price', 'delivery_price', 'ingredient_cost', 'packaging_cost', 'total_variable_cost', 'min_contribution', 'min_policy_price', 'max_policy_price', 'inventory_qty', 'reorder_threshold', 'status', 'demand_trend', 'portion_grams', 'last_updated', 'historical_sales_last_30_days', 'is_synthetic_demo_data'],
        [row.id, restaurantId, row.name, row.description ?? '', row.category, row.sku, row.currentPrice, row.dineInPrice ?? null, row.deliveryPrice ?? null, row.ingredientCost, row.packagingCost, row.totalVariableCost, row.minContribution, row.minPolicyPrice, row.maxPolicyPrice, row.inventoryQty, row.reorderThreshold, row.status, row.demandTrend, row.portionGrams, row.lastUpdated, row.historicalSalesLast30Days, row.isSyntheticDemoData ?? false]);
      if (Array.isArray(row.dailySalesHistory)) {
        for (const point of row.dailySalesHistory as JsonRecord[]) {
          await insertWithoutOverwrite(client, 'daily_sales', ['menu_item_id', 'sales_date', 'day_of_week', 'orders', 'revenue', 'series_name'], [row.id, point.date, point.dayOfWeek, point.orders, point.revenue, 'dailySalesHistory']);
        }
      }
      if (Array.isArray(row.dailySalesLast60Days)) {
        for (const point of row.dailySalesLast60Days as JsonRecord[]) {
          await insertWithoutOverwrite(client, 'daily_sales', ['menu_item_id', 'sales_date', 'day_of_week', 'orders', 'revenue', 'series_name'], [row.id, point.date, point.dayOfWeek, point.orders, point.revenue, 'dailySalesLast60Days']);
        }
      }
    }
    for (const itemId of (policy.protectedMenuItemIds as unknown[] ?? [])) {
      if (typeof itemId !== 'string') throw new Error('policy.protectedMenuItemIds must contain strings.');
      await insertWithoutOverwrite(client, 'protected_menu_items', ['restaurant_id', 'menu_item_id'], [restaurantId, itemId]);
    }

    for (const row of data.competitors) {
      await insertWithoutOverwrite(client, 'competitors',
        ['id', 'restaurant_id', 'name', 'distance_km', 'rating', 'cuisine_type', 'price_tier', 'address', 'active_matches_count', 'last_scanned_at', 'source_type', 'latitude', 'longitude'],
        [row.id, restaurantId, row.name, row.distanceKm, row.rating, row.cuisineType, row.priceTier, row.address, row.activeMatchesCount, row.lastScannedAt, row.sourceType ?? null, row.latitude ?? null, row.longitude ?? null]);
    }
    for (const row of data.observations) {
      await insertWithoutOverwrite(client, 'competitor_observations',
        ['id', 'restaurant_id', 'competitor_id', 'menu_item_id', 'competitor_name', 'menu_item_name', 'dish_name', 'observed_price', 'is_available', 'portion_grams', 'confidence_score', 'freshness_timestamp', 'is_simulated', 'source', 'provenance_label'],
        [row.id, restaurantId, row.competitorId, row.menuItemId, row.competitorName, row.menuItemName, row.dishName, row.observedPrice, row.isAvailable, row.portionGrams, row.confidenceScore, row.freshnessTimestamp, row.isSimulated, row.source, row.provenanceLabel ?? null]);
    }
    for (const row of data.menuMatches) {
      await insertWithoutOverwrite(client, 'menu_matches',
        ['id', 'restaurant_id', 'menu_item_id', 'menu_item_name', 'competitor_dish_name', 'competitor_name', 'portion_internal_grams', 'portion_competitor_grams', 'observed_price', 'normalized_price', 'confidence_score', 'match_status', 'explanation'],
        [row.id, restaurantId, row.menuItemId, row.menuItemName, row.competitorDishName, row.competitorName, row.portionInternalGrams, row.portionCompetitorGrams, row.observedPrice, row.normalizedPrice, row.confidenceScore, row.matchStatus, row.explanation]);
    }

    for (const row of data.inventory) {
      await insertWithoutOverwrite(client, 'inventory_items',
        ['id', 'restaurant_id', 'name', 'category', 'stock_qty', 'unit', 'reorder_point', 'cost_per_unit', 'price_change_last_30_days_pct', 'status', 'last_restocked'],
        [row.id, restaurantId, row.name, row.category, row.stockQty, row.unit, row.reorderPoint, row.costPerUnit, row.priceChangeLast30DaysPct, row.status, row.lastRestocked]);
      for (const itemId of (row.linkedMenuItemIds as unknown[] ?? [])) {
        await insertWithoutOverwrite(client, 'inventory_menu_items', ['inventory_item_id', 'menu_item_id'], [row.id, itemId]);
      }
    }
    for (const row of data.recommendations) {
      await insertWithoutOverwrite(client, 'pricing_recommendations',
        ['id', 'restaurant_id', 'menu_item_id', 'menu_item_name', 'category', 'current_price', 'suggested_price', 'price_delta', 'price_delta_pct', 'variable_cost', 'current_contribution', 'suggested_contribution', 'current_contribution_margin_pct', 'suggested_contribution_margin_pct', 'gross_contribution_margin_pct_current', 'gross_contribution_margin_pct_suggested', 'competitor_median', 'demand_index', 'inventory_ratio', 'confidence_score', 'status', 'reason', 'economic_floor', 'policy_floor', 'policy_ceiling', 'policy_checks_passed', 'is_blocked', 'requires_step_override', 'constraint_status', 'flag_reasons', 'last_actual_price_change_at', 'recent_price_changes', 'cumulative_increase_pct', 'stability_policy_status', 'customer_trust_risk', 'candidates', 'assumptions', 'approved_by', 'applied_by', 'rejected_by', 'rejection_reason', 'idempotency_key', 'created_at', 'updated_at'],
        [row.id, restaurantId, row.menuItemId, row.menuItemName, row.category, row.currentPrice, row.suggestedPrice, row.priceDelta, row.priceDeltaPct, row.variableCost, row.currentContribution, row.suggestedContribution, row.currentContributionMarginPct, row.suggestedContributionMarginPct, row.grossContributionMarginPctCurrent ?? null, row.grossContributionMarginPctSuggested ?? null, row.competitorMedian, row.demandIndex, row.inventoryRatio, row.confidenceScore, row.status, row.reason, row.economicFloor, row.policyFloor, row.policyCeiling, row.policyChecksPassed, row.isBlocked, row.requiresStepOverride, row.constraintStatus, json(row.flagReasons), row.lastActualPriceChangeAt ?? null, json(row.recentPriceChanges), row.cumulativeIncreasePct ?? null, row.stabilityPolicyStatus ?? null, json(row.customerTrustRisk), json(row.candidates), json(row.assumptions), row.approvedBy ?? null, row.appliedBy ?? null, row.rejectedBy ?? null, row.rejectionReason ?? null, row.idempotencyKey ?? null, row.createdAt, row.updatedAt]);
    }
    for (const row of data.priceChanges) {
      await insertWithoutOverwrite(client, 'price_changes',
        ['id', 'restaurant_id', 'menu_item_id', 'menu_item_name', 'previous_price', 'new_price', 'changed_at', 'actor', 'source', 'rationale'],
        [row.id, restaurantId, row.menuItemId, row.menuItemName, row.previousPrice, row.newPrice, row.changedAt, row.actor, row.source, row.rationale]);
    }
    for (const row of data.auditEvents) {
      await insertWithoutOverwrite(client, 'audit_events',
        ['id', 'restaurant_id', 'timestamp', 'actor', 'action', 'menu_item_id', 'menu_item_name', 'previous_price', 'new_price', 'rationale', 'policy_checks_passed', 'metadata'],
        [row.id, restaurantId, row.timestamp, row.actor, row.action, row.menuItemId ?? null, row.menuItemName ?? null, row.previousPrice ?? null, row.newPrice ?? null, row.rationale, row.policyChecksPassed, json(row.metadata)]);
    }
    for (const row of data.agents) {
      await insertWithoutOverwrite(client, 'agent_executions',
        ['id', 'restaurant_id', 'name', 'agent_key', 'role', 'status', 'last_run', 'duration_ms', 'input_summary', 'output_summary', 'items_processed', 'quality_score', 'confidence_score', 'is_simulated_telemetry', 'execution_mode'],
        [row.id, restaurantId, row.name, row.key, row.role, row.status, row.lastRun, row.durationMs, row.inputSummary, row.outputSummary, row.itemsProcessed, row.qualityScore ?? null, row.confidenceScore ?? null, row.isSimulatedTelemetry, row.executionMode]);
    }

    await flushPendingInserts(client);

    const expectedCounts: Record<string, number> = {
      restaurants: 1,
      outlets: data.outlets.length,
      pricing_policies: 1,
      protected_price_categories: Array.isArray(policy.protectedCategories) ? policy.protectedCategories.length : 0,
      menu_items: data.menuItems.length,
      protected_menu_items: Array.isArray(policy.protectedMenuItemIds) ? policy.protectedMenuItemIds.length : 0,
      daily_sales: data.menuItems.reduce((sum, item) => (
        sum + (Array.isArray(item.dailySalesHistory) ? item.dailySalesHistory.length : 0) +
        (Array.isArray(item.dailySalesLast60Days) ? item.dailySalesLast60Days.length : 0)
      ), 0),
      competitors: data.competitors.length,
      competitor_observations: data.observations.length,
      menu_matches: data.menuMatches.length,
      inventory_items: data.inventory.length,
      inventory_menu_items: data.inventory.reduce((sum, item) => sum + (Array.isArray(item.linkedMenuItemIds) ? item.linkedMenuItemIds.length : 0), 0),
      pricing_recommendations: data.recommendations.length,
      price_changes: data.priceChanges.length,
      audit_events: data.auditEvents.length,
      agent_executions: data.agents.length,
    };
    for (const [table, expected] of Object.entries(expectedCounts)) {
      const result = table === 'restaurants'
        ? await client.query<{ count: string }>('SELECT count(*)::text AS count FROM public.restaurants WHERE id = $1', [restaurantId])
        : table === 'pricing_policies'
          ? await client.query<{ count: string }>('SELECT count(*)::text AS count FROM public.pricing_policies WHERE restaurant_id = $1', [restaurantId])
          : table === 'protected_price_categories'
            ? await client.query<{ count: string }>('SELECT count(*)::text AS count FROM public.protected_price_categories WHERE restaurant_id = $1', [restaurantId])
            : table === 'protected_menu_items'
              ? await client.query<{ count: string }>('SELECT count(*)::text AS count FROM public.protected_menu_items WHERE restaurant_id = $1', [restaurantId])
              : table === 'daily_sales'
                ? await client.query<{ count: string }>('SELECT count(*)::text AS count FROM public.daily_sales d JOIN public.menu_items m ON m.id = d.menu_item_id WHERE m.restaurant_id = $1', [restaurantId])
                : table === 'inventory_menu_items'
                  ? await client.query<{ count: string }>('SELECT count(*)::text AS count FROM public.inventory_menu_items l JOIN public.inventory_items i ON i.id = l.inventory_item_id WHERE i.restaurant_id = $1', [restaurantId])
                  : await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM public.${table} WHERE restaurant_id = $1`, [restaurantId]);
      if (Number(result.rows[0].count) !== expected) {
        throw new Error(`Post-import verification failed for ${table}; the transaction will be rolled back.`);
      }
    }

    await client.query('COMMIT');
    console.log('Import committed successfully. All database writes were in one transaction.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('JSON import failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
