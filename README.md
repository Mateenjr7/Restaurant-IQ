# RestaurantIQ

### Restaurant intelligence, explainable dynamic pricing, and customer-trust safeguards

[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%7C%20TypeScript-646CFF)](#technology-stack) [![Backend](https://img.shields.io/badge/Backend-Express%20%7C%20Node.js-009688)](#architecture) [![Tests](https://img.shields.io/badge/Tests-131%20passing-2ea44f)](#testing) [![Pricing](https://img.shields.io/badge/Pricing-Deterministic%20%7C%20Policy--bounded-2447D4)](#pricing-safeguards)

RestaurantIQ is a full-stack restaurant operations and revenue-management application. It brings menu economics, competitor observations, demand forecasting, pricing recommendations, approvals, and audit history into one workspace—while keeping pricing decisions deterministic and bounded by explicit business policies.

> **Customer trust is a pricing-stability objective, not a churn prediction.** The application does not have customer-linked visit history or complaint data. It therefore reports pricing-stability evidence and clearly describes data limitations rather than claiming that an individual customer will or will not return.

---

## Contents

- [Overview](#overview)
- [Highlights](#highlights)
- [Customer Trust & Pricing Health](#customer-trust--pricing-health)
- [Pricing Safeguards](#pricing-safeguards)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Application Areas](#application-areas)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Testing](#testing)
- [Data, Privacy & Limitations](#data-privacy--limitations)
- [Repository Layout](#repository-layout)
- [Production Notes](#production-notes)

## Overview

RestaurantIQ supports restaurant operators and revenue managers through a guided pricing workflow:

1. Review menu costs, sales history, inventory, and available competitor observations.
2. Generate explainable recommendations with demand and margin context.
3. Check economic floors, item ceilings, movement limits, protected-price settings, and actual applied-price history.
4. Review, approve, reject, or apply recommendations through authenticated backend routes.
5. Inspect persisted price changes and operator actions in the trust dashboard and audit trail.

The experience combines an immersive product entry page with an operational command center. Existing menu, forecasting, inventory, competitor, simulator, approval, settings, and audit features remain part of the same application.

## Highlights

- **Deterministic pricing engine:** Uses costs, contribution targets, demand, inventory, and available competitor benchmarks. AI-generated advice cannot authorize or apply a price.
- **Economic-floor enforcement:** Revalidates minimum contribution economics against current item costs and active outlet fees.
- **Price-stability guard:** Configurable increase and decrease caps, minimum days between changes, rolling cumulative increase limits, manager-review warnings, stable-price protections, and optional loyalty-price protection.
- **Actual-price history:** Only recorded manual price changes and successfully applied recommendations count as actual changes. Generated recommendations are not treated as history.
- **Approval and application checks:** Rechecks current price, floors, ceilings, and stability rules at approval and application. Stale or duplicate applications are rejected.
- **Override safeguards:** Admin manual overrides still need to pass economic-floor, ceiling, and movement policies.
- **Customer Trust dashboard:** Displays menu stability status, verified price history, movement totals, blocked recommendations, review items, available order trends, and data limitations.
- **Demand forecasting:** Holt-Winters time-series forecasting with held-out error metrics when enough observations are available, and an explicit insufficient-data path otherwise.
- **Competitor intelligence:** Stores observations and provenance, normalizes matched prices for portion size, and scopes competitor information by outlet location.
- **Governance and audit:** Captures approvals, applications, rejections, manual overrides, policy updates, and blocked recommendation events.
- **Authenticated roles:** Server-verified signed tokens govern administrator, revenue manager, kitchen operations, and auditor capabilities.
- **Persistent local state:** Uses atomic JSON writes and upgrades existing data files while retaining compatibility with earlier supported schemas.
- **Responsive premium interface:** React, Three.js, Tailwind CSS, charts, and motion-enhanced views preserve the established RestaurantIQ visual style.

## Customer Trust & Pricing Health

Open **Customer Trust** from the application sidebar or visit `/app/trust`.

The page presents backend-derived information for:

- Stable and protected menu items.
- Items approaching or exceeding configured price-movement limits.
- Recommendations that need additional review and recommendations blocked by policy.
- Actual price-change events, dates, actors, and price transitions.
- Rolling per-item price movement and last actual price-change date.
- Historical order-volume trends when sufficient daily observations exist.
- An item-level risk assessment with evidence, period examined, explanation, quality notes, and limitations.

### Interpreting the risk assessment

Risk is described as a **pricing-stability risk**. A high or medium rating describes recorded or proposed price movement relative to configured guardrails; it does not estimate a specific customer's likelihood to churn.

The current application does not persist customer identifiers, repeat-customer order sequences, or complaint records. Seeded demonstration order histories are synthetic and are explicitly identified as such. Missing customer or complaint data is shown as a limitation—not filled with invented metrics.

## Pricing Safeguards

The pricing engine and database workflows apply independent policy checks. High demand, competitor benchmarks, or a normal admin override do not supersede mandatory limits.

### Economic floor

For configured discounts and fees, the minimum gross price must cover variable cost and required contribution:

```text
net multiplier = (1 - discount rate) × (1 - total fee rate)
economic floor = ceil((variable cost + minimum contribution) / net multiplier)
effective floor = max(economic floor, item minimum policy price)
```

The final rounded proposal is checked against the effective floor, the item policy ceiling, and applicable price-movement rules. If the applicable bounds cannot all be satisfied, the proposal is explicitly blocked.

### Stability controls

Manager-configurable settings include:

| Setting | Purpose |
|---|---|
| Maximum increase per change | Caps a proposed upward movement from the current applied price. |
| Maximum decrease per change | Caps a proposed downward movement. |
| Minimum days between changes | Prevents repeated changes from actual price events inside the interval. |
| Rolling cumulative increase limit | Limits accumulated increases within a configurable rolling period. |
| Trust-risk review threshold | Flags large or limit-approaching proposals for manager attention. |
| Protected items and categories | Holds selected menu prices stable. |
| Loyalty-price protection | Optionally protects every item from price changes. |

Rolling checks use persisted price changes, not recommendation cycles. Historical change percentages are evaluated using the recorded transition sequence so repeated small changes cannot avoid the configured cap.

## Architecture

```mermaid
flowchart TD
    Operator[Restaurant operator] --> UI[React and TypeScript application]
    UI --> API[Express REST API]
    API --> Auth[Signed-token authentication and role checks]
    API --> Pricing[Deterministic pricing and policy validation]
    API --> Forecast[Demand forecasting]
    API --> Store[Atomic JSON persistence]
    Pricing --> Store
    Forecast --> Store
    Store --> History[Actual price-change and audit history]
    History --> Trust[Customer Trust and Pricing Health API]
    Trust --> UI
    API --> Gemini[Optional server-side Gemini advice]
    Gemini -. Advisory only .-> UI
```

The Express server serves the Vite application in development and serves the built frontend in production mode. Pricing rules are implemented in the existing pricing engine and persistence/service layer rather than in a second pricing system.

## Technology Stack

| Area | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling and interaction | Tailwind CSS 4, Lucide, GSAP, Motion |
| Immersive visuals | Three.js |
| Backend | Node.js, Express, TypeScript (`tsx`) |
| Persistence | Atomic JSON file storage with schema migration |
| Authentication | HMAC-SHA256 signed session tokens and role-based access control |
| Forecasting | Deterministic Holt-Winters implementation with held-out validation |
| Optional AI advisory | Google Gemini via `@google/genai` |
| Tests | TypeScript release-gate suites run with `tsx` |

## Application Areas

| Area | What it covers |
|---|---|
| Command Center | Revenue and contribution indicators, alerts, and review queue. |
| Pricing & Margins | Explainable recommendations, warnings, approvals, and applications. |
| Menu Intelligence | Menu catalog, costs, item economics, and authorized price overrides. |
| Competitor Intelligence | Competitor observations, portion-aware matches, and imports. |
| What-If Prices | Scenario exploration for price, contribution, and demand assumptions. |
| Busy-Day Forecast | Menu-item demand projections and validation status. |
| Inventory & Food Cost | Stock levels, adjustments, and low-stock monitoring. |
| Assistants | Operational agent status and recommendation-cycle controls. |
| Customer Trust | Actual price stability, movement history, risk evidence, and limitations. |
| History | Auditable approvals, changes, blocks, and policy actions. |
| Rules & Settings | Pricing boundaries, rolling limits, protected items, and outlet settings. |

## API Reference

All routes use the same-origin `/api` prefix. Business and audit data require a valid signed token and the role listed below. Seeded demo login and role switching are available only outside production.

### Authentication and service status

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public (non-production only) | Authenticate a local seeded demo account or select a demo role; production returns `503` until a real user provider is configured. |
| `GET` | `/api/auth/session` | Optional token | Validate a token and return the current operator identity. |
| `GET` | `/api/auth/demo-accounts` | Public (non-production only) | List available role profiles for the local demonstration UI; returns `404` in production. |
| `GET` | `/api/live` | Public | Liveness check. |
| `GET` | `/api/ready` | Public | Readiness and storage status without filesystem details. |
| `GET` | `/api/health` | Admin, revenue manager, auditor | Detailed health, persistence, and service diagnostics. |

### Pricing, trust, and governance

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/metrics` | Admin, revenue manager | Dashboard metrics derived from available persisted sales data. |
| `GET` | `/api/recommendations` | Admin, revenue manager | Current and historical recommendation records. |
| `POST` | `/api/recommendations/regenerate` | Admin, revenue manager | Generate a new deterministic recommendation cycle. |
| `POST` | `/api/recommendations/:id/approve` | Admin, revenue manager | Approve after revalidating current policies. |
| `POST` | `/api/recommendations/:id/apply` | Admin, revenue manager | Apply an approved price after revalidation and record actual history. |
| `POST` | `/api/recommendations/:id/reject` | Admin, revenue manager | Reject with an audited rationale. |
| `POST` | `/api/menu/:id/override-price` | Admin | Apply a manual price that still passes mandatory limits. |
| `GET` | `/api/customer-trust` | Admin, revenue manager, auditor | Return persisted pricing-stability assessments and actual changes. |
| `GET` | `/api/audit` | Admin, revenue manager, auditor | Read the audit event history. |
| `GET` | `/api/policy` | Admin, revenue manager, auditor | Read the active pricing policy. |
| `PUT` | `/api/policy` | Admin, revenue manager | Validate, persist, and audit pricing policy updates. |
| `POST` | `/api/pricing/simulate` | Admin, revenue manager | Calculate a price scenario; does not apply a price. |

### Menu and operations

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/menu` | Admin, revenue manager, kitchen ops, auditor | Read menu catalog and item economics. |
| `POST` | `/api/menu` | Admin, revenue manager | Add a menu item. |
| `PUT` | `/api/menu/:id` | Admin, revenue manager | Update menu item details and costs. |
| `GET` | `/api/competitors` | Admin, revenue manager | Read competitor records. |
| `GET` | `/api/competitors/observations` | Admin, revenue manager | Read observations and provenance. |
| `POST` | `/api/competitors/observations` | Admin, revenue manager | Add a manual competitor observation. |
| `POST` | `/api/competitors/import-menu` | Admin, revenue manager | Import competitor menu rows. |
| `GET` | `/api/matches` | Admin, revenue manager | Read normalized menu matches. |
| `PUT` | `/api/matches/:id` | Admin, revenue manager | Update a match review status. |
| `GET` | `/api/forecasting` | Admin, revenue manager, kitchen ops, auditor | Read demand forecasts; optionally filter by item ID. |
| `GET` | `/api/inventory` | Admin, revenue manager, kitchen ops, auditor | Read inventory and alert state. |
| `PUT` | `/api/inventory/:id/adjust` | Admin, kitchen ops | Record an inventory adjustment. |
| `GET` | `/api/outlets` | Admin, revenue manager | Read outlet configuration. |
| `POST` | `/api/outlets/switch` | Admin | Change the active outlet. |
| `GET` | `/api/agents` | Admin, revenue manager, auditor | Read assistant status. |
| `POST` | `/api/agents/run-cycle` | Admin, revenue manager | Run an operational recommendation cycle. |
| `POST` | `/api/ai/strategic-advice` | Admin, revenue manager | Request optional server-side advisory text (maximum 2000 characters; rate-limited). |

## Getting Started

### Requirements

- Node.js and npm compatible with the versions in `package-lock.json`.
- Git, if cloning the repository.
- A Gemini API key is optional; core pricing, persistence, and forecasting do not depend on it.

### Install and run locally

```bash
git clone https://github.com/Mateenjr7/Restaurant-IQ.git
cd Restaurant-IQ
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The application initializes local demonstration data under `data/` on first server start. That runtime data is intentionally ignored by Git.

### Run checks

```bash
npm test
npm run lint
npm run build
```

## Environment Configuration

Use `.env.example` as the template for local configuration. Do not commit `.env` files, API keys, or production secrets.

| Variable | Required | Description |
|---|---:|---|
| `PORT` | No | Express server port; defaults to `3000`. |
| `AUTH_SECRET` | Production | HMAC signing secret; production requires at least 32 characters. Development generates an ephemeral secret if omitted. |
| `GEMINI_API_KEY` | No | Enables the optional server-side Gemini advisory feature. |
| `APP_URL` | No | Application origin used in deployment configuration. |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origin allowlist. |

Never use the example secret or example API-key values in a real deployment. Supply production values through the hosting platform's secret manager.

## Testing

The release-gate suite currently runs **131 assertions** across four suites:

| Suite | Assertions | Coverage |
|---|---:|---|
| Pricing engine | 55 | Economic floor, rounding, ceiling conflicts, movement boundaries, fees, discounts, and invalid inputs. |
| Forecasting | 21 | Forecast horizon, held-out metrics, chronological validation, synthetic-data labels, and missing/invalid-history behavior. |
| Persistence and security | 36 | Persistence recovery, restart behavior, transaction rollback, approvals, overrides, token validation, and role permissions. |
| Customer trust | 19 | Directional caps, rolling accumulation, windows, minimum spacing, protected prices, staleness, duplicate applications, audit, and persistence. |

```bash
npm test        # Run all four suites
npm run lint    # TypeScript check (tsc --noEmit)
npm run build   # Production frontend build
```

## Data, Privacy & Limitations

- The application persists local menu, policy, recommendation, audit, and price-change data in `data/restaurantiq-data.json`; this runtime file is not included in the repository.
- Existing older supported data schemas are migrated with defaults for newly introduced policy settings.
- Newly recorded changes form the verified price-history basis. A legacy item's `lastUpdated` timestamp is not assumed to prove a price change.
- Seeded sales and competitor examples are demonstration data and must not be presented as verified live data.
- Forecast outputs disclose when they use synthetic demo records; an item with no usable order baseline produces no forecast values.
- There is no persisted customer identity, customer-level repeat-visit series, or complaint dataset. Customer retention conclusions are therefore unavailable.
- The configured POS integration is demonstration/emulated unless separately connected to a real provider. Do not assume that a local application has changed an external POS.
- Competitor information depends on the observations and imports supplied to the application; no live third-party feed is guaranteed.
- This software provides operator decision support. Restaurant operators remain responsible for checking data accuracy and approving real-world price changes.

## Repository Layout

```text
.
├── server.ts                         # Express API and application startup
├── server/
│   ├── auth.ts                       # Signed sessions and role authorization
│   ├── db.ts                         # Persistence, policies, workflows, audit
│   ├── forecasting.ts                # Demand forecasts and validation
│   ├── gemini.ts                     # Optional server-side AI advisory
│   ├── pricing-engine.ts             # Deterministic pricing and stability rules
│   ├── seed-data.ts                  # Clearly identified demo data
│   └── types.ts                      # Shared backend domain types
├── src/
│   ├── App.tsx                       # Navigation, API integration, application shell
│   ├── components/                   # Shared UI and interactive components
│   ├── landing/                      # Immersive entry experience
│   └── views/                        # Dashboard, pricing, operations, trust, settings
├── data/                             # Local persisted data (generated; git-ignored)
├── public/assets/                    # Public visual assets
├── test-all.ts                       # Combined release gate
├── test-customer-trust.ts            # Customer trust and price policy tests
├── test-forecasting.ts               # Forecasting tests
├── test-persistence-security.ts      # Persistence and authentication tests
└── test-pricing-engine.ts            # Pricing-engine tests
```

## Production Notes

- Build the frontend with `npm run build`; the output is written to `dist/`.
- Set `NODE_ENV=production`, a secure `AUTH_SECRET`, the intended `PORT`, `APP_URL`, and exact `ALLOWED_ORIGINS` in the deployment environment.
- Production login deliberately rejects seeded demo accounts and role switching. This repository does not yet include a production user directory or external identity-provider integration; do not expose it as an authenticated production service until that is configured.
- Detailed business and audit APIs require an authenticated, authorized role. Liveness and readiness endpoints return only operational status.
- JSON persistence keeps a rolling previous-state backup. If neither the primary file nor backup can be parsed, startup fails rather than replacing potentially recoverable data with seed values.
- Configure TLS termination, allowed origins, durable storage/backup, monitoring, and a real POS integration as appropriate for the target deployment.
- The repository contains a local development setup; a public production deployment is not implied by the presence of a GitHub repository.
- Review the application-specific data disclosure and demo-mode behavior before connecting live business data.
