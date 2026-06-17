# 16 — Implementation Status (Honest Assessment)

**Date:** 2026-06-17  
**Branch baseline:** `ab5695e` (per `docs/onboarding/_artifacts/bootstrap-metrics.md`)  
**Purpose:** What actually works, what is partial, what is missing tests, inconsistencies, dead code, and deployment risks.  
**Not marketing.** If a feature is UI-only, it says so.

---

## TL;DR verdict

| Dimension            | Grade  | One-line truth                                                                          |
| -------------------- | ------ | --------------------------------------------------------------------------------------- |
| Core B2B order flow  | **A**  | Restaurant cart → supplier accept → fulfill → receive → invoice works end-to-end        |
| Admin platform       | **A-** | 14 lazy-loaded tabs; impersonation + plans + deals production-usable                    |
| Monetization / tiers | **A-** | FE/BE keys aligned; Free Trial = Gold features + Free limits is confusing by design     |
| Hospitality add-ons  | **B+** | Reservations, staff, consumer B2C shipped; less demo polish than core B2B               |
| Logistics / GPS      | **B**  | Fulfillment board strong; driver accounts not in `seed:full`; GPS env-dependent         |
| Test coverage        | **B+** | ~1008 API + web unit tests; E2E only 16 Playwright files; 554 routes mostly API-unit    |
| Production readiness | **B**  | Railway docs exist; Keycloak memory/OOM history; cron in-process; lint gate still noisy |

**Demo readiness:** **Yes**, with scripted path (`12-demo-script.md`). **Free roam:** **No** — known UI-only settings tabs and finance gaps.

---

## Metrics (code-verified)

| Metric                  | Value | Source                             |
| ----------------------- | ----: | ---------------------------------- |
| API routes              |   554 | `docs/audits/route-inventory.json` |
| SQL migrations          |   179 | `apps/api/db/migrations/`          |
| API test files          |   213 | bootstrap-metrics                  |
| Web test files          |   309 | bootstrap-metrics                  |
| Playwright e2e specs    |    16 | `tests/e2e/suites/`                |
| Frontend routes         |   ~80 | `apps/web/src/App.tsx`             |
| Permission keys         |    52 | `permission-keys.js`               |
| Restaurant feature keys |    26 | `feature-keys.js`                  |
| Supplier feature keys   |    24 | `feature-keys.js`                  |

---

## What is fully working

These domains have **UI + API + RBAC + plan gates + meaningful tests**:

| Domain                                  | Evidence                                                               | Confidence                    |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| OIDC auth & session refresh             | `auth.routes.js`, e2e auth                                             | High                          |
| Tenant RBAC (16 system roles)           | `role-matrix.js`, `rbac-full-app.test.js`                              | High                          |
| Plan features & limits                  | `plan-enforcement.js`, `verify-tier-matrix`                            | High                          |
| Supplier catalog CRUD + CSV + image ZIP | `products.routes.js`, migration `0168`                                 | High                          |
| Restaurant browse, cart, place order    | e2e `orders.spec.ts`                                                   | High                          |
| Supplier accept/decline orders          | `order-decline.md`, order status enum                                  | High                          |
| Fulfillment board & dispatch            | `FulfillmentPage`, fulfillment routes                                  | High                          |
| Receiving                               | `receiving.routes.js`, API spec                                        | High                          |
| Disputes & credit notes                 | `disputes.service.js`                                                  | High                          |
| Invoices & payments (core)              | `invoices.routes.js`                                                   | High                          |
| Chat + Socket.IO                        | `chat.routes.js`, `useChatRealtime`                                    | Medium-High (Redis-dependent) |
| Deals/promotions + admin approval       | `deal-promotions.service.js`                                           | High                          |
| Admin command center                    | `admin-dashboard/*`, lazy tabs                                         | High                          |
| Reservations FOH + public booking       | `reservations.routes.js`                                               | High                          |
| Consumer B2C storefront                 | migrations `0161`–`0164`, smoke e2e                                    | Medium-High                   |
| Supplier growth program                 | migration `0169`, tests                                                | High                          |
| Supplier ops wave 2                     | run sheet, pick lists, collections, POD, quote lock, accounting export | High                          |
| Quote requests RFQ                      | migration `0153`                                                       | Medium-High                   |
| Warehouses & branches                   | `warehouses.routes.js`, branches audit                                 | High                          |
| Tenant audit log (Gold)                 | `tenant-audit.routes.js`                                               | High                          |

