# Supplify Onboarding Documentation

**Purpose:** End-to-end onboarding library for Supplify — the restaurant–supplier marketplace and operations platform. These documents translate product behavior, technical architecture, subscriptions, RBAC, and implementation evidence into formats usable by executives, sales, customer success, support, and engineering.

**Policy:** Documentation lives on the `dev` branch only (see root `docs/README.md`). Runtime release branches carry application code without this folder.

**Evidence standard:** Claims in numbered guides should trace to repository paths listed in [20-source-evidence-index.md](./20-source-evidence-index.md). **Current plan names, prices, and commercial matrices** are authoritative in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) covers enforcement architecture (entitlements, 402/403). Role permissions remain authoritative in [09-authentication-rbac.md](./09-authentication-rbac.md).

---

## Document index

| #   | File                                                                   | Purpose                                                                                                                                     |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [01-executive-overview.md](./01-executive-overview.md)                 | What Supplify is, personas, value props, ecosystem map, high-level architecture — for executives and partners                               |
| 02  | [02-complete-product-guide.md](./02-complete-product-guide.md)         | Feature-by-feature product reference: UI routes, APIs, plan gates, known limitations                                                        |
| 03  | [03-supplier-onboarding.md](./03-supplier-onboarding.md)               | Step-by-step supplier tenant onboarding from registration through catalog, fulfillment, and billing                                         |
| 04  | [04-restaurant-onboarding.md](./04-restaurant-onboarding.md)           | Step-by-step restaurant tenant onboarding: procurement, receiving, branches, finance                                                        |
| 05  | [05-driver-onboarding.md](./05-driver-onboarding.md)                   | Driver role setup, deliveries board, routes, GPS, proof of delivery, troubleshooting                                                        |
| 06  | [06-admin-onboarding.md](./06-admin-onboarding.md)                     | Platform admin: tenants, subscriptions, impersonation, feature flags, audit                                                                 |
| 07  | [07-technical-architecture.md](./07-technical-architecture.md)         | Stack, middleware pipeline, Redis, sessions, deployment topology                                                                            |
| 08  | [08-database-guide.md](./08-database-guide.md)                         | Schema domains, key tables, migrations, tenant isolation                                                                                    |
| 09  | [09-authentication-rbac.md](./09-authentication-rbac.md)               | Keycloak OIDC, 52 permissions, restaurant/supplier/admin roles, impersonation, staff portal                                                 |
| 10  | [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md)       | Enforcement architecture (entitlements, 402/403); commercial matrices → [four-plan-pricing-model.md](../product/four-plan-pricing-model.md) |
| 11  | [11-api-and-workflow-reference.md](./11-api-and-workflow-reference.md) | API pipeline, route inventory summary, workflow diagrams, envelope format                                                                   |
| 17  | [17-glossary.md](./17-glossary.md)                                     | Definitions: tenant, workspace, RBAC, entitlement, warehouse, amendment, PWA, etc.                                                          |
| 18  | [18-frequently-asked-questions.md](./18-frequently-asked-questions.md) | FAQs for sales, support, onboarding, developers — grounded in plans and RBAC                                                                |
| 19  | [19-onboarding-checklists.md](./19-onboarding-checklists.md)           | Twelve printable checklists: prep, live sessions, go-live, hypercare, deployment                                                            |
| 20  | [20-source-evidence-index.md](./20-source-evidence-index.md)           | Traceability table: doc claim → repo path → symbol/route → verification status                                                              |

### Customer & sales outputs (`output/`)

| File                                                                                                   | Audience                   | Use                                                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------- |
| [output/Supplify-Customer-Presentation.pdf](./output/Supplify-Customer-Presentation.pdf)               | **Prospects & customers**  | Premium leave-behind — story, visuals, plans (no technical internals) |
| [output/Supplify-Customer-Presentation.pptx](./output/Supplify-Customer-Presentation.pptx)             | **Live customer meetings** | **Best for presenting** — 18 slides, speaker notes, caramel branding  |
| [output/Supplify-Onboarding-and-Product-Demo.pptx](./output/Supplify-Onboarding-and-Product-Demo.pptx) | Internal / deep demo       | Extended deck with ops & admin (38 slides)                            |
| [output/Supplify-Complete-Handbook.pdf](./output/Supplify-Complete-Handbook.pdf)                       | **Internal staff**         | Full reference — too detailed for customer emails                     |

