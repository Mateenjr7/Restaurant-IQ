# RestaurantIQ — AI Restaurant Intelligence & Dynamic Pricing Engine

> **Enterprise-grade restaurant intelligence platform** delivering bounded dynamic pricing, portion-normalized competitor benchmarking, contribution margin optimization, genuine time-series demand forecasting, and authenticated multi-role governance.

---

## 1. Executive Overview

RestaurantIQ is a specialized decision-intelligence SaaS designed for restaurant operators, revenue management teams, and multi-outlet hospitality groups. The system protects operational profitability by replacing intuition-based pricing with **contribution-based optimization** governed by hard mathematical economic floors.

### Core Capabilities
* **Experience A (Immersive Product Entry):** Real-time Three.js WebGL gyroscope orb with cursor tracking, metallic rings, and editorial typography.
* **Experience B (Operational Command Center):** Full SaaS operations console with real-time revenue KPIs, dynamically computed 30-day historical deltas, pending recommendations queue, and category breakdown.
* **Deterministic Dynamic Pricing Engine:** Computes optimal price points based on competitor medians, demand elasticity ($\varepsilon$), platform commission deductions, and inventory turnover.
* **Guaranteed Economic Floors:** Hard boundary checks enforce $P \ge \lceil(C_{\text{variable}} + M_{\min}) / ((1 - \text{discountPct}) \times (1 - \text{feeRate}))\rceil$, preventing loss-leading or margin erosion across both recommendation and application time.
* **Additive Holt-Winters Demand Forecasting:** Genuine time-series forecasting capturing 7-day cyclical seasonality ($L=7$), level smoothing ($\alpha=0.25$), trend smoothing ($\beta=0.08$), and seasonal smoothing ($\gamma=0.30$) with out-of-sample held-out split error validation (MAE and RMSE).
* **Role-Based Access Control (RBAC):** Server-verified cryptographic HMAC-SHA256 session tokens governing Admin, Revenue Manager, Kitchen Ops, and Auditor permissions.
* **Atomic File Persistence:** Durable JSON storage (`data/restaurantiq-data.json`) with tempfile-to-rename atomic write guarantees, mutation mutex, and schema migration (`v1.4.0`).
* **Location-Aware Competitor Radar:** Scopes competitor observations by geographic radius (1.5km – 5.0km) from the active outlet using haversine geodesic calculation.
* **Portion-Normalized Dish Matching:** Automatically scales competitor pricing to internal portion weights (e.g. 550g handi vs. 400g bowl) and flags mismatched sharing sizes.
* **Tamper-Evident Audit Trail:** Every price approval, manual override, rejection, and POS push is recorded with operator identity, rationale, and policy safeguard status.
* **Server-Side Gemini AI Strategic Copilot:** Powered by `@google/genai` (Gemini 2.5 Flash) with contextual injection of live sales, low stock alerts, competitor benchmarks, and deterministic fallback.

---

## 2. Mathematical Formulation & Pricing Safeguards

### 2.1 Single Financial Calculation Model
1. **Customer Gross Price:** $P_{\text{gross}}$
2. **Customer Discounted Price:** $P_{\text{disc}} = P_{\text{gross}} \times (1 - \text{discountPct})$
3. **Platform Fee Deductions:** Applied to discounted price:
   $$\text{Fee Rate} = \text{deliveryCommissionPct} + \text{paymentProcessingFeePct} \quad (\text{default: } 20\% + 2\% = 22\%)$$
4. **Net Recognized Selling Price:**
   $$P_{\text{net}} = P_{\text{disc}} \times (1 - \text{Fee Rate}) = P_{\text{gross}} \times (1 - \text{discountPct}) \times (1 - \text{Fee Rate})$$
5. **Net Unit Contribution:**
   $$\text{Net Contribution} = P_{\text{net}} - C_{\text{variable}}$$
6. **Net Contribution Margin %:**
   $$\text{Net Margin \%} = \frac{\text{Net Contribution}}{P_{\text{net}}} \times 100$$
7. **Gross Contribution Margin %:**
   $$\text{Gross Margin \%} = \frac{P_{\text{gross}} - C_{\text{variable}}}{P_{\text{gross}}} \times 100$$

### 2.2 Economic Floor Invariant
The selling price must guarantee that net recognized revenue covers variable costs plus minimum target contribution:
$$P_{\text{floor}} = \left\lceil \frac{C_{\text{variable}} + M_{\min}}{(1 - \text{discountPct}) \times (1 - \text{Fee Rate})} \right\rceil$$

