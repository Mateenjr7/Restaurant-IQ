/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from './server/db.ts';
import { calculateDynamicPrice } from './server/pricing-engine.ts';
import { generateDemandForecast, getAllDemandForecasts } from './server/forecasting.ts';
import { generateStrategicAdvice } from './server/gemini.ts';
import {
  authenticateToken,
  requireRole,
  rateLimit,
  signToken,
  initializeAuthSecret,
  DEMO_ACCOUNTS,
  ROLE_PERMISSIONS,
  UserRole,
} from './server/auth.ts';

dotenv.config();

// Ensure auth secret is validated at startup (fails closed if production secret is insecure)
initializeAuthSecret();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Security: JSON Payload size limit (protect against memory exhaustion / DOS)
app.use(express.json({ limit: '1mb' }));

// Security: Environment-specific CORS Allowlist configuration
const configuredAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

if (process.env.APP_URL) {
  defaultAllowedOrigins.push(process.env.APP_URL);
}

const ALLOWED_ORIGIN_SET = new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins]);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGIN_SET.has(origin) || origin.endsWith('.run.app') || process.env.NODE_ENV !== 'production')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Hardened Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const developmentWebSocketSources = process.env.NODE_ENV === 'production'
    ? ''
    : ' ws://localhost:24678 ws://127.0.0.1:24678';
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https:${developmentWebSocketSources};`
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Authentication middleware attaches validated user to req.user
app.use(authenticateToken);

// ==========================================
// 1. AUTHENTICATION & SESSION ENDPOINTS
// ==========================================

// Login endpoint with rate limiting: authenticates credentials or demo role
app.post('/api/auth/login', rateLimit(60000, 20), (req: Request, res: Response) => {
  const { username, password, role } = req.body || {};

  // Support demo role-based login in dev/eval mode
  if (role && !username) {
    const demoAccount = DEMO_ACCOUNTS.find((a) => a.role === role);
    if (!demoAccount) {
      return res.status(400).json({ error: `Invalid demo role: '${role}'` });
    }
    const token = signToken({
      id: demoAccount.id,
      role: demoAccount.role,
      name: demoAccount.name,
      email: demoAccount.email,
    });
    return res.json({
      token,
      user: {
        id: demoAccount.id,
        name: demoAccount.name,
        role: demoAccount.role,
        email: demoAccount.email,
        permissions: ROLE_PERMISSIONS[demoAccount.role],
      },
    });
  }

  // Standard username/password login
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const account = DEMO_ACCOUNTS.find((a) => a.username.toLowerCase() === String(username).toLowerCase());
  if (!account) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const inputHash = crypto.createHash('sha256').update(String(password)).digest('hex');
  if (inputHash !== account.passwordHash) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = signToken({
    id: account.id,
    role: account.role,
    name: account.name,
    email: account.email,
  });

  res.json({
    token,
    user: {
      id: account.id,
      name: account.name,
      role: account.role,
      email: account.email,
      permissions: ROLE_PERMISSIONS[account.role],
    },
  });
});

// Current session verification endpoint
app.get('/api/auth/session', (req: Request, res: Response) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null });
  }
  res.json({
    authenticated: true,
    user: req.user,
  });
});

// Public demo operator profiles for the interactive evaluation role-switcher
app.get('/api/auth/demo-accounts', (req: Request, res: Response) => {
  res.json(
    DEMO_ACCOUNTS.map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      name: a.name,
      email: a.email,
      permissions: ROLE_PERMISSIONS[a.role],
    }))
  );
});

// ==========================================
// 2. HEALTH & READINESS ENDPOINTS
// ==========================================

// Liveness check (simple service ping)
app.get('/api/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    service: 'RestaurantIQ Dynamic Pricing & Intelligence Engine',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Readiness check (checks persistence disk availability)
app.get('/api/ready', (req: Request, res: Response) => {
  const storageHealth = db.getStorageHealth();
  const isReady = storageHealth.status === 'healthy';
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    persistedToDisk: storageHealth.persistedToDisk,
    schemaVersion: storageHealth.schemaVersion,
    timestamp: new Date().toISOString(),
  });
});

// Diagnostic Health check
app.get('/api/health', (req: Request, res: Response) => {
  const storageHealth = db.getStorageHealth();
  const apiKeyConfigured = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
      process.env.GEMINI_API_KEY.trim() !== ''
  );

  res.json({
    status: storageHealth.status === 'healthy' ? 'healthy' : 'degraded',
    service: 'RestaurantIQ Dynamic Pricing & Intelligence Engine',
    version: db.schemaVersion,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      status: storageHealth.status,
      persistedToDisk: storageHealth.persistedToDisk,
      filePath: storageHealth.filePath,
      fileSizeBytes: storageHealth.fileSizeBytes,
      schemaVersion: storageHealth.schemaVersion,
      lastSavedAt: storageHealth.lastSavedAt,
      counts: storageHealth.counts,
    },
    integrations: {
      geminiAI: {
        configured: apiKeyConfigured,
        model: apiKeyConfigured ? 'gemini-2.5-flash' : 'Deterministic Advisory Fallback Engine',
        status: apiKeyConfigured ? 'live' : 'deterministic_fallback_ready',
      },
      posSync: {
        provider: db.policy.posIntegration.provider,
        mode: db.policy.posIntegration.status,
      },
    },
    pricingEngine: {
      status: 'active',
      type: 'Deterministic Mathematical Optimization',
      safeguard: 'Guaranteed Economic Floors Enforced',
    },
  });
});

// ==========================================
// 3. POLICY & GOVERNANCE ENDPOINTS
// ==========================================

app.get('/api/policy', (req: Request, res: Response) => {
  res.json(db.policy);
});

app.put('/api/policy', requireRole(['admin', 'revenue_manager']), rateLimit(60000, 30), (req: Request, res: Response) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Request body must be a valid JSON object' });
  }
  if (updates.maxMovementPct !== undefined &&
      (!Number.isFinite(Number(updates.maxMovementPct)) || Number(updates.maxMovementPct) < 0.01 || Number(updates.maxMovementPct) > 0.5)) {
    return res.status(400).json({ error: 'maxMovementPct must be a number between 0.01 (1%) and 0.50 (50%)' });
  }
  if (updates.defaultMinContribution !== undefined &&
      (!Number.isFinite(Number(updates.defaultMinContribution)) || Number(updates.defaultMinContribution) < 0)) {
    return res.status(400).json({ error: 'defaultMinContribution must be a non-negative number' });
  }
  if (updates.roundingStep !== undefined &&
      (!Number.isFinite(Number(updates.roundingStep)) || Number(updates.roundingStep) <= 0)) {
    return res.status(400).json({ error: 'roundingStep must be strictly greater than 0' });
  }

  const percentageSettings = [
    ['maxIncreasePct', 0.01, 0.5],
    ['maxDecreasePct', 0.01, 0.5],
    ['cumulativeIncreaseLimitPct', 0.01, 2],
    ['trustRiskReviewThresholdPct', 0.01, 0.5],
  ] as const;
  for (const [key, min, max] of percentageSettings) {
    if (updates[key] !== undefined) {
      const val = Number(updates[key]);
      if (!Number.isFinite(val) || val < min || val > max) {
        return res.status(400).json({ error: `${key} must be between ${min} and ${max} (fractional percentage)` });
      }
    }
  }
  const integerSettings = [
    ['minimumDaysBetweenPriceChanges', 0, 365],
    ['cumulativeIncreaseWindowDays', 1, 365],
  ] as const;
  for (const [key, min, max] of integerSettings) {
    if (updates[key] !== undefined) {
      const val = Number(updates[key]);
      if (!Number.isInteger(val) || val < min || val > max) {
        return res.status(400).json({ error: `${key} must be a whole number between ${min} and ${max}` });
      }
    }
  }
  if (updates.protectedMenuItemIds !== undefined &&
      (!Array.isArray(updates.protectedMenuItemIds) ||
       !updates.protectedMenuItemIds.every((id: unknown): id is string =>
         typeof id === 'string' && db.menuItems.some((item) => item.id === id)))) {
    return res.status(400).json({ error: 'protectedMenuItemIds must contain only existing menu item IDs' });
  }
  const validCategories = [...new Set(db.menuItems.map((item) => item.category))];
  if (updates.protectedCategories !== undefined &&
      (!Array.isArray(updates.protectedCategories) ||
       !updates.protectedCategories.every((category: unknown): category is string =>
         typeof category === 'string' && validCategories.some((validCategory) => validCategory === category)))) {
    return res.status(400).json({ error: 'protectedCategories must contain only existing menu categories' });
  }
  if (updates.loyaltyPriceProtection !== undefined && typeof updates.loyaltyPriceProtection !== 'boolean') {
    return res.status(400).json({ error: 'loyaltyPriceProtection must be a boolean' });
  }

  // Rigorous validation of policy updates
  if (updates.maxMovementPct !== undefined) {
    const val = Number(updates.maxMovementPct);
    if (isNaN(val) || !isFinite(val) || val < 0.01 || val > 0.50) {
      return res.status(400).json({ error: 'maxMovementPct must be a number between 0.01 (1%) and 0.50 (50%)' });
    }
    db.policy.maxMovementPct = val;
    db.policy.maxIncreasePct = val;
    db.policy.maxDecreasePct = val;
  }
  percentageSettings.forEach(([key]) => {
    if (updates[key] !== undefined) db.policy[key] = Number(updates[key]);
  });
  integerSettings.forEach(([key]) => {
    if (updates[key] !== undefined) db.policy[key] = Number(updates[key]);
  });
  if (updates.protectedMenuItemIds !== undefined) {
    db.policy.protectedMenuItemIds = [...new Set<string>(updates.protectedMenuItemIds as string[])];
  }
  if (updates.protectedCategories !== undefined) {
    db.policy.protectedCategories = [...new Set<string>(updates.protectedCategories as string[])];
  }
  if (updates.loyaltyPriceProtection !== undefined) db.policy.loyaltyPriceProtection = updates.loyaltyPriceProtection;
  if (updates.maxIncreasePct !== undefined && updates.maxMovementPct === undefined) db.policy.maxMovementPct = db.policy.maxIncreasePct;

  if (updates.defaultMinContribution !== undefined) {
    const val = Number(updates.defaultMinContribution);
    if (isNaN(val) || !isFinite(val) || val < 0) {
      return res.status(400).json({ error: 'defaultMinContribution must be a non-negative number' });
    }
    db.policy.defaultMinContribution = val;
  }

  if (updates.roundingStep !== undefined) {
    const val = Number(updates.roundingStep);
    if (isNaN(val) || !isFinite(val) || val <= 0) {
      return res.status(400).json({ error: 'roundingStep must be strictly greater than 0' });
    }
    db.policy.roundingStep = val;
  }

  if (updates.currencySymbol !== undefined) {
    db.policy.currencySymbol = String(updates.currencySymbol).slice(0, 5);
  }

  if (updates.restaurantName !== undefined) {
    db.policy.restaurantName = String(updates.restaurantName).trim().slice(0, 100);
  }

  const actor = req.user?.name || 'Administrator';

  db.auditEvents.unshift({
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor,
    action: 'POLICY_UPDATED',
    rationale: `Updated pricing policy: max movement ${Math.round(db.policy.maxMovementPct * 100)}%, min contribution ${db.policy.currencySymbol}${db.policy.defaultMinContribution}, rounding ₹${db.policy.roundingStep}`,
    policyChecksPassed: true,
    metadata: { updatedFields: Object.keys(updates) },
  });

  db.generateInitialRecommendations();
  db.saveToDisk();

  res.json({ success: true, policy: db.policy });
});

// Outlets Endpoints
app.get('/api/outlets', (req: Request, res: Response) => {
  res.json(db.outlets);
});

app.post('/api/outlets/switch', requireRole(['admin']), (req: Request, res: Response) => {
  const { outletId } = req.body;
  if (!outletId) return res.status(400).json({ error: 'outletId is required' });
  try {
    const active = db.setActiveOutlet(outletId);
    res.json({ success: true, activeOutlet: active });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Menu Item Matching Endpoints
app.get('/api/matches', (req: Request, res: Response) => {
  res.json(db.menuMatches);
});

app.put('/api/matches/:id', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status || !['high_confidence', 'needs_review', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Valid status required (high_confidence, needs_review, rejected)' });
  }
  try {
    const updated = db.updateMenuMatchStatus(id, status, req.user?.name);
    res.json({ success: true, match: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// CSV/Excel Competitor Menu Ingestion Endpoint
app.post('/api/competitors/import-menu', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  const { competitorId, rows } = req.body;
  if (!competitorId || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'competitorId and non-empty rows array are required' });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: 'Payload exceeds maximum limit of 500 rows per import' });
  }
  try {
    const result = db.importCompetitorMenu(competitorId, rows, req.user?.name);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 4. DASHBOARD & ANALYTICS
// ==========================================

app.get('/api/dashboard/metrics', (req: Request, res: Response) => {
  res.json(db.getDashboardMetrics());
});

// ==========================================
// 5. MENU INTELLIGENCE CRUD
// ==========================================

app.get('/api/menu', (req: Request, res: Response) => {
  const category = req.query.category as string;
  const search = (req.query.search as string || '').toLowerCase();

  let items = db.menuItems;
  if (category && category !== 'All') {
    items = items.filter((i) => i.category === category);
  }
  if (search) {
    items = items.filter(
      (i) => i.name.toLowerCase().includes(search) || i.sku.toLowerCase().includes(search)
    );
  }

  res.json(items);
});

app.post('/api/menu', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  const {
    name,
    category,
    currentPrice,
    ingredientCost,
    packagingCost = 15,
    minContribution = 50,
    portionGrams = 400,
    description = '',
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Valid menu item name is required' });
  }

  const pCurrent = Number(currentPrice);
  const cIngredient = Number(ingredientCost);
  const cPackaging = Number(packagingCost);
  const mMin = Number(minContribution);

  if (isNaN(pCurrent) || !isFinite(pCurrent) || pCurrent <= 0) {
    return res.status(400).json({ error: 'currentPrice must be a valid positive number' });
  }
  if (isNaN(cIngredient) || !isFinite(cIngredient) || cIngredient <= 0) {
    return res.status(400).json({ error: 'ingredientCost must be a valid positive number' });
  }
  if (isNaN(cPackaging) || !isFinite(cPackaging) || cPackaging < 0) {
    return res.status(400).json({ error: 'packagingCost must be a non-negative number' });
  }
  if (isNaN(mMin) || !isFinite(mMin) || mMin < 0) {
    return res.status(400).json({ error: 'minContribution must be a non-negative number' });
  }

  const totalVariableCost = cIngredient + cPackaging;
  const activeOutlet = db.outlets.find((o) => o.id === db.policy.activeOutletId) || db.outlets[0];
  const feeRate = ((activeOutlet?.deliveryCommissionPct || 0) + 2) / 100;
  const economicFloor = Math.ceil((totalVariableCost + mMin) / (1 - feeRate));

  if (pCurrent < economicFloor) {
    return res.status(400).json({
      error: `Initial price (₹${pCurrent}) violates economic floor of ₹${economicFloor} (cost: ₹${totalVariableCost} + min contribution: ₹${mMin} with ${Math.round(feeRate * 100)}% fees)`,
    });
  }

  const newItem = {
    id: `item-${Date.now()}`,
    name: name.trim().slice(0, 100),
    description: String(description || '').trim().slice(0, 300),
    category: category || 'Curries & Gravies',
    sku: `SKU-${Date.now().toString().slice(-4)}`,
    currentPrice: pCurrent,
    ingredientCost: cIngredient,
    packagingCost: cPackaging,
    totalVariableCost,
    minContribution: mMin,
    minPolicyPrice: economicFloor,
    maxPolicyPrice: Math.round(pCurrent * 2),
    inventoryQty: 30,
    reorderThreshold: 15,
    status: 'active' as const,
    demandTrend: 'steady' as const,
    portionGrams: Number(portionGrams) || 400,
    lastUpdated: new Date().toISOString(),
    historicalSalesLast30Days: 120,
  };

  db.menuItems.unshift(newItem);
  db.saveToDisk();

  res.status(201).json(newItem);
});

app.put('/api/menu/:id', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  const { id } = req.params;
  const item = db.menuItems.find((m) => m.id === id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });

  const { name, currentPrice, ingredientCost, packagingCost, minContribution, status, description } = req.body;

  if (name) item.name = String(name).trim().slice(0, 100);
  if (description !== undefined) item.description = String(description).trim().slice(0, 300);

  if (ingredientCost !== undefined) {
    const cost = Number(ingredientCost);
    if (isNaN(cost) || !isFinite(cost) || cost <= 0) return res.status(400).json({ error: 'ingredientCost must be greater than 0' });
    item.ingredientCost = cost;
  }
  if (packagingCost !== undefined) {
    const pkg = Number(packagingCost);
    if (isNaN(pkg) || !isFinite(pkg) || pkg < 0) return res.status(400).json({ error: 'packagingCost cannot be negative' });
    item.packagingCost = pkg;
  }
  item.totalVariableCost = item.ingredientCost + item.packagingCost;

  if (minContribution !== undefined) {
    const mc = Number(minContribution);
    if (isNaN(mc) || !isFinite(mc) || mc < 0) return res.status(400).json({ error: 'minContribution cannot be negative' });
    item.minContribution = mc;
  }
  if (status && ['active', 'inactive'].includes(status)) item.status = status;

  if (currentPrice !== undefined) {
    const p = Number(currentPrice);
    if (isNaN(p) || !isFinite(p) || p <= 0) return res.status(400).json({ error: 'currentPrice must be greater than 0' });

    const activeOutlet = db.outlets.find((o) => o.id === db.policy.activeOutletId) || db.outlets[0];
    const feeRate = ((activeOutlet?.deliveryCommissionPct || 0) + 2) / 100;
    const economicFloor = Math.ceil((item.totalVariableCost + item.minContribution) / (1 - feeRate));

    if (p < economicFloor) {
      return res.status(400).json({
        error: `Price ₹${p} violates economic floor of ₹${economicFloor} (cost: ₹${item.totalVariableCost} + contribution: ₹${item.minContribution} with ${Math.round(feeRate * 100)}% fees)`,
      });
    }
    item.currentPrice = p;
  }

  item.lastUpdated = new Date().toISOString();
  db.saveToDisk();

  res.json(item);
});

// Manual Price Override with Policy Guard (Requires Admin)
app.post('/api/menu/:id/override-price', requireRole(['admin']), rateLimit(60000, 30), (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPrice, reason } = req.body;

  if (newPrice === undefined || isNaN(Number(newPrice)) || !isFinite(Number(newPrice)) || Number(newPrice) <= 0) {
    return res.status(400).json({ error: 'Valid positive newPrice is required' });
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Override reason of at least 5 characters is required for auditing' });
  }

  try {
    const updated = db.overridePrice(id, Number(newPrice), reason.trim(), req.user?.name);
    res.json({ success: true, menuItem: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 6. COMPETITORS & OBSERVATIONS
// ==========================================

app.get('/api/competitors', (req: Request, res: Response) => {
  res.json(db.competitors);
});

app.get('/api/competitors/observations', (req: Request, res: Response) => {
  res.json(db.observations);
});

app.post('/api/competitors/observations', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  const { competitorId, menuItemId, dishName, observedPrice, portionGrams, source } = req.body;
  if (!competitorId || !menuItemId || !observedPrice) {
    return res.status(400).json({ error: 'competitorId, menuItemId, and observedPrice are required' });
  }

  const p = Number(observedPrice);
  if (isNaN(p) || !isFinite(p) || p <= 0) {
    return res.status(400).json({ error: 'observedPrice must be a positive number' });
  }

  const comp = db.competitors.find((c) => c.id === competitorId);
  const menuItem = db.menuItems.find((m) => m.id === menuItemId);

  const newObs = {
    id: `obs-${Date.now()}`,
    competitorId,
    competitorName: comp?.name || 'Competitor',
    menuItemId,
    menuItemName: menuItem?.name || 'Item',
    dishName: String(dishName || menuItem?.name || 'Comparable Dish').trim().slice(0, 100),
    observedPrice: p,
    isAvailable: true,
    portionGrams: Number(portionGrams) || 400,
    confidenceScore: 0.95,
    freshnessTimestamp: new Date().toISOString(),
    isSimulated: false,
    source: source || 'manual_audit',
    provenanceLabel: 'Physical Menu Audit (Operator Entry)',
  };

  db.observations.unshift(newObs);
  db.generateInitialRecommendations();
  db.saveToDisk();

  res.status(201).json(newObs);
});

// ==========================================
// 7. PRICING RECOMMENDATIONS & APPROVALS
// ==========================================

app.get('/api/recommendations', (req: Request, res: Response) => {
  res.json(db.recommendations);
});

app.get('/api/customer-trust', (req: Request, res: Response) => {
  res.json(db.getCustomerTrustDashboard());
});

app.post('/api/recommendations/:id/approve', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  const { allowStepOverride = false } = req.body || {};
  try {
    const rec = db.approveRecommendation(req.params.id, req.user?.name, Boolean(allowStepOverride));
    res.json({ success: true, recommendation: rec });
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

app.post('/api/recommendations/:id/apply', requireRole(['admin', 'revenue_manager']), rateLimit(60000, 30), (req: Request, res: Response) => {
  try {
    const result = db.applyRecommendation(req.params.id, req.user?.name);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

app.post('/api/recommendations/:id/reject', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  const { reason = 'Margin profile acceptable; keeping existing price.' } = req.body || {};
  try {
    const rec = db.rejectRecommendation(req.params.id, reason, req.user?.name);
    res.json({ success: true, recommendation: rec });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/recommendations/regenerate', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  db.generateInitialRecommendations();
  db.saveToDisk();
  res.json({ success: true, recommendations: db.recommendations });
});

// ==========================================
// 8. PRICING SIMULATOR (Single Financial Model)
// ==========================================

app.post('/api/pricing/simulate', (req: Request, res: Response) => {
  const {
    currentPrice,
    proposedPrice,
    variableCost,
    minContribution = 50,
    competitorMedian = 300,
    demandMultiplier = 1.0,
    expectedBaseOrders = 100,
    deliveryCommissionPct = 0.0,
    paymentProcessingFeePct = 0.0,
    discountPct = 0.0,
    elasticity = -1.25,
  } = req.body;

  const pCurr = Number(currentPrice);
  const pProp = Number(proposedPrice);
  const vCost = Number(variableCost);
  const mMin = Number(minContribution);

  if (isNaN(pCurr) || !isFinite(pCurr) || pCurr <= 0 || isNaN(pProp) || !isFinite(pProp) || pProp <= 0 || isNaN(vCost) || !isFinite(vCost) || vCost <= 0) {
    return res.status(400).json({ error: 'currentPrice, proposedPrice, and variableCost must be positive finite numbers' });
  }

  const safeDisc = Math.max(0, Math.min(0.9, Number(discountPct || 0)));
  const totalFees = Math.max(0, Math.min(0.95, Number(deliveryCommissionPct || 0) + Number(paymentProcessingFeePct || 0)));
  const netMultiplier = (1 - safeDisc) * (1 - totalFees);

  const netCurrent = pCurr * netMultiplier;
  const netProposed = pProp * netMultiplier;

  const currentContribution = netCurrent - vCost;
  const currentMargin = netCurrent > 0 ? (currentContribution / netCurrent) * 100 : 0;

  const proposedContribution = netProposed - vCost;
  const proposedMargin = netProposed > 0 ? (proposedContribution / netProposed) * 100 : 0;

  // Elasticity-based volume calculation: Q_new = Q_base * (1 + deltaPct * elasticity * demandIndex)
  const priceChangePct = (pProp - pCurr) / pCurr;
  const effElasticity = Number(elasticity) <= 0 ? Number(elasticity) : -1.25;
  const volumeDeltaPct = priceChangePct * effElasticity * Number(demandMultiplier || 1.0);
  const estimatedOrders = Math.max(5, Math.round(Number(expectedBaseOrders) * (1 + volumeDeltaPct)));

  const currentTotalContribution = currentContribution * Number(expectedBaseOrders);
  const projectedTotalContribution = proposedContribution * estimatedOrders;
  const netLift = projectedTotalContribution - currentTotalContribution;

  const economicFloor = Math.ceil((vCost + mMin) / netMultiplier);
  const violatesFloor = pProp < economicFloor;

  res.json({
    currentPrice: pCurr,
    proposedPrice: pProp,
    variableCost: vCost,
    economicFloor,
    violatesFloor,
    currentContribution: Math.round(currentContribution * 10) / 10,
    currentMargin: Math.round(currentMargin * 10) / 10,
    proposedContribution: Math.round(proposedContribution * 10) / 10,
    proposedMargin: Math.round(proposedMargin * 10) / 10,
    estimatedOrders,
    currentTotalContribution: Math.round(currentTotalContribution),
    projectedTotalContribution: Math.round(projectedTotalContribution),
    netLift: Math.round(netLift),
    competitorMedian: Number(competitorMedian),
    priceGapVsCompetitor: pProp - Number(competitorMedian),
  });
});

// ==========================================
// 9. DEMAND FORECASTING
// ==========================================

app.get('/api/forecasting', (req: Request, res: Response) => {
  const itemId = req.query.itemId as string;
  if (itemId) {
    res.json(generateDemandForecast(itemId));
  } else {
    res.json(getAllDemandForecasts());
  }
});

// ==========================================
// 10. INVENTORY MANAGEMENT
// ==========================================

app.get('/api/inventory', (req: Request, res: Response) => {
  res.json(db.inventory);
});

app.put('/api/inventory/:id/adjust', requireRole(['admin', 'kitchen_ops']), (req: Request, res: Response) => {
  const { id } = req.params;
  const { newStockQty, reason = 'Routine physical inventory count audit' } = req.body;

  if (newStockQty === undefined || isNaN(Number(newStockQty)) || !isFinite(Number(newStockQty)) || Number(newStockQty) < 0) {
    return res.status(400).json({ error: 'newStockQty must be a valid non-negative number' });
  }

  try {
    const updated = db.adjustInventoryStock(id, Number(newStockQty), reason, req.user?.name);
    res.json({ success: true, inventoryItem: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 11. AI AGENTS PIPELINE OBSERVABILITY
// ==========================================

app.get('/api/agents', (req: Request, res: Response) => {
  res.json(db.agents);
});

app.post('/api/agents/run-cycle', requireRole(['admin', 'revenue_manager']), (req: Request, res: Response) => {
  db.agents.forEach((agent) => {
    agent.lastRun = 'Just now';
    agent.status = 'active';
  });
  db.generateInitialRecommendations();

  db.auditEvents.unshift({
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: req.user?.name || 'Autonomous Orchestrator',
    action: 'POLICY_UPDATED',
    rationale: 'Executed complete multi-agent market intelligence & dynamic pricing refresh cycle.',
    policyChecksPassed: true,
  });

  db.saveToDisk();
  res.json({ success: true, agents: db.agents, recommendations: db.recommendations });
});

// ==========================================
// 12. AUDIT TRAIL
// ==========================================

app.get('/api/audit', (req: Request, res: Response) => {
  res.json(db.auditEvents);
});

// ==========================================
// 13. STRATEGIC AI COPILOT ADVICE
// ==========================================

app.post('/api/ai/strategic-advice', async (req: Request, res: Response) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const result = await generateStrategicAdvice(prompt.trim());
    res.json({
      advice: result.advice,
      source: result.source,
      modelUsed: result.modelUsed,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Strategic advisory engine error' });
  }
});

// Global Safe Error Handler (Never leaks internal stack traces or internal filesystem paths)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[SERVER ERROR CAUGHT]:', err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    error: 'An internal server error occurred. Please contact system administrator.',
    status: 500,
  });
});

// Mount Vite or static assets
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 RestaurantIQ Core Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
