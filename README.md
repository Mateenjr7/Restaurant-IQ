# RestaurantIQ

RestaurantIQ is a restaurant operations and revenue-management workspace. It brings menu costs, demand forecasts, competitor observations, inventory, and pricing decisions together so teams can make informed, reviewable changes.

> **Demonstration software:** Current seeded and imported records are synthetic examples, not verified live restaurant data. Production authentication and customer identity are not configured.

## What it does

- **Understand menu economics:** Review recipe costs, fees, contribution, and margin floors.
- **Plan for demand:** Forecast item-level demand and show validation quality when there is enough history.
- **Compare the market:** Record competitor observations and review portion-aware menu matches.
- **Make controlled pricing decisions:** Generate explainable recommendations bounded by pricing policies, stability limits, and approval checks.
- **Track operations:** Review inventory, approvals, applied price changes, and audit history.
- **Assess pricing stability:** Inspect actual price movements and their evidence without claiming to predict individual customer churn.

Pricing and policy checks are deterministic. Optional Gemini advice is advisory only; it cannot approve or apply a price.

## Technology

| Layer | Stack |
|---|---|
| Web application | React, TypeScript, Vite, Tailwind CSS |
| API | Node.js, Express |
| Database | Supabase PostgreSQL |
| Forecasting | Holt-Winters with held-out validation |
| Optional AI advice | Google Gemini |

## Run locally

### Requirements

- Node.js and npm compatible with `package-lock.json`.
- A configured PostgreSQL database and its verified TLS CA certificate.

### Setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env` and configure the server-side database URLs, PostgreSQL mode, TLS certificate path, and a development authentication secret. Keep `.env`, passwords, and certificates private.
3. Make sure the database schema and restricted runtime role have been provisioned. Database migration and import scripts default to dry-run; review their output before explicitly applying changes.
4. Start the application:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

Demo accounts and role switching are available only outside production.

### Build a container

With Docker Desktop running, build the production image:

```powershell
docker build -t restaurantiq:local .
```

The image excludes local environment files and certificates. To run it, provide the required production environment values and mount the verified PostgreSQL CA certificate at `/run/secrets/supabase-ca.crt`. Use a disposable database for local container testing; the application writes to its configured database.

### Continuous integration and image publishing

GitHub Actions runs the type check, tests, and production build on pushes and pull requests targeting `main`. A successful push to `main` also publishes `latest` and commit-specific tags to Docker Hub. Create the matching Docker Hub repository and add the repository Actions secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (a Docker Hub access token) before merging to `main`.

### Kubernetes deployment

The `k8s/` manifests define the app namespace, a single-replica Deployment, an internal ClusterIP Service, database-backed readiness and liveness probes, and a CPU-based HPA (1–4 replicas, 70% target). The HPA requires a working Kubernetes metrics API. The `k8s/monitoring/` manifests add internal Prometheus and Grafana services, authenticated application metrics, a provisioned dashboard, and Prometheus alert rules. Monitoring uses ephemeral storage and is intended for the capstone demo, not long-term retention. The public image is `mateen7jr/restaurantiq:latest`.

Apply both namespace manifests first:

```powershell
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/monitoring/namespace.yaml
```

Create random values with a password manager and export them to protected local files outside the repository. Keep the scrape-token file to one line with no trailing newline. Reference those files when creating Secrets so values are not placed in shell history or command-line arguments:

```powershell
$metricsTokenFile = "C:\secure-path\restaurantiq-scrape-token"
$grafanaPasswordFile = "C:\secure-path\grafana-admin-password"
kubectl create secret generic restaurantiq-observability -n restaurantiq --from-file="scrape-token=$metricsTokenFile"
kubectl create secret generic restaurantiq-observability -n monitoring --from-file="scrape-token=$metricsTokenFile" --from-file="admin-password=$grafanaPasswordFile"
```

Create `restaurantiq-runtime` in `restaurantiq` with `DATABASE_URL`, a unique `AUTH_SECRET` of at least 32 characters, and `ALLOWED_ORIGINS` set to the app's intended origin. Create `restaurantiq-ca` from the current trusted Supabase CA certificate using the key `supabase-ca.crt`. Do not commit these values, certificates, or expose them in logs. Apply the app Deployment, Service, and HPA, then all manifests in `k8s/monitoring/`. The Prometheus endpoint requires the bearer token; Grafana and Prometheus have only ClusterIP Services. Use `kubectl port-forward` for the demo rather than exposing monitoring publicly:

```powershell
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

Open `http://localhost:3000` and sign in as `admin` with the privately saved Grafana password. Prometheus alert rules are evaluated and visible in its UI; notification delivery requires a separately configured provider.

To inspect Prometheus targets and alert rules locally, use a second terminal:

```powershell
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```

Then open `http://localhost:9090/targets` or `http://localhost:9090/alerts`.

The app Service is internal; expose it only after ingress, TLS, and production authentication are configured.

### AWS EKS infrastructure

`infra/terraform/` provisions a tagged VPC across two availability zones, an EKS cluster, one managed EC2 worker initially (up to two by default), and the EKS metrics-server add-on used by the HPA. It omits a NAT Gateway to reduce fixed costs; worker nodes use public subnets, while the Kubernetes API is limited to the administrator CIDRs you provide. EKS, worker compute, storage, and public IPv4 addresses can all incur charges.

Terraform state and local variable files are excluded from Git. From `infra/terraform/`, run `terraform init`, then `terraform fmt -check -recursive`, `terraform validate`, and `terraform plan`. The plan prompts for an AWS region and the administrator's public IPv4 CIDR (usually your current IP with `/32`). Review the plan and compare regional pricing. Confirm available credits and budget before running `terraform apply`; EKS cannot be paused, and deleting the cluster is required to stop its control-plane charge. Applying this configuration creates billable AWS resources. After approval and creation, use the `configure_kubectl` output to connect kubectl to the cluster.

## Verify changes

```bash
npm test
npm run lint
npm run build
```

PostgreSQL integration tests write data. Run them only against a separate, disposable test database as described in `scripts/test-postgres-concurrency.ts`; never use a shared or production database.

## Data and deployment notes

- PostgreSQL is the application’s authoritative store. The server requires PostgreSQL and has no production JSON fallback; files in `data/` are retained as local migration inputs and backups.
- The currently imported demonstration snapshot contains synthetic records. Do not treat example sales, prices, forecasts, or competitor observations as verified business data.
- Customer-level visit identities and complaint history are not collected, so the application cannot support individual retention or churn predictions.
- Competitor intelligence depends on observations supplied to the application; a live third-party feed is not guaranteed. POS actions are not connected to a real provider by default.
- The application is currently single-restaurant. It does not provide database-backed tenant membership or per-user tenant isolation.
- Production authentication requires a real identity provider, which is not included. Do not expose the application as a production authenticated service until this is configured and the deployment’s access controls, backups, and monitoring are reviewed.

## Project structure

```text
src/                    React application, views, and landing experience
server/                 API, pricing, forecasting, authentication, and persistence
supabase/migrations/    Versioned PostgreSQL schema
scripts/                Database setup, migration, import, and verification tools
public/assets/          Static assets
test-*.ts               Pricing, forecasting, persistence, and trust tests
```

For setup details, see `.env.example` and the database scripts in `scripts/`. Database administration commands should be run only after reviewing their dry-run output and confirming the target project.