---

## Partial — UI exists, backend incomplete, or behavior wrong

| Feature                                | What works                         | What does not                                                 | Evidence                           |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| **Supplier Settings → Contacts**       | Same                               | UI-only; honest toast after audit fix                         | `SupplierSettingsPage.tsx`         |
| **Restaurant finance statements**      | Period charges/payments/closing    | **`openingBalance` hardcoded `0`**                            | `restaurant-finance.routes.js:795` |
| **Dashboard period selector**          | UI toggles 7d/30d/90d              | **Does not refilter** spend trend (fixed 30d)                 | `DashboardPage.tsx`; demo audit    |
| **Smart reorder**                      | API + forecast job                 | No dedicated nav; dashboard widget only                       | `reorder-forecast.job.js`          |
| **Delivery rollover cron**             | Manual script + per-assignment API | **Hourly cron no-op** unless `DELIVERY_ROLLOVER_ENABLED=true` | `env.js`, `cron-jobs.md`           |
| **Credit notes nav**                   | Via disputes/invoices              | No top-level restaurant nav                                   | feature audit                      |
| **Restaurant `restaurant-gold@` demo** | Gold entitlements                  | **Past-due billing** seeded intentionally                     | `seed-billing.js`                  |
| **Supplier `supplier-silver@` demo**   | Silver entitlements                | **Locked account** seeded                                     | `seed-billing.js`                  |
| **Deal redemption metering**           | Limit check at redemption          | Increment path flagged for manual QA                          | demo audit §4.8                    |
| **Role change audit**                  | Tenant audit on some events        | Thin coverage for all RBAC mutations                          | demo audit §8                      |
| **Last-owner guard**                   | Prevents demotion in org context   | Org-less owner can self-demote edge case                      | demo audit §8                      |

---

## Missing or weak test coverage

| Area                          | Unit/API tests                | E2E                                       | Gap severity         |
| ----------------------------- | ----------------------------- | ----------------------------------------- | -------------------- |
| Auth login flow               | Partial                       | `auth.spec.ts`                            | Low                  |
| Fulfillment + GPS live        | Component tests               | None full path                            | **Medium**           |
| Driver deliveries E2E         | `driver-rbac` unit            | None                                      | **Medium**           |
| Restaurant finance statements | Sparse                        | None                                      | **Medium**           |
| Consumer B2C checkout         | Some API                      | Smoke only                                | Medium               |
| Admin mutations (plan change) | API tests                     | Skipped in route matrix (`SKIP_MUTATION`) | Medium               |
| 554 API routes                | ~213 test files               | Live route matrix skips unsafe            | **High breadth gap** |
| Mobile app                    | Sibling repo                  | Not in this metrics                       | External             |
| PWA push end-to-end           | Manifest unit                 | None                                      | Low                  |
| Impersonation                 | `admin-impersonation.spec.ts` | Manual                                    | Low                  |

**Honest statement:** Unit test count is **impressive** (~1300+ tests combined), but **E2E breadth is narrow** (16 files). Most routes are validated only by inventory/matrix classification, not automated HTTP tests.

---

## Permission / plan inconsistencies

