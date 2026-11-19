# Performance / security / readiness audit — 2026-11-19

Branch `audit/perf-security-readiness-2026-11-19` (from dev `08cf6461`). Method: four read-only
code audits, then each finding re-verified in the code before any change. **Nothing here was
load-tested or profiled; no latency numbers are claimed.** Not a complete sweep: files listed under
"Not reviewed" were not read.

## Fixed in this branch (unit-tested; see test names)

| Sev | Finding                                                                                                                                    | Fix                                                                                                                     | Test                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P1  | Any user with `STAFF_INVITE` could enrol an arbitrary user UUID into their workspace via `POST /api/roles/users/:userId/assign`            | `assertTargetUserBelongsToTenant` (role row / active membership; contact_email deliberately excluded); 404              | `rbac-guards.membership.test.js`, `tenant-roles.routes.test.js`                  |
| P1  | Warehouse OUT adjustment read availability without a lock; upsert clamps with `GREATEST(0,…)` → silent over-draw vs concurrent reservation | `FOR UPDATE` on target row before the check                                                                             | existing stock tests updated. **Not verified under real concurrent connections** |
| P1  | ClamAV timeout / invalid reply stored the file unscanned in preprod/prod                                                                   | per-file `inconclusive` errors rejected when hosted; clamd-unreachable still degrades (documented driver-POD behaviour) | `upload-security.service.test.js`                                                |
| P2  | POD key only checked for user ownership, not order                                                                                         | prefix must be `uploads/<user>/pod/<orderId>/`                                                                          | none added (route-level)                                                         |
| P2  | Unordered `FOR UPDATE … ANY()` → possible deadlocks                                                                                        | `ORDER BY product_id`                                                                                                   | none (SQL text change)                                                           |
| P2  | `driver_assignment`/`driver` (wrong table names) in notification + socket authz → 500 for driver-only users                                | plural names                                                                                                            | none added                                                                       |
| P2  | Logout skipped refresh revoke if access revoke threw                                                                                       | independent try/catch                                                                                                   | none added                                                                       |
| P2  | `legalMarkdownToHtml` unescaped                                                                                                            | escape before transform                                                                                                 | `legalMarkdown.test.ts`                                                          |

## Open — needs a decision or live access (NOT changed)

- **P1** `deploy/keycloak/realm-export.json` seeds `admin/SupplifyAdmin1!`, `supplifyadmin/Supplify2025!`, password grant on, registration on; used for Railway **dev** Keycloak (public host). Rotate on the live realm; strip users + disable direct grants in the export. Also affects demo logins, so left to you.
- P2 `changeme` client secret in all three realm exports (confirm live secrets differ); prod/preprod mobile client has localhost/exp redirect URIs.
- P2 Web nginx sends no CSP/HSTS; staff portal token in localStorage; `GET /auth/logout` is state-changing; `CONSUMER_AUTH_SECRET`/`IMPERSONATION_SECRET` fall back to `SESSION_SECRET`; docker-compose binds infra on all interfaces.
- P2 Impersonation JWT not revocable after "stop" (≤60 min); org-owner enrolment (`org.routes.js:974,1032`) has the same missing-membership shape as the fixed P1.
- P2 Order placement idempotency is opt-in (no key → duplicate orders); payment recording has no unique `provider_transaction_id`; spreadsheet import parses before size/zip checks; storage metering races.
- Perf (by inspection only): driver GPS sends one POST per active order per tick (no batching/in-flight guard); `driver_location_ping` has 6 indexes and an unbatched retention DELETE with no `recorded_at` index; order list lacks `(created_at,id)` index and trigram search; `notification_log` has 4 overlapping user indexes; per-item SELECT loop inside order-create transaction; notification email/WhatsApp awaited in request path; 5s unguarded polling on consumer track/receipt pages. Each needs `EXPLAIN`/measurement before indexes change.

## Not reviewed

`reports.routes.js`, `search.routes.js`, restaurant-finance, reservations manage-token flows, `public.routes.js`, socket room-join beyond `tenant-event-access.js`, quote-requests, credit-notes, promotions, supplier-growth, assistant, restaurant-org analogue of org enrolment.
