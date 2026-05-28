# Mermaid diagram audit report

**Date:** 2026-05-28  
**Tier reference:** [docs/monetization/FINAL_TIER_MATRIX.md](docs/monetization/FINAL_TIER_MATRIX.md)  
**Branch/warehouse reference:** [docs/BRANCHES_WAREHOUSES_AUDIT.md](docs/BRANCHES_WAREHOUSES_AUDIT.md)

---

## Summary

| Metric                                              |         Count |
| --------------------------------------------------- | ------------: |
| Existing `.mmd` files reviewed (blueprint)          |     21 unique |
| Blueprint `.mmd` updated                            |             5 |
| New `.mmd` in `docs/diagrams/`                      |            28 |
| Total `.mmd` in repo after audit                    |            49 |
| Grep issues (Bronze, approvals, unlimited branches) | 0 unjustified |

---

## Existing `.mmd` files reviewed

All under `docs/blueprint/`:

- `feature_overview.mmd` — OK; no Bronze/approvals; feature map accurate
- `system_context.mmd` — OK
- `api_architecture.mmd` — OK; includes org/branches, billing, public reserve
- `deployment_architecture.mmd` — OK
- `rbac_multitenancy.mmd` — **Updated** (org billing, removed approvals_budgets note)
- `erd_full.mmd` — OK (billing entities)
- `workflows/subscription_flow.mmd` — **Updated** (tier comment, trial, add-ons)
- `workflows/order_flow.mmd` — OK
- `workflows/fulfillment_flow.mmd` — OK
- `workflows/receiving_flow.mmd` — OK
- `workflows/inventory_flow.mmd` — OK
- `workflows/invoice_flow.mmd` — OK
- `workflows/chat_flow.mmd` — OK
- `workflows/reservation_flow.mmd` — **Updated** (availability, waitlist pointers)
- `workflows/admin_management_flow.mmd` — OK (subset of admin tabs)
- `workflows/admin_impersonation_flow.mmd` — **Updated** (full tenant nav note)
- `workflows/conversion_funnel_flow.mmd` — OK
- `workflows/recommendation_flow.mmd` — **Updated** (Free trial → Gold wording)
- `ui_sitemap/admin_ui_sitemap.mmd` — OK
- `ui_sitemap/restaurant_ui_sitemap.mmd` — OK
- `ui_sitemap/supplier_ui_sitemap.mmd` — OK

No diagram claimed Platinum has **unlimited branches** (Platinum = 3 included + add-ons; >6 → Enterprise).

---

## New `.mmd` files created (`docs/diagrams/`)

| Path                                          | Status                                             |
| --------------------------------------------- | -------------------------------------------------- |
| `architecture/system-context.mmd`             | current                                            |
| `architecture/api-routes-overview.mmd`        | current                                            |
| `architecture/deployment.mmd`                 | current                                            |
| `billing/free-trial-lifecycle.mmd`            | current                                            |
| `billing/subscription-tier-resolution.mmd`    | current                                            |
| `billing/branch-addon-flow.mmd`               | current                                            |
| `billing/warehouse-addon-flow.mmd`            | current                                            |
| `billing/conversion-funnel.mmd`               | current                                            |
| `admin/admin-dashboard-tabs.mmd`              | current                                            |
| `admin/admin-tier-editing-validation.mmd`     | current                                            |
| `admin/impersonation-flow.mmd`                | current                                            |
| `admin/tenant-plan-overrides.mmd`             | current                                            |
| `restaurant/branch-creation-org-model.mmd`    | current (notes dual legacy models)                 |
| `restaurant/cart-checkout-flow.mmd`           | current                                            |
| `restaurant/quick-lists-flow.mmd`             | partial (Platinum AI quick_lists = catalog string) |
| `supplier/warehouse-fulfillment-model.mmd`    | current                                            |
| `supplier/product-catalog-flow.mmd`           | current                                            |
| `reservations/public-reservations-flow.mmd`   | current                                            |
| `reservations/reservation-availability.mmd`   | current                                            |
| `reservations/waitlist-flow.mmd`              | current                                            |
| `orders/order-lifecycle.mmd`                  | current                                            |
| `disputes/disputes-flow.mmd`                  | current                                            |
| `disputes/credit-note-flow.mmd`               | current                                            |
| `disputes/dispute-replacement-order-flow.mmd` | current                                            |
| `deals/deals-admin-approval-flow.mmd`         | current                                            |
| `rbac/rbac-permissions.mmd`                   | current                                            |
| `rbac/feature-flags-overrides.mmd`            | partial (Platinum catalog features labeled)        |
| `comms/chat-notifications-flow.mmd`           | partial (webhook catalog-only)                     |
| `qa/qa-automation-flow.mmd`                   | current                                            |

