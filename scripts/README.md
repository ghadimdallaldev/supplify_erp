# Repository scripts

Dev orchestration, release promotion, Railway secret sync, and onboarding doc generation. API-specific scripts live in [`apps/api/scripts/`](../apps/api/scripts/README.md).

## Local development

| Script                                    | npm command                                    | Purpose                                        |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `dev-native.mjs`                          | `pnpm dev`, `pnpm local:dev`                   | Native API + web without full Docker app stack |
| `dev-apps.mjs`                            | `pnpm dev:apps`                                | Start API and web only                         |
| `dev-infra.mjs`                           | `pnpm local:infra`                             | Postgres, Redis, Keycloak, MinIO via Docker    |
| `run-local.mjs` (+ `.sh`, `.ps1`, `.cmd`) | `pnpm local:up`, `local:down`, `local:seed`, … | Full Docker compose stack                      |
| `ensure-native-env.mjs`                   | (via `dev-native.mjs`)                         | Copy/sync env files for native dev             |
| `ensure-docker-env.mjs`                   | (via `run-local.mjs`)                          | Ensure `docker/.env` exists                    |
| `lib/*`                                   | —                                              | Shared helpers for env URLs, pnpm, Docker      |

## Tooling & CI

| Script                       | npm command                      | Purpose                        |
| ---------------------------- | -------------------------------- | ------------------------------ |
| `pnpm-run.mjs`               | (internal)                       | Run pnpm in workspace packages |
| `ensure-pnpm.mjs`            | `pnpm setup`                     | Bootstrap pnpm                 |
| `check-mermaid-diagrams.mjs` | `pnpm docs:diagrams:check`       | Validate Mermaid in docs       |
| `migrate-users-to-roles.js`  | `pnpm db:migrate-users-to-roles` | Thin delegate to API script    |

## Release & deploy

| Script                      | npm command                            | Purpose                                 |
| --------------------------- | -------------------------------------- | --------------------------------------- |
| `promote-release.mjs`       | `pnpm promote:preprod`, `promote:prod` | Cut release branches                    |
| `prune-release-tree.mjs`    | (via promote)                          | Strip dev-only files from release trees |
| `railway-sync-keycloak.mjs` | `pnpm railway:keycloak:sync`           | Sync Keycloak secrets to Railway        |
| `railway-sync-vapid.mjs`    | `pnpm railway:vapid:sync`              | Sync VAPID keys to Railway              |
| `import-keycloak-realm.mjs` | `pnpm keycloak:realm:import`           | Import realm JSON locally               |
| `generate-vapid-keys.mjs`   | `pnpm vapid:generate`                  | Generate Web Push VAPID keys            |

## Onboarding docs

| Script                                    | npm command                          | Purpose                          |
| ----------------------------------------- | ------------------------------------ | -------------------------------- |
| `generate-all-onboarding-docs.mjs`        | `pnpm docs:onboarding:all`           | Handbook + PDF + PPTX            |
| `generate-onboarding-pdf.mjs`             | `pnpm docs:onboarding:pdf`           | Handbook PDF                     |
| `generate-onboarding-pptx.mjs`            | `pnpm docs:onboarding:pptx`          | Internal demo deck               |
| `generate-customer-presentation-pdf.mjs`  | `pnpm docs:onboarding:customer-pdf`  | Customer leave-behind PDF        |
| `generate-customer-presentation-pptx.mjs` | `pnpm docs:onboarding:customer-pptx` | Customer meeting deck            |
| `onboarding/md-to-html.mjs`               | (internal)                           | Markdown → HTML for PDF pipeline |
| `onboarding/build-customer-html.mjs`      | (internal)                           | Customer presentation HTML       |
| `onboarding/customer-brand.mjs`           | (internal)                           | Shared branding constants        |

See [`docs/onboarding/GENERATION.md`](../docs/onboarding/GENERATION.md) for the full pipeline.

## Diagnostics (optional)

| Script                      | npm command            | Purpose                    |
| --------------------------- | ---------------------- | -------------------------- |
| `measure-memory.mjs`        | `pnpm memory:measure`  | Local memory profiling     |
| `memory-prod-api-smoke.mjs` | `pnpm memory:prod-api` | Prod-like API memory smoke |

## Archived one-offs

Historical monolith-split tooling and superseded scripts: [`docs/archive/scripts/one-off/`](../docs/archive/scripts/one-off/README.md). Do not run on the current tree.

Full audit: [`docs/operations/scripts-audit.md`](../docs/operations/scripts-audit.md).
