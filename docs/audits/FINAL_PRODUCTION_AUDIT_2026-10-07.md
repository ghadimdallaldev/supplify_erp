# Final production-readiness audit - 2026-10-07

## Executive summary

Scope was locked to the Supplify API and web application. Android and iOS were inspected only to verify upload-contract compatibility; neither native repository required a source change.

No confirmed P0 security, authentication-bypass, cross-tenant data-loss, or money-loss defect was found in the reviewed paths. Three P1 issues were confirmed and fixed:

1. several platform-admin mutations relied on the coarse `ADMIN` role without enforcing the documented admin permission matrix;
2. the scanner-outage upload path wrote a verdict rejected by the committed database constraint;
3. an omitted or zero upload size could obtain a max-size upload capability without reserving storage, and product attachment metadata trusted client fields.

The audit also repaired stale API test assumptions and isolated admin activity tests from live Redis state. The complete API suite, complete web suite, and root typecheck pass.

**Repository verdict:** code-level production gate passes for the fixes in this report. Production deployment is still conditional on applying migration `0227` and completing the live environment checks listed under residual risk. No commit or push was created.

## Scope and evidence

Reviewed evidence included:

- repository instructions in `AGENTS.md`, `CLAUDE.md`, and the mobile-parity rule;
- the July security, performance, cache, route-inventory, and cron audits as hypotheses;
- RBAC permission keys, role matrix, feature keys, route middleware, admin mutations, public/file upload boundaries, subscription and feature resolution, order detail and invoice job behavior;
- web admin permission gating and shared data-fetching behavior;
- current catalog, order-calendar, organization-billing, memory-cache, and cron invalidation/locking code.

This was a repository audit, not a deployed penetration test or load test. It did not run ZAP, inspect production secrets, apply migrations to a target database, or exercise external providers.

## Severity table

| ID      | Area                             | Severity | Evidence                                                                                                                                                                                         | Fix files                                                                                                        | Verification                                                                        |
| ------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| SEC-01  | Admin RBAC                       | P1       | Tenant creation and featured-placement mutations accepted any authenticated `ADMIN`, bypassing the seeded `ADMIN_TENANTS`, `ADMIN_GROWTH`, and `ADMIN_FINANCE` separation.                       | `restaurants.routes.js`, `suppliers/admin.js`, `suppliers/profile.js`, `AdminFeaturedPlacementsPanel.tsx`        | Permission-denial API tests, permission-aware web tests, full API/web suites        |
| REL-01  | Upload reliability / DB          | P1       | Runtime stored `file_security_scan.status = scan_unavailable`, while migration `0210` allowed only pending, clean, infected, or failed states. Scanner outage could fail after object promotion. | `0227_allow_scan_unavailable_file_status.sql`, migration regression test                                         | Migration contract test and upload-security service tests                           |
| COR-01  | Quota enforcement / upload trust | P1       | Omitted/zero `fileSize` skipped metering but created a 10 MiB session. Product attachment accepted client size/type/metering metadata after ownership validation.                                | `storage-upload.js`, `files.routes.js`, `orders-driver.routes.js`, `upload-security.service.js`                  | Reservation unit tests, POD route regression, upload-security tests, full API suite |
| PERF-01 | Web order detail                 | P2       | `OrderDetailPage` subscribed to order tracking but never consumed the result, adding an avoidable request on supplier detail loads.                                                              | `OrderDetailPage.tsx`                                                                                            | Web typecheck, lint, and full web suite                                             |
| QA-01   | Regression reliability           | P2       | Full API execution exposed stale query-sequence/count assertions and admin activity tests that could read a live Redis value.                                                                    | `subscription.test.js`, `invoice-overdue.job.test.js`, `orders.routes.test.js`, `admin-dashboard.routes.test.js` | Four repaired suites pass 90/90; admin suite passes 42/42; full API suite exits 0   |

## Fixed

### SEC-01 - enforce fine-grained platform-admin permissions

- `POST /api/restaurants` and `POST /api/suppliers` now resolve admin context and require `ADMIN_TENANTS`.
- Featured-placement approve/reject operations require `ADMIN_GROWTH`.
- Explicit placement refunds require `ADMIN_FINANCE`.
- Placement listing is limited to growth or finance admins.
- The web panel returns no content without either permission and exposes review/refund actions only to the matching permission.

This preserves the existing permission-key set and seeded role matrix; no new permission or response type was introduced.

### REL-01 - align the scanner-outage runtime state with PostgreSQL

Migration `0227_allow_scan_unavailable_file_status.sql` replaces the existing check constraint using a `NOT VALID` add followed by validation. It adds only the already implemented `scan_unavailable` state and does not modify committed migration `0210`.

**Deployment requirement:** apply `0227` before deploying the API build. Deploying the runtime first can leave the degraded upload path failing after storage promotion.

### COR-01 - make upload quota reservation fail closed

- Generic and POD presign routes reserve the declared positive byte size or the full 10 MiB session maximum when size is omitted/zero.
- The upload session and quota reservation use the same ceiling.
- Negative or non-integer generic sizes are rejected.
- Product attachments accept only the authenticated user's `uploads/{userId}/...` namespace.
- Attachment MIME and reserved bytes come from the completed server-side session, not request-body claims.

