# Release notes — refactoring-dev → dev (2026-06-11)

Branch **`refactoring-dev`** merged into **`dev`**, then promoted **`dev` → `preprod` → `prod`** via `scripts/promote-release.mjs`.

## Summary

This release bundles UI modernization (admin, supplier, restaurant, mobile), operational hardening (cron jobs), product painkiller features (reorder assistance, branding, deals banner, support chat, featured placement), and **quote requests + supplier mini-store**.

## Migrations (run in order)

| #    | File                                    | Purpose                                               |
| ---- | --------------------------------------- | ----------------------------------------------------- |
| 0147 | `reorder_assistance_suppressions.sql`   | Dedup for reorder assistance notifications            |
| 0148 | `tenant_branding_columns.sql`           | `brand_primary`, `brand_accent`, `brand_display_name` |
| 0149 | `support_chat_schema.sql`               | Admin ↔ tenant support chat                          |
| 0150 | `supplier_featured_placements.sql`      | Paid featured supplier list placement                 |
| 0151 | `deal_banner_dismiss.sql`               | Per-user deal banner dismiss                          |
| 0152 | `billing_trial_reminder_log.sql`        | Trial reminder dedup                                  |
| 0153 | `cron_followup_infrastructure.sql`      | Cron/email retry/digest support tables                |
| 0154 | `quote_requests_and_public_catalog.sql` | RFQ tables + `supplier.public_catalog_enabled`        |

## Feature highlights

### UI modernization (web)

- Admin dashboard split into lazy tabs; KPI/operations polish
- Supplier pages: command center, inventory, settings, fulfillment
- Restaurant pages: products, orders, inventory, onboarding
- Shared UI: `kpi-card`, `section-header`, `detail-page-skeleton`, native `Select` migration
- Mobile responsive pass (Section 19 checklist in modernization plan)

### Quote requests & supplier mini-store

- Restaurant: request best price, compare supplier responses, add winner to cart (no auto-order)
- Supplier: quote inbox, per-line response
- Public catalog: `/supplier/:slug`, settings copy/preview link
- Docs: [QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md](../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md)

### Reorder, branding, deals, support (see audit doc)

- Restaurant reorder assistance panel; supplier follow-up panel
- Runtime tenant branding (`TenantBrandingProvider`, Gold+ gate)
- New deals banner with dismiss; featured supplier placement
- Admin support chat; warehouse/fulfillment UI improvements
- Audit: [REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md](../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md)

### Cron & background jobs

- Central `register-cron-jobs.js`; 16 in-process jobs
- New: email retry, email digest, stale GPS alerts, log retention, trial-ending-soon
- CLI: `pnpm jobs:list`, `pnpm jobs:run <key>`
- Docs: [cron-jobs.md](../operations/cron-jobs.md), [CRON_AND_BACKGROUND_JOBS_AUDIT.md](../audits/CRON_AND_BACKGROUND_JOBS_AUDIT.md)

## API additions

- `POST/GET /api/quote-requests/*` — RFQ lifecycle
- `GET /api/public/suppliers/:idOrSlug` — public mini-store
- `GET /api/public/suppliers/:idOrSlug/products[/priced]`
- Support chat, featured placement, branding endpoints (see audit doc)

## Unchanged (explicit)

- Order creation price resolution at checkout
- Promotions/deals discount engine (except banner dismiss + placement)
- Invoice generation, receiving, subscription billing core

## Post-merge checklist

1. Run migrations on dev/preprod/prod API
2. Smoke-test quote flow (restaurant create → supplier respond → compare → cart)
3. Smoke-test `/supplier/:slug` (anonymous + logged-in restaurant)
4. Verify cron registration in API logs (`registerCronJobs`)
5. Walk [UI modernization QA](../ui/SUPPLIFY_UI_MODERNIZATION_PLAN.md) Section 19

## Mobile parity

Web-only for quote UI and mini-store. See [MOBILE_FEATURE_PARITY.md](../mobile/MOBILE_FEATURE_PARITY.md).
