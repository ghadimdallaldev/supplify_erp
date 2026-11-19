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

## Driver app check (2026-11-19) — code reading + tsc/jest; nothing run on a device

Fixed: global per-IP limiter counted driver GPS pings (62 POST/order/15 min vs 120 write / 300 total cap) so
a driver with 2+ active orders could be locked out of complete-delivery, and the 429 was text/plain
("Invalid server response" in the app) → location pings exempt + own limiter, JSON 429s;
phone clock >2 min ahead → every ping 400 (now clamped up to 15 min); restricted-warehouse drivers
403 on `complete-delivery` (allowlisted); app: refetch failure wiped the screen, stop screen showed
"Delivery not found" on network errors, generic "check your connection" for 403/429/maintenance,
orphan GPS watcher, unguarded `Linking.openURL`, double `goBack`.

Still open (not changed):

- **No background tracking**: `app.json` disables background location/foreground service and nothing uses TaskManager, so pings stop when the driver opens Maps or locks the phone. Product decision needed.
- `driver_latest_location` is keyed by `driver_id` only, so with several active orders restaurants see one order's position at a time; a ping for another order inside 15 s is silently dropped (`stored:false`, HTTP 200) while the app shows "Location active".
- Invalid `supplier.last_order_timezone` → 500 on `/fulfillment/routes/active` (migration 0237 is only in the main checkout, uncommitted); column defaults to `'UTC'` so "today" is 2-3 h behind Beirut.
- `delivery_tracking` flag off blocks the POD presign while the app requires a photo → driver cannot complete; same with the `file_uploads` kill switch.
- `delivery-status` 500 on a missing order (NotFoundError unmapped) and raw Zod JSON in the error text; maintenance 503 on the photo PUT mislabelled "security scan unavailable".
- Two screens run `useDriverGpsTracking` at once (Home stays mounted under Stop) → duplicate watchers/pings; all pings include future-dated assignments.
- Arabic UI shows English for GPS banner, status labels, schedule buckets and upload-progress strings (not in en/ar JSON); UTC-date bugs near midnight in the run sheet / schedule bucket; route stop status shown as raw `PLANNED`.
- Complete-delivery retry after a timeout may hit "already delivered" (server idempotency not checked); possible double-tap on Confirm.