Request paths and response shapes are unchanged. Web, Android, and iOS already send actual byte sizes on their supported upload paths.

### QA-01 - restore deterministic regression coverage

- Subscription bootstrap tests now model live, commercial-grace, and post-create reads.
- Invoice-overdue tests model organization billing resolution and the second lock check.
- Order-detail tests model all parallel auxiliary queries.
- Global feature tests include the platform-only `mobile_public_shop`.
- Admin activity tests mock the cache boundary, preventing local or CI Redis contents from bypassing the builder assertion.

### PERF-01 - remove an unused order-tracking request

`OrderDetailPage` no longer starts `useGetOrderTrackingQuery` when the returned data is not rendered or passed to a child. Tracking remains owned by the dedicated delivery/tracking surfaces, avoiding a redundant request on supplier order-detail loads. An unrelated unused translation hook was also removed from the supplier featured-placement panel to restore the zero-warning web lint gate.

## Performance and cache re-verification

The older cache audit was treated as a hypothesis. Its highest-risk application gaps are no longer present:

- catalog category/tag mutations call `invalidateCatalogMetaCache`;
- order creation, status changes, and invoice changes schedule tenant-scoped calendar invalidation;
- organization billing changes call `invalidateOrgBillingTenantCache`;
- notification list invalidation uses prefix deletion;
- the memory fallback is capped at 500 entries;
- cron execution uses an in-process guard plus PostgreSQL advisory locks.

Beyond PERF-01, no additional performance code change was justified without deployed measurements. Current residual performance work is observational: record p50/p95/p99 latency, database time, cache hit rate, event-loop delay, and memory under representative production load before increasing traffic.

## Verification

Passed:

- `pnpm typecheck`
- `pnpm lint` (exit 0; web has zero warnings, API retains its existing warning backlog)
- focused API audit suite: 7 files / 39 tests
- focused upload boundary suite: 3 files / 15 tests
- repaired API suites: 4 files / 90 tests
- isolated admin dashboard suite: 1 file / 42 tests
- complete `pnpm test:api`
- complete `pnpm test:web`: 144 files / 560 tests
- focused admin web permission suite: 1 file / 3 tests

The web suite emits existing jsdom navigation warnings and a stale `baseline-browser-mapping` data notice; neither failed the suite. API lint exits successfully with existing warnings because that package does not enforce a zero-warning ceiling; this audit did not attempt a broad lint refactor.

## Mobile parity decision

No native source was changed.

- Admin fixes are platform-admin only; native clients have no platform-admin surface.
- Migration `0227` is database/runtime alignment.
- Upload request/response shapes, paths, auth, feature keys, permission keys, and notification payloads are unchanged.
- Android and iOS both send `file.size` for generic attachments and `prepared.bytes` for POD presign after reading local bytes.

The dated decision is recorded in `docs/mobile/MOBILE_FEATURE_PARITY.md`.

## Remaining and deferred

| Item                                                                     | Status                                                 | Reason / next action                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Apply `0227`                                                             | Required before deploy                                 | Repository tests cannot change or prove a target production database.                                                                  |
| Confirm prior production migrations, including identity hardening `0193` | Required deployment check                              | The July audit left target-database application as an external gate.                                                                   |
| Probe `/health` and public web URLs after deployment                     | Required deployment check                              | A passing build does not prove API, storage, Redis, Keycloak, or web reachability.                                                     |
| Live Redis limiter and invalidation checks                               | Required pre-launch                                    | Verify shared Redis, 429 behavior, cross-replica invalidation, and failover logs.                                                      |
| ClamAV and private S3 checks                                             | Required pre-launch                                    | Verify startup health, scanner outage behavior, bucket privacy, upload/read, and object cleanup against the deployed providers.        |
| Keycloak/OIDC checks                                                     | Required pre-launch                                    | Verify issuer, callback/logout, cookie policy, and the configured Keycloak port 8180 in the target environment.                        |
| p95/load profiling                                                       | Deferred to deployed environment                       | Repository inspection cannot establish production latency or capacity.                                                                 |
| Dynamic security scan and dependency registry audit                      | Deferred / requires explicit external-network approval | Run against an authorized environment and review findings before broad public exposure.                                                |
| Full 640-route live authorization matrix                                 | Deferred to integration environment                    | Static and unit coverage were reviewed, but this session did not replay every inventory route against real identities and tenant data. |

## Residual launch risk

The highest residual risk is deployment drift: an unapplied migration, incorrect Redis/S3/ClamAV/Keycloak configuration, or an unprobed release can invalidate repository-level confidence. Launch should remain blocked until `0227` is applied, health and public URLs are probed separately, representative admin/upload/order smoke tests pass in preprod, and the release follows `dev -> preprod -> prod`.

There are no known unfixed P0 findings from this audit. The remaining items above are explicit environment-validation or breadth-of-testing gates, not claims that the underlying behavior has been proven in production.