Index: [docs/diagrams/README.md](docs/diagrams/README.md)

---

## Outdated diagrams fixed

| Issue                                         | Fix                                                          |
| --------------------------------------------- | ------------------------------------------------------------ |
| Subscription flow missing trial/tiers/add-ons | Comment + nodes in `subscription_flow.mmd`                   |
| RBAC missing org billing + removed approvals  | `rbac_multitenancy.mmd`                                      |
| Reservation flow too shallow                  | `reservation_flow.mmd` + dedicated `reservations/*` diagrams |
| Recommendation implied wrong default tier     | `recommendation_flow.mmd`                                    |
| Impersonation unclear on nav scope            | `admin_impersonation_flow.mmd`                               |

---

## Contradictions found and fixed

| Finding                                           | Resolution                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| None of 21 blueprint files referenced Bronze tier | No change needed                                                    |
| None showed approvals_budgets as active           | Added explicit **removed** notes in RBAC diagrams only              |
| No diagram showed unlimited Platinum branches     | New branch-addon diagram uses Gold 2 / Platinum 3 + add-ons + 6 cap |
| Warehouses as accounts                            | All new warehouse diagrams state operational locations only         |

**Intentional `bronze` mention:** `subscription-tier-resolution.mmd` documents API alias `bronze → silver` (not user-facing Bronze tier).

**Intentional `approvals_budgets` mention:** `admin-tier-editing-validation.mmd` and `rbac-permissions.mmd` mark key as **rejected** on save (product removed).

---

## Grep check results

```text
grep -R "Bronze" . --include="*.mmd"     → 1 match: bronze→silver alias (justified)
grep -R "approvals_budgets|Approvals|Budgeting" . --include="*.mmd" → removed-feature guards only (justified)
grep -R "unlimited branches|10 branches|old tier" . --include="*.mmd" → 0 matches
grep -R "warehouse.*account|branch.*free subscription" . --include="*.mmd" → 0 false positives; diagrams state warehouses ≠ accounts
```

---

## Features still missing dedicated diagrams

| Feature                              | Notes                                                          |
| ------------------------------------ | -------------------------------------------------------------- |
| Staff scheduling / PTO / swap detail | Covered at high level in `system-context`; no sequence diagram |
| Invoice PDF / dunning                | `invoice_flow.mmd` covers status only                          |
| Smart reorder / AI forecast          | Catalog strings only on Platinum — not implemented flow        |
| Enterprise admin assignment UI       | Documented in tier matrix; no UI flow diagram                  |
| Restaurant onboarding wizard         | Referenced in feature overview only                            |
| Supplier deals boost checkout        | Out of scope per request (deals logic); approval diagram only  |
| `order_approvals` / budget DB tables | Deprecated schema; not shown as active                         |

---

## Diagrams marked partial / planned / deprecated

| Diagram                                          | Label                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `rbac/feature-flags-overrides.mmd`               | partial — Platinum webhook/white-label/read receipts/custom reports catalog-only |
| `comms/chat-notifications-flow.mmd`              | partial — same for notifications webhook                                         |
| `restaurant/quick-lists-flow.mmd`                | partial — `ai_smart_automation` catalog-only                                     |
| Legacy `branch` table in branch-creation diagram | honest partial — not used for org branch creation                                |
| `approvals_budgets` in validation diagram        | deprecated — must not be enabled                                                 |

---

## Mermaid validation results

**Command:** `pnpm run docs:diagrams:check`  
**Script:** `scripts/check-mermaid-diagrams.mjs` (lightweight: non-empty, diagram keyword, `docs/diagrams/` indexed in README)

**Mermaid CLI:** Not added as required dependency; render validation optional via `@mermaid-js/mermaid-cli` if installed locally.

---

## Validation / check command added

```json
"docs:diagrams:check": "node scripts/check-mermaid-diagrams.mjs"
```

---

## Links

- [docs/diagrams/README.md](docs/diagrams/README.md) — diagram index
- [MMD_DIAGRAM_AUDIT_REPORT.md](MMD_DIAGRAM_AUDIT_REPORT.md) — this file
