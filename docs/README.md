# Documentation hub

Supplify docs are grouped by purpose. Start with **[Developer handbook](./guides/developer-handbook.md)** for setup, scripts, and architecture overview.

| Folder                               | Contents                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[guides/](./guides/)**             | Setup, usage, DB migrations, prod-like seed, **manual testing**, long-form developer handbook                                                                       |
| **[product/](./product/)**           | Feature routes & verification, technical feature catalog, tenant capabilities, finance & notifications                                                              |
| **[features/](./features/)**         | Per-feature specs (orders, reservations, notifications, disputes, …)                                                                                                |
| **[architecture/](./architecture/)** | Security, hardening, tenancy, RBAC, [audit report](./architecture/RBAC_AUDIT_REPORT.md), [permission matrix](./architecture/RBAC_PERMISSION_MATRIX.md), admin audit |
| **[qa/](./qa/)**                     | Manual test checklists, [RBAC hardening QA](./qa/RBAC_HARDENING_QA_REPORT.md)                                                                                       |
| **[admin/](./admin/)**               | Admin UI, dashboard status, feature flags, setup notes                                                                                                              |
| **[monetization/](./monetization/)** | Subscriptions, plans, enterprise, monetization UX, role roadmap                                                                                                     |
| **[operations/](./operations/)**     | **Production readiness** (merged), launch polish, performance, observability, test coverage                                                                         |
| **[sales/](./sales/)**               | Positioning, pricing, enterprise checklist                                                                                                                          |
| **[blueprint/](./blueprint/)**       | Diagrams (Mermaid), workflows, UI sitemaps                                                                                                                          |
| **[superpowers/](./superpowers/)**   | Dated specs & plans (design sessions)                                                                                                                               |
| **[design/](./design/)**             | Static design artifacts (e.g. logo concepts HTML)                                                                                                                   |

## Quick links

- [Developer handbook](./guides/developer-handbook.md) — quick start, Docker, CI/CD, contributing
- **[Complete feature catalog](./product/ALL_FEATURES.md)** — master list for MVP (routes, API, jobs, flags)
- [Feature overview & routes](./product/features.md) — verification commands & smoke tests
- [Feature catalog (technical)](./product/FEATURE_CATALOG.md) — keys, enforcement, surfaces
- [Release branching](./BRANCHING.md) — `dev` → `preprod` → `prod` (prod never merges dev)
- [Manual testing checklist](./guides/manual-testing.md) · [Full QA regression](./qa/MANUAL_TEST_CHECKLIST.md)
- [Feature specs index](./features/README.md) · [Order decline](./features/order-decline.md) · [Notifications delivery](./features/notifications-delivery.md)
- [Production readiness](./operations/production-readiness.md) — status + findings + fix plan
- [Database migrations](./guides/database-migrations.md)
- [RBAC audit report](./architecture/RBAC_AUDIT_REPORT.md) · [RBAC QA checklist](./qa/RBAC_HARDENING_QA_REPORT.md)
- [Subscriptions & limits](./monetization/SUBSCRIPTIONS.md)
- [Deploy](../deploy/README.md) · [Tests](../tests/README.md)
