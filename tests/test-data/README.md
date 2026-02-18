# Test data for E2E/API

- **Reset and seed** (run from repo root):
  - `pnpm db:migrate` — ensure schema
  - `pnpm db:seed` — base seed
  - `pnpm seed:prodlike` — prod-like data (restaurants, suppliers, products)
  - `pnpm seed:demo-users` — Keycloak demo users (admin, restaurant, supplier)

- **E2E reset/seed API** (deterministic, test-only): When `E2E_SECRET` is set, the API exposes `POST /api/e2e/reset-seed` (header `X-E2E-Secret`). Scenarios: `orders_basic`, `catalog_basic`, `subscription_limits_basic`, `orders_delivered`. Tests call `resetAndSeed(request, { scenario })` from `e2e/utils/seed.ts` in `beforeEach` so each test gets fresh data.

- **Factory** (`factory.ts`): exports `DEMO_USER_EMAILS`, `TEST_ORG_IDS`, `E2E_ORDER_ID`, `getSeededData()` for use in tests. Override IDs via env: `E2E_RESTAURANT_ORG_ID`, `E2E_SUPPLIER_ORG_ID`, etc.
