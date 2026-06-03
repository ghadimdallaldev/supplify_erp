# Supplify documentation

Restaurant & F&B supplier marketplace monorepo (`apps/api`, `apps/web`).

**Policy:** Documentation lives on **`dev` only**. Release branches (`staging`, `preprod`, `prod`) contain runtime code — no `docs/`.

## Quick links

| I want to…                    | Start here                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Set up locally                | [guides/setup.md](./guides/setup.md) · [guides/developer-handbook.md](./guides/developer-handbook.md)             |
| Understand the product        | [product/overview.md](./product/overview.md)                                                                      |
| Plans & limits                | [product/plans-and-limits.md](./product/plans-and-limits.md)                                                      |
| Feature behavior              | [features/README.md](./features/README.md)                                                                        |
| Deploy to Railway             | [operations/deployment.md](./operations/deployment.md)                                                            |
| Env variables                 | [operations/environment-variables.md](./operations/environment-variables.md)                                      |
| Performance / Railway latency | [operations/railway-performance.md](./operations/railway-performance.md)                                          |
| RBAC & security               | [security/rbac.md](./security/rbac.md) · [security/security-audit-report.md](./security/security-audit-report.md) |
| Admin console                 | [admin/admin-operations-console.md](./admin/admin-operations-console.md)                                          |
| Run tests / QA                | [qa/testing-guide.md](./qa/testing-guide.md) · [qa/regression-checklist.md](./qa/regression-checklist.md)         |
| Release workflow              | [operations/branching.md](./operations/branching.md)                                                              |
| Historical audits             | [archive/audits/](./archive/audits/)                                                                              |

## Folder map

```text
docs/
  README.md                 ← you are here
  product/                  Product catalog, plans, monetization
  features/                 Per-feature specs (ordering, GPS, deals, …)
  architecture/             RBAC, tenancy, hardening, access control
  operations/               Deploy, env, performance, cron, storage
  security/                 RBAC index, security audits
  admin/                    Admin guide, flags, operations console
  qa/                       Testing guide, regression checklist
  guides/                   Setup, handbook, migrations, seeding
  api/                      API route index
  diagrams/                 Canonical Mermaid diagrams
  sales/                    Sales / enterprise narrative
  archive/                  Historical audits, old plans, legacy EC2
```

## Repo root

Only **`README.md`** belongs at the repository root. All other markdown goes under `docs/`.
