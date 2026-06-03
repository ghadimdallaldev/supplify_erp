# Documentation cleanup report

**Date:** 2026-06-03  
**Branch:** `dev`

## Old structure (summary)

- **137** markdown files across **18** top-level folders plus scattered **19** audit/report files at `docs/` root.
- Duplicate trees: `deployment/` vs ops docs, `monetization/` vs `product/`, `blueprint/` vs `diagrams/`.
- Many overlapping RBAC, performance, admin, and product inventory documents.
- Uppercase filenames and `*_AUDIT.md` at repo root and `docs/` root.

## New structure (summary)

```text
docs/
  README.md                    Hub index
  DOCS_CLEANUP_REPORT.md       This file

  product/                     Catalog, plans, subscriptions (from monetization/)
  features/                    Per-feature specs (kebab-case names)
  architecture/                RBAC, tenancy, hardening (kebab-case)
  operations/                  Deploy, env, performance, cron (from deployment/)
  security/                    rbac.md index + audit report
  admin/                       Admin guide, flags, operations console index
  qa/                          testing-guide, regression-checklist
  guides/                      Setup, handbook, migrations
  api/                         Route index
  diagrams/                    Canonical Mermaid (unchanged)
  sales/                       GTM narrative (unchanged)
  archive/
    audits/                    Historical audit reports
    old/                       Superseded plans, blueprint, merged feature docs
    legacy-ec2/                Legacy EC2 deploy
```

**Removed as top-level folders:** `deployment/` (→ `operations/`), `monetization/` (→ `product/`), `superpowers/` (→ `archive/old/`), `blueprint/` (→ `archive/old/blueprint/`).

## Files moved (high level)

| From                                           | To                                              |
| ---------------------------------------------- | ----------------------------------------------- |
| 15× `docs/*_AUDIT.md` (root)                   | `docs/archive/audits/*.md` (kebab-case)         |
| `docs/BRANCHING.md`                            | `docs/operations/branching.md`                  |
| `docs/CONTRACT_PRICING_FEATURE.md`             | `docs/features/contract-pricing.md`             |
| `docs/deployment/*`                            | `docs/operations/*`                             |
| `docs/monetization/*` (active)                 | `docs/product/*`                                |
| `docs/monetization/*` (proposals)              | `docs/archive/old/monetization-proposals/`      |
| `docs/superpowers/*`                           | `docs/archive/old/superpowers/`                 |
| `docs/blueprint/`                              | `docs/archive/old/blueprint/`                   |
| Admin/QA/architecture audits                   | `docs/archive/audits/`                          |
| `RAILWAY_GLOBAL_PERFORMANCE_REPORT.md` (prior) | `docs/operations/railway-performance-report.md` |

## Files merged

| Active doc                                                                     | Merged from                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [features/deals-and-promotions.md](./features/deals-and-promotions.md)         | `deals-boost-publishing-flow.md` (boost section)                           |
| [features/drivers-and-gps-tracking.md](./features/drivers-and-gps-tracking.md) | Feature flags + dispatch from `fulfillment-logistics.md` (detail archived) |
| [features/notifications-and-alerts.md](./features/notifications-and-alerts.md) | `notifications.md`, `email-notifications.md`, `push-notifications.md`      |
| [operations/railway-performance.md](./operations/railway-performance.md)       | Index over `railway-performance-report.md` + `performance-local-dev.md`    |
| [operations/deployment.md](./operations/deployment.md)                         | Former `deployment/README` + railway quick links                           |
| [security/rbac.md](./security/rbac.md)                                         | Index over architecture RBAC/tenancy docs                                  |
| [admin/admin-operations-console.md](./admin/admin-operations-console.md)       | Index over admin-panel-operations + admin-guide                            |
| [product/overview.md](./product/overview.md)                                   | Index over catalogs                                                        |
| [product/plans-and-limits.md](./product/plans-and-limits.md)                   | Index over subscriptions/tier docs                                         |

## Files archived (not deleted)

- All root `docs/*_AUDIT.md` reports → `archive/audits/`
- `fulfillment-logistics.md`, `deals-boost-publishing-flow.md` → `archive/old/`
- Superpowers plans/specs, tier proposals, demo scripts, launch polish
- Blueprint Mermaid tree (canonical diagrams remain in `diagrams/`)
- Full product capability dumps → `archive/old/restaurant-capabilities-full.md`, `supplier-capabilities-full.md`

## Files renamed (kebab-case sample)

| Old                                | New                                    |
| ---------------------------------- | -------------------------------------- |
| `QA_AUTOMATION_GUIDE.md`           | `qa/testing-guide.md`                  |
| `MANUAL_TEST_CHECKLIST.md`         | `qa/regression-checklist.md`           |
| `promotions-deals.md`              | `features/deals-and-promotions.md`     |
| `driver-delivery-current-state.md` | `features/drivers-and-gps-tracking.md` |
| `ADMIN.md`                         | `admin/admin-guide.md`                 |
| `SUBSCRIPTIONS.md`                 | `product/subscriptions.md`             |

(Full rename list: ~40 files — see `git log` / `git diff` on this commit.)

## Active docs created/updated

- `docs/README.md` — new hub
- Folder READMEs: `features/`, `operations/`, `security/`, `admin/`, `product/`, `archive/`
- `operations/email-system.md`, `operations/railway-performance.md`, `operations/deployment.md`
- `.cursor/rules/docs-and-branch-policy.mdc` — link examples updated

## Links updated

- Bulk replace across `docs/`, root `README.md`, `deploy/`, `.cursor/rules/`
- Fixed references to `deployment/`, `monetization/`, old audit paths, checklist names
- **Not changed:** `apps/` and `tests/` source (per cleanup scope); some test file comments may still cite old paths

## Validation

- `docs/` root: only `README.md` + this report (+ no stray audits)
- Grep pass for `docs/deployment/`, `docs/monetization/`, `docs/BRANCHING.md` in docs tree
- No automated link checker in repo; manual grep-based sweep performed

## Remaining cleanup (future)

1. ~~**Product deep dives**~~ — trimmed; full dumps in `archive/old/*-capabilities-full.md`.
2. ~~**Notifications merge**~~ — consolidated in [features/notifications-and-alerts.md](./features/notifications-and-alerts.md).
3. **Test comment links** — `tests/README.md` and `tests/COVERAGE.md` updated; optional pass on `tests/e2e/utils/constants.ts`.
4. **Diagrams vs archived blueprint** — finish migrating any blueprint-only diagrams to `diagrams/` if still referenced.
5. **Archive `approvals-budgets.md`** stub if feature removal is final.

## Follow-up (same cleanup pass)

- Trimmed [restaurant-capabilities.md](./product/restaurant-capabilities.md) and [supplier-capabilities.md](./product/supplier-capabilities.md) to index tables; archived full content under `archive/old/`.
- Merged notification docs into [notifications-and-alerts.md](./features/notifications-and-alerts.md).
- Updated [tests/README.md](../tests/README.md) and [tests/COVERAGE.md](../tests/COVERAGE.md) doc links.