| Issue                           | Detail                                                                                                 | Severity                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Free Trial feature parity       | Free plan uses **Gold feature JSON** with **Free limits** — looks like Gold in UI, hits limits quickly | Intentional; document in sales          |
| GPS tracking                    | **Not plan-gated** — env flag only                                                                     | Product decision; surprises tier buyers |
| Reservations                    | **No `feature-keys` entry** — always on                                                                | May not match packaging docs            |
| `promotions` limit              | Supplier-only; restaurant uses `supplier_deals` + `deal_redemptions_per_day`                           | Correct in code; easy doc confusion     |
| Enterprise tier                 | **Removed** from catalog (`0066`); maps to platinum in code only                                       | Legacy data may exist                   |
| Bronze display name             | Mapped to Silver in UI (`formatPlanDisplayName`)                                                       | Cosmetic                                |
| Contract pricing feature key    | Placeholder gating                                                                                     | Low                                     |
| Frontend-only permission checks | UX hiding; **API is source of truth**                                                                  | OK if API always called                 |

**Verification tools that pass:** `pnpm verify:tier-matrix`, `plan-catalog-audit` tests, `adminLimitLabels.test.ts`.

---

## Dead code, deprecated, and removed features

| Item                                    | Status                                         | Evidence                                                   |
| --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Approvals & budgets                     | **Removed**                                    | migration `0114`; `REMOVED_FEATURE_KEYS`                   |
| Enterprise plan selectable              | **Deactivated**                                | `0066_remove_enterprise_tier.sql`                          |
| Supplier command-center broken link     | **Fixed**                                      | was `/app/supplier/command-center` → `/app/command-center` |
| Fake success toasts (supplier settings) | **Fixed**                                      | honest messaging                                           |
| `api_user` DB role grants               | **Commented out**                              | migrations `0019`, `0020`, `0039`                          |
| Uncommitted admin refactor              | Was in audit — verify committed on your branch | demo audit §10                                             |

**Possible dead UI:** Supplier Settings tabs behind `false` flags — not dead, deliberately disabled.

---

## Seed data honesty (`seed:full`)

| Seeded well                                                | Not seeded / weak                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| 10 prod-like restaurants, 50 suppliers                     | Driver Keycloak logins                                                     |
| ~2k products, ~1.5k orders                                 | Live GPS route history                                                     |
| Invoices, chats, quick lists                               | Multi-warehouse stock edge cases                                           |
| Tier demos Free–Platinum                                   | Smart-reorder demand history depth                                         |
| Disputes, approved deals                                   | Receiving line items for every order                                       |
| Coupon `DEMOFORK10`, expiry item, near-limit Free supplier | Near-limit restaurant examples                                             |
| ~70 Keycloak accounts                                      | `seed:tier-catalog` team roles (`*-manager@`) **not** in default full seed |

**Best demo logins:** `restaurant@supplify.com` + `supplier@supplify.com` (Gold, **active billing**, richest extras).  
**Avoid for smooth demo:** `restaurant-gold@` (past due), `supplier-silver@` (locked).

---

## Deployment risks

| Risk                            | Why it hurts                                   | Mitigation                                             |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| **Keycloak OOM on Railway**     | Historical 7–10 GB spikes                      | `KEYCLOAK_RAILWAY_MEMORY_FIX.md`, JVM caps             |
| **In-process crons**            | Duplicate runs if API scaled horizontally      | `CRONS_ENABLED` + single replica or external scheduler |
| **Redis optional**              | Socket.IO / perm cache inconsistent multi-node | Mandate Redis prod                                     |
| **Migration partial failure**   | Compose migrate continues on error (`WARN`)    | CI fresh-DB migration gate                             |
| **Public Redis URL on Railway** | Egress fees / wrong host                       | `resolve-redis-url.js`                                 |
| **Session store in Postgres**   | Load on auth                                   | Acceptable at current scale; watch pool                |
| **Lint max 0 warnings**         | 46 warnings remain — CI may fail               | demo audit §6                                          |
| **Destructive seed on staging** | `seed:full` wipes tenants                      | Process guard                                          |
| **GPS / Maps API keys**         | Tracking UI blank in prod                      | Env checklist                                          |
| **SMTP not configured**         | Silent email failures                          | Mailpit dev; Resend prod                               |