$$P_{\text{effective\_floor}} = \max\left(P_{\text{floor}},\; P_{\min,\text{policy}}\right)$$

* If $P_{\text{effective\_floor}} > P_{\max,\text{policy}}$, the recommendation is **BLOCKED** (`isBlocked: true`).
* If $P_{\text{effective\_floor}} > P_{\text{current}} \times (1 + L)$ (step limit), the engine flags `requiresStepOverride: true` and blocks unapproved POS application without explicit administrator authorization.
* **Application-Time Revalidation:** When an operator applies a price to POS or executes a manual override, the backend re-evaluates the economic floor against active commissions and current variable costs.

### 2.3 Step Movement Limiter ($L$)
To protect customer price perception and loyalty, prices cannot move by more than $\pm L$ (configurable, default $15\%$) in a single cycle:
$$P_{\text{current}} \times (1 - L) \le P^* \le P_{\text{current}} \times (1 + L)$$

---

## 3. Demand Forecasting & Backtesting

* **Algorithm:** Additive Holt-Winters Exponential Smoothing with weekly seasonality period $L=7$ days.
* **Validation Methodology:** Evaluated on a 14-day chronological held-out validation segment.
* **Metrics:**
  $$\text{MAE} = \frac{1}{14} \sum_{t=1}^{14} |y_t - \hat{y}_t|$$
  $$\text{RMSE} = \sqrt{\frac{1}{14} \sum_{t=1}^{14} (y_t - \hat{y}_t)^2}$$
* **Data Sufficiency Guard:** When fewer than 14 historical daily observations exist, MAE and RMSE are set strictly to `null`, and the UI indicates `"Validation metrics unavailable"`, falling back to a heuristic baseline.

---

## 4. Security & Authentication Architecture

* **Token Format:** HMAC-SHA256 signed session tokens (`<header>.<payload>.<signature>`) verified with constant-time equality checks.
* **Client Header Independence:** Unauthenticated requests and client-controlled headers like `X-Operator-Role` are ignored for privilege escalation.
* **Role-Based Access Matrix:**
  * `admin`: Complete privileges including policy modification, outlet switching, price override, and approval.
  * `revenue_manager`: Pricing recommendation review, approval, application, and competitor imports.
  * `kitchen_ops`: Physical inventory stock audits and recipe costs.
  * `auditor`: Read-only access to audit trails, performance metrics, and history.
* **Fail-Closed Startup:** In production (`NODE_ENV=production`), the server aborts startup if `AUTH_SECRET` is missing or shorter than 32 characters.
* **Rate Limiting:** Protects sensitive login, pricing application, and policy mutation routes.

---