Source: [Supplify-Customer-Presentation.md](./Supplify-Customer-Presentation.md) · Regenerate: `pnpm docs:onboarding:customer` (PDF + PPTX)

### Supporting artifacts

| Path                                                                             | Purpose                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [\_artifacts/bootstrap-metrics.md](./_artifacts/bootstrap-metrics.md)            | Generated counts (routes, migrations, roles) used when bootstrapping docs |
| [../audits/route-inventory.json](../audits/route-inventory.json)                 | Machine-readable API route catalog (554 routes)                           |
| [../audits/DEV_API_ROUTE_TEST_MATRIX.md](../audits/DEV_API_ROUTE_TEST_MATRIX.md) | QA matrix aligned to route inventory                                      |

---

## Recommended reading order by audience

### Executives & product leadership

Goal: Understand market positioning, scope, and monetization in under an hour.

1. [01-executive-overview.md](./01-executive-overview.md)
2. [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) — plan tiers and upgrade logic only
3. [17-glossary.md](./17-glossary.md) — skim platform terms
4. [02-complete-product-guide.md](./02-complete-product-guide.md) — reference as needed

### Sales & solution consultants

Goal: Quote correctly, demo confidently, handle objections on plans and roles.

1. [01-executive-overview.md](./01-executive-overview.md)
2. [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) — **full** feature × plan matrices
3. [18-frequently-asked-questions.md](./18-frequently-asked-questions.md) — sales section first
4. [17-glossary.md](./17-glossary.md)
5. [02-complete-product-guide.md](./02-complete-product-guide.md) — feature depth for RFPs
6. [19-onboarding-checklists.md](./19-onboarding-checklists.md) — checklist **12** (demo env prep)

### Customer success & onboarding specialists

Goal: Run supplier/restaurant go-lives with repeatable checklists.

1. [19-onboarding-checklists.md](./19-onboarding-checklists.md) — all twelve checklists
2. [03-supplier-onboarding.md](./03-supplier-onboarding.md) **or** [04-restaurant-onboarding.md](./04-restaurant-onboarding.md) — by tenant type
3. [05-driver-onboarding.md](./05-driver-onboarding.md) — when supplier uses Gold+ drivers
4. [18-frequently-asked-questions.md](./18-frequently-asked-questions.md) — support/onboarding sections
5. [09-authentication-rbac.md](./09-authentication-rbac.md) — team roles and invites
6. [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) — limits to set expectations
7. [17-glossary.md](./17-glossary.md) — shared vocabulary with customer

### Customer support (L1/L2)

Goal: Resolve activation, permission, and plan-gate tickets without engineering.

1. [18-frequently-asked-questions.md](./18-frequently-asked-questions.md) — **full document**
2. [17-glossary.md](./17-glossary.md) — terminology
3. [09-authentication-rbac.md](./09-authentication-rbac.md) — permission vs feature; impersonation rules
4. [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) — 402 vs 403 vs billing lock table
5. [06-admin-onboarding.md](./06-admin-onboarding.md) — when escalating to admin tools
6. [20-source-evidence-index.md](./20-source-evidence-index.md) — locate implementation for edge cases

### Platform administrators & internal ops

Goal: Operate tenants, billing overrides, impersonation, and health monitoring.

1. [06-admin-onboarding.md](./06-admin-onboarding.md)
2. [09-authentication-rbac.md](./09-authentication-rbac.md) — admin permissions section
3. [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) — overrides and lifecycle
4. [19-onboarding-checklists.md](./19-onboarding-checklists.md) — checklists **6**, **7**, **11**
5. [07-technical-architecture.md](./07-technical-architecture.md)
6. [08-database-guide.md](./08-database-guide.md)