---

## Mobile parity status

| Area         | Web      | Mobile (`supplify-mobile`) |
| ------------ | -------- | -------------------------- |
| Auth PKCE    | Cookie   | Bearer                     |
| Orders       | Full     | Parity expected            |
| Driver GPS   | Web view | Primary capture            |
| Admin        | Full     | Limited/none               |
| Consumer B2C | Full     | Partial                    |

Rule: `.cursor/rules/mobile-parity.mdc` — changes must be evaluated. Drift documented in `docs/mobile/MOBILE_FEATURE_PARITY.md`.

---

## CI / quality gates (honest)

| Gate                 | Typical status     | Notes                                            |
| -------------------- | ------------------ | ------------------------------------------------ |
| `pnpm typecheck`     | Pass               | per demo audit                                   |
| API `vitest run`     | Pass (~1008 tests) | fixed stale mocks Jun 2026                       |
| Web `vitest run`     | Pass               | + locked deals regression                        |
| `pnpm lint`          | **May fail**       | 46 warnings (22 exhaustive-deps)                 |
| Playwright e2e       | Requires infra     | auth, orders, rbac, catalog, subscription-limits |
| `verify:tier-matrix` | Needs live DB      | not always in CI                                 |

---

## Feature status by persona

### Restaurant — **85% complete**

Working: orders, cart, suppliers, receiving, invoices, inventory, deals, chat, quick lists, disputes, reservations, consumer modules, reports (tiered).  
Weak: finance statement opening balance, smart reorder surfacing, dashboard period filter.

### Supplier — **82% complete**

Working: catalog, orders, fulfillment, invoices, promotions, growth, contract pricing, warehouses, **run sheet, pick lists, collections reminders, accounting export, warehouse zones UI, quote price lock, POD media**.  
Weak: settings contacts tab, driver seed login, deal approval dependency for new promos.

### Admin — **88% complete**

Working: overview, tenants, plans, subscriptions, limits, deals, finance, ops health, audit, impersonation.  
Weak: some mutation paths manual QA only; password reset marked unsafe in route matrix.

### Driver — **75% complete**

Working: role isolation, delivery board, status enum, proof of delivery APIs.  
Weak: no default demo account; GPS depends on ops env; E2E gap.

### Public / guest — **80% complete**

Working: reservations, consumer order flow, public supplier catalog (no anon prices), quote flows.  
Weak: abuse protection (rate limits only).

---

## Recommended engineering priorities

1. **Wire or hide** Supplier Settings Contacts (product decision).
2. **Fix** restaurant finance `openingBalance` calculation.
3. **Add** driver demo to `seed:full` (Keycloak + one assignment).
4. **E2E:** fulfillment → driver status → restaurant tracking path.
5. **Dashboard:** wire period selector or remove control.
6. **Production:** migration CI on empty DB; Redis required flag.
7. **Lint:** burn down 46 warnings or adjust gate policy explicitly.

---

## How this doc stays honest

- Claims cite files, migrations, or audit docs — not roadmap slides.
- "Working" means code path exists and was verified in audits/tests — not that every customer edge case is handled.
- Partial features are **not** labeled Shipped in [13-acceptance-criteria.md](./13-acceptance-criteria.md).

---

## Related artifacts

| Document                                                                       | Use                       |
| ------------------------------------------------------------------------------ | ------------------------- |
| [SUPPLIFY_DEMO_READINESS_AUDIT.md](../audits/SUPPLIFY_DEMO_READINESS_AUDIT.md) | Jun 2026 demo pass        |
| [full-app-feature-audit.md](../archive/audits/full-app-feature-audit.md)       | Feature matrix            |
| [DEV_API_ROUTE_TEST_MATRIX.md](../audits/DEV_API_ROUTE_TEST_MATRIX.md)         | Route test classification |
| [12-demo-script.md](./12-demo-script.md)                                       | What to show anyway       |

---

_Document version: 2026-06-17. Re-verify after major merges._
