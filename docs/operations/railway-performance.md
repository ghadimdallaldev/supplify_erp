# Railway & API performance

Active reference for production latency, indexing, and the 2026-06-03 Railway hotfix.

## Production (Railway)

| Topic                                    | Document                                                         |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Root-cause analysis & fixes              | [railway-performance-report.md](./railway-performance-report.md) |
| Environment variables (pool, GPS, Redis) | [environment-variables.md](./environment-variables.md)           |
| Dev / preprod / prod setup               | [railway-environments.md](./railway-environments.md)             |

**Summary:** Warm DB pool (`min: 2`), skip RBAC setup on hot path, lean billing lock check, notification polling dedup, disputes pagination, migration `0138_performance_indexes.sql`.

Historical audits: [performance-audit.md](../archive/audits/performance-audit.md), [performance-security-audit-2026-05.md](../archive/audits/performance-security-audit-2026-05.md).

## Local dev & indexes

See [performance-local-dev.md](./performance-local-dev.md) for startup optimizations, Docker Postgres port, and index migrations.

## Cron & retention

GPS ping retention: [cron-jobs.md](./cron-jobs.md) (`driver_location_retention`).
