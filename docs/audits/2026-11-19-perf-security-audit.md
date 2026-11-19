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

Second pass (same day) — also fixed, unit/render-tested, not run on a device:

- Per-order tracking: the throttle and the restaurant's order-scoped position now read `driver_location_ping` (history, per order) instead of the single per-driver `driver_latest_location` row (kept for the ~10 other readers; no schema change). Throttle tolerates the app's ~14.5 s cadence (was dropping about every other ping).
- Late ping after delivery -> `stored:false` (was 400); invalid `supplier.last_order_timezone` -> platform default (was 500); `delivery-status` 404 + readable validation text; notifications `limit`/`offset`/non-UUID id no longer 500; warehouse allowlist now covers driver route endpoints + push/notification-preferences.
- App: one `DriverTrackingProvider` (Home + Stop each ran a watcher), future-dated orders not tracked, "tracking off / getting your location" states, `stored:false` no longer shown as "Location active"; POD can be confirmed with a recipient name when photo upload is switched off (`FEATURE_DISABLED`); maintenance 503 no longer shown as scan outage; double-tap guard; Arabic strings (44 keys, written by Claude — needs native-speaker review); local-date fixes; `Planned` label; `route.stops` guards.
- Checked, no change needed: `complete-delivery` retry is already idempotent (lost-response retry path + `ON CONFLICT (driver_assignment_id)`), so the earlier "suspected" item was wrong.

Still open:

- **Background tracking not implemented.** Needs `expo-task-manager` (not a dependency) + `app.json` background-location/foreground-service config + Android `ACCESS_BACKGROUND_LOCATION` / iOS "Always" strings, a native rebuild, and Google Play/App Store background-location declarations. Pings still stop when the app is backgrounded. Product/policy decision.
- `supplier.last_order_timezone` defaults to `'UTC'` (NOT NULL), so the platform default Asia/Beirut never applies; "today" for a supplier that never set it is the UTC date. Needs a data/onboarding decision. Migration 0237 in the main checkout is Codex's and was not touched.
- `driver_latest_location` is still keyed by driver (fine for readers that want the driver's last position).
- `delivery_tracking` flag gates the POD presign for everyone; the app now falls back to recipient-name confirmation instead of blocking.
- `driver-detail` resolves by order for the calling driver; a driver holding two legs of one order could see the other leg's detail (rare, unchanged).
- Notification quirks left as-is: a driver's own `failed_delivery` notification is filtered out; `templates.js` derives tenantId with an unordered `LIMIT 1`.