### Developers & implementation engineers

Goal: Integrate, deploy, extend APIs, and verify behavior against source.

1. [07-technical-architecture.md](./07-technical-architecture.md)
2. [11-api-and-workflow-reference.md](./11-api-and-workflow-reference.md)
3. [09-authentication-rbac.md](./09-authentication-rbac.md)
4. [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md)
5. [08-database-guide.md](./08-database-guide.md)
6. [20-source-evidence-index.md](./20-source-evidence-index.md) — traceability
7. [17-glossary.md](./17-glossary.md)
8. Persona guides [03](./03-supplier-onboarding.md)–[06](./06-admin-onboarding.md) — acceptance criteria for flows
9. [19-onboarding-checklists.md](./19-onboarding-checklists.md) — checklists **10**, **11** (deploy + validation)

### QA & demo certification

Goal: Validate environments before sales or go-live.

1. [19-onboarding-checklists.md](./19-onboarding-checklists.md) — checklists **11**, **12**
2. [20-source-evidence-index.md](./20-source-evidence-index.md)
3. [11-api-and-workflow-reference.md](./11-api-and-workflow-reference.md)
4. [../audits/route-inventory.json](../audits/route-inventory.json)
5. [../audits/DEV_API_ROUTE_TEST_MATRIX.md](../audits/DEV_API_ROUTE_TEST_MATRIX.md)

---

## Suggested learning paths by scenario

| Scenario                         | Path                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| **New hire week 1**              | 01 → 17 → 09 → 10 → persona guide matching team (03 or 04)                                       |
| **Supplier go-live this week**   | 19 checklists 1–2 → 03 → 18 FAQ supplier sections                                                |
| **Restaurant go-live this week** | 19 checklists 3–4 → 04 → 18 FAQ restaurant sections                                              |
| **Production deploy**            | 19 checklists 10–11 → 07 → `docs/operations/railway.md`                                          |
| **Security / compliance review** | 09 → 10 (billing lock) → 20 (impersonation, DPA rows) → `docs/architecture/security-baseline.md` |
| **Mobile parity change**         | 11 → `docs/mobile/MOBILE_PARITY_CHECKLIST.md` → 20                                               |

---

## Conventions used across guides

- **Routes** — Web paths like `/app/orders`; API paths like `GET /api/orders`.
- **Plan keys** — snake_case feature/limit keys from `feature-keys.js` and `limit-resolution.js`.
- **Permissions** — SCREAMING_SNAKE_CASE from `permission-keys.js`.
- **Roles** — Display names (Owner, Restaurant Manager) map to `role-matrix.js` codes.
- **Errors** — `402` billing lock; `403` permission or plan gate (`FEATURE_NOT_AVAILABLE`, `LIMIT_EXCEEDED`).

---

## Maintaining this library

When product behavior changes:

1. Update the numbered guide (02–11, 17–20) affected by the change.
2. Add or update rows in [20-source-evidence-index.md](./20-source-evidence-index.md).
3. Regenerate [route-inventory.json](../audits/route-inventory.json) if API surface changed.
4. Refresh [\_artifacts/bootstrap-metrics.md](./_artifacts/bootstrap-metrics.md) if counts are cited in 01 or README.

---

## External references

| Topic                      | Location                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| Product marketing overview | `docs/product/overview.md`                                        |
| Feature list (compact)     | `docs/product/features.md`                                        |
| RBAC architecture          | `docs/architecture/rbac-overview.md`, `rbac-permission-matrix.md` |
| Access control layers      | `docs/architecture/access-control.md`                             |
| Admin impersonation        | `docs/features/admin-impersonation.md`                            |
| Inventory & reorder        | `docs/features/inventory-expiry-and-reorder.md`                   |
| Mobile parity              | `docs/mobile/MOBILE_FEATURE_PARITY.md`                            |