## 5. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│                   Vite + React 19 SPA                  │
│  Three.js WebGL  •  Tailwind CSS v4  •  Lucide Icons   │
│  Command Palette (⌘K)  •  Operator Role Switcher       │
└───────────────────────────┬────────────────────────────┘
                            │ Bearer Token REST (/api/*)
┌───────────────────────────▼────────────────────────────┐
│                  Express Server (server.ts)            │
│  - /api/auth/* (HMAC-SHA256 Token Auth & RBAC Guard)   │
│  - /api/live, /api/ready, /api/health (Diagnostics)    │
│  - /api/dashboard/metrics (Chronological Deltas)       │
│  - /api/recommendations (Approvals & POS Application)  │
│  - /api/pricing/simulate (Single Financial Model)      │
│  - /api/forecasting (Holt-Winters Out-of-Sample)       │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼──────────────┐ ┌──────────▼──────────────┐
│ Deterministic Engine       │ │ Server-Side Gemini API  │
│ - pricing-engine.ts        │ │ - gemini-2.5-flash      │
│ - forecasting.ts           │ │ - Contextual Prompting  │
│ - db.ts (Atomic JSON Store)│ │ - Deterministic Fallback│
└────────────────────────────┘ └─────────────────────────┘
```

---

## 6. API Endpoints

### Authentication & Diagnostics
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticates credentials or demo role; returns signed JWT |
| `GET` | `/api/auth/session` | Public | Verifies token and returns authenticated operator identity |
| `GET` | `/api/auth/demo-accounts` | Public | Returns available evaluation profiles for UI role switching |
| `GET` | `/api/live` | Public | Service liveness ping |
| `GET` | `/api/ready` | Public | Persistence readiness verification |
| `GET` | `/api/health` | Public | Detailed storage, integration, and pricing health diagnostics |

### Revenue & Pricing Operations
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/metrics` | Public | 30-day revenue, contribution margin, and genuine historical deltas |
| `GET` | `/api/recommendations` | Public | Dynamic pricing recommendation queue |
| `POST` | `/api/recommendations/:id/approve` | `admin`, `revenue_manager` | Approves recommendation (requires flag if step breached) |
| `POST` | `/api/recommendations/:id/apply` | `admin`, `revenue_manager` | Applies price change with economic floor re-verification |
| `POST` | `/api/recommendations/:id/reject` | `admin`, `revenue_manager` | Rejects recommendation with audited business rationale |
| `POST` | `/api/recommendations/regenerate` | `admin`, `revenue_manager` | Triggers deterministic recalculation cycle |
| `POST` | `/api/pricing/simulate` | Public | Elasticity scenario sandbox using standard financial model |
| `POST` | `/api/menu/:id/override-price` | `admin` | Manual price override enforcing economic floor with fees |

### Menu, Catalog & Operations
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/menu` | Public | Full menu catalog with cost breakdown and margins |
| `POST` | `/api/menu` | `admin`, `revenue_manager` | Create new menu item SKU with floor validation |
| `PUT` | `/api/menu/:id` | `admin`, `revenue_manager` | Update item prices, costs, or descriptions |
| `GET` | `/api/competitors` | Public | Location-scoped competitor directory |
| `GET` | `/api/competitors/observations` | Public | Competitor dish price observations with provenance |
| `POST` | `/api/competitors/observations` | `admin`, `revenue_manager` | Record new manual audit observation |
| `POST` | `/api/competitors/import-menu` | `admin`, `revenue_manager` | Ingest competitor dish rows via CSV/spreadsheet |
| `GET` | `/api/forecasting` | Public | Holt-Winters forward demand forecast with MAE/RMSE |
| `GET` | `/api/inventory` | Public | Ingredient stock levels and reorder thresholds |
| `PUT` | `/api/inventory/:id/adjust` | `admin`, `kitchen_ops` | Physical stock adjustment audit |
| `GET` | `/api/audit` | Public | Immutable audit log of all operations |
| `PUT` | `/api/policy` | `admin` | Configure pricing boundaries, rounding, and floors |

---

## 7. Verification & Test Suite

The repository includes an automated enterprise test suite covering 99 test cases across 3 specialized suites:

```bash
# 1. Run full release gate test suite (99/99 tests)
npm test

# 2. Run TypeScript compiler type-check
npm run lint

# 3. Build production bundle
npm run build

# 4. Start full-stack development server
npm run dev
```

### Test Coverage Breakdown
* **Pricing Engine Tests (55/55 passed):** Economic floor bounds, cost shocks, step movement limit clipping, policy ceiling conflicts, rounding invariants, negative costs/prices, platform commissions, net margin denominators, candidate price consistency, promotional discounts, and non-finite number validation.
* **Demand Forecasting Tests (15/15 passed):** Holt-Winters 7-day forward horizon, out-of-sample held-out split residual evaluation, MAE and RMSE invariants ($RMSE \ge MAE$), insufficient data handling, and prediction intervals.
* **Persistence & Security Tests (29/29 passed):** Disk storage health, restart survival, blocked recommendation prohibition, step override enforcement, economic floor revalidation at application time, HMAC-SHA256 token verification, tampered token rejection, expired token rejection, and role permission matrix enforcement.

---

## 8. Data Provenance & Demonstration Disclosure

RestaurantIQ clearly distinguishes between data sources across all views:
1. **Verified In-Person Audits:** Physical observations recorded by restaurant operators.
2. **Imported CSV Menus:** Operator-uploaded competitor menus with portion weights.
3. **Seeded Demonstration Datasets:** Explicitly marked sample data used to showcase multi-outlet scenarios, seasonal demand spikes, and cost inflation shocks.
4. **Emulated POS Feed:** Toast POS terminal feed emulated in safe demo mode without requiring live external cloud credentials.
5. **No Unauthorized Web Scraping:** The system does not bypass CAPTCHAs, simulate live Swiggy/Zomato feeds, or violate terms of third-party platforms.
