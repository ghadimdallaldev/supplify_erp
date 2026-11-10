# Supplify documentation

Restaurant & F&B supplier marketplace monorepo (`apps/api`, `apps/web`).

**Policy:** Documentation lives on **`dev` only**. Release branches (`staging`, `preprod`, `prod`) contain runtime code — no `docs/`.

## Start here

- Set up locally: [guides/setup.md](./guides/setup.md), then [guides/developer-handbook.md](./guides/developer-handbook.md)
- Understand the product: [product/overview.md](./product/overview.md)
- Run tests / QA: [guides/qa/testing-guide.md](./guides/qa/testing-guide.md)
- Deploy: [operations/deployment.md](./operations/deployment.md) and [operations/environment-variables.md](./operations/environment-variables.md)
- Onboard a new person: [onboarding/README.md](./onboarding/README.md)

## Index

| Area                             | What it holds                                                         | Key links                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [architecture/](./architecture/) | System design: RBAC, tenancy, routing, API index, Mermaid diagrams    | [rbac-overview](./architecture/rbac-overview.md) · [tenancy](./architecture/tenancy.md) · [api-routes](./architecture/api-routes.md) · [diagrams](./architecture/diagrams/README.md)                                                                   |
| [features/](./features/)         | One spec per feature (ordering, GPS, deals, recipe costing, ...)      | [features/README](./features/README.md)                                                                                                                                                                                                                |
| [operations/](./operations/)     | Deploy, env vars, Railway, cron, storage, observability, runbooks     | [deployment](./operations/deployment.md) · [environment-variables](./operations/environment-variables.md) · [railway-environments](./operations/railway-environments.md) · [branching](./operations/branching.md) · [runbooks](./operations/runbooks/) |
| [guides/](./guides/)             | Developer how-tos, QA, and UI conventions                             | [setup](./guides/setup.md) · [database-migrations](./guides/database-migrations.md) · [qa/](./guides/qa/) · [ui/](./guides/ui/)                                                                                                                        |
| [mobile/](./mobile/)             | Mobile parity log, parity checklist, store readiness                  | [MOBILE_FEATURE_PARITY](./mobile/MOBILE_FEATURE_PARITY.md) · [MOBILE_PARITY_CHECKLIST](./mobile/MOBILE_PARITY_CHECKLIST.md)                                                                                                                            |
| [admin/](./admin/)               | Admin console, feature flags                                          | [admin-guide](./admin/admin-guide.md) · [feature-flags](./admin/feature-flags.md)                                                                                                                                                                      |
| [security/](./security/)         | RBAC matrices, hardening, security baseline and audits                | [security/README](./security/README.md) · [rbac-permission-matrix](./security/rbac-permission-matrix.md) · [hardening](./security/hardening.md)                                                                                                        |
| [product/](./product/)           | Plans and pricing, feature catalogs, capabilities, strategy, sales    | [product/README](./product/README.md) · [four-plan-pricing-model](./product/four-plan-pricing-model.md) · [strategy/](./product/strategy/) · [sales/](./product/sales/)                                                                                |
| [audits/](./audits/)             | Current-state audits and script-generated outputs                     | [audits/README](./audits/README.md) · [latest production audit](./audits/FINAL_PRODUCTION_AUDIT_2026-10-22.md)                                                                                                                                         |
| [onboarding/](./onboarding/)     | Onboarding library, generated handbook/PDF/PPTX, printable guides     | [onboarding/README](./onboarding/README.md) · [GENERATION](./onboarding/GENERATION.md) · [printable/](./onboarding/printable/)                                                                                                                         |
| [archive/](./archive/)           | Historical audits, plans, reports, releases (not deployed or checked) | [archive/README](./archive/README.md)                                                                                                                                                                                                                  |

## Conventions

- File names are lowercase kebab-case. UPPERCASE is kept only for existing parity and audit files that agent docs cite.
- New dated one-off reports go straight to `archive/audits/` or are named `YYYY-MM-DD-*`.
- Generated files and the command that regenerates them:
  - `onboarding/output/*`, `onboarding/Supplify-Complete-Handbook.md`: `pnpm docs:onboarding:all` (see [onboarding/GENERATION.md](./onboarding/GENERATION.md)); intermediate `.html` is gitignored
  - `guides/qa/output/*`: `pnpm docs:qa:pdf`
  - `audits/route-inventory.json`, `audits/DEV_API_ROUTE_TEST_*`, `audits/dev-api-*`, `audits/performance/perf-*`: API and perf scripts under `apps/api/scripts/` and `scripts/`
  - Mermaid index check: `pnpm docs:diagrams:check`
- `archive/` is Prettier-ignored and not link-checked; links inside it may point at files that no longer exist.
- Repo root holds only `README.md`, `CLAUDE.md`, `AGENTS.md` and `PRODUCT.md`. All other markdown goes under `docs/`.
