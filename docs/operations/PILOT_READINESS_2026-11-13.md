# Supervised pilot readiness - 2026-11-13

Scope: English-first web and Android pilot; one supplier, three restaurants,
approximately twenty products, and one driver only if delivery is included.
Use the existing manual payment gateway. iOS receives shared contract and
session fixes but is not a pilot distribution target.

## Implemented

- Native cart and restaurant dashboard show separate currency totals. The cart
  also groups estimates by supplier and blocks mixed currencies within one
  supplier order. No implicit conversion is performed.
- Checkout retains its exact payload and idempotency key across screen remounts
  and uncertain responses. Cart editing is locked until a confirmed outcome;
  users can check orders and retry the same attempt. Explicit rejection unlocks
  editing. Account/workspace changes discard that account's attempt.
- Logout, expired sessions, and workspace changes clear native query caches and
  the cart, abort requests, reject late responses, serialize credential writes,
  and discard queued notification navigation from the previous session.
- Native product/quantity controls are at least 48 logical pixels; cart controls
  use a separate row and a measured sticky footer. Recent-order dashboard
  figures explicitly describe the ten-order sample.
- Web task groups can be collapsed and reopen on navigation to their page;
  navigation labels wrap. Supplier receivables use available currency groups.
- Quick-list item joins include additive `product_currency`, preserved by web,
  Android, and iOS when loading carts.
- Cron jobs release their in-process guard after a failed connection, allowing
  the next tick to retry. Initial runs execute sequentially to avoid exhausting
  the pool while advisory-lock holders request additional connections.
- Transactional mail suppresses demo/test/invalid/localhost recipient domains
  across To/CC/BCC before transport and deduplication. SMTP has bounded connect,
  greeting, and socket timeouts. Production mail uses supported Resend HTTPS
  with the existing credential fallback; no new environment key is required.
- Keycloak's bundled email adapter relays its rendered recovery/verification
  messages through the authenticated API channel, using the existing OTP URL
  and shared secret. The body is sensitive and excluded from stored retry data.
  Native SMTP remains available when that channel is not configured.

## Evidence and release record

Evidence artifacts are under `output/pilot-readiness-2026-11-13/`. They contain
test/build results and sanitized operational metadata, not database snapshots
or credentials. Operational scripts retrieve credentials into process memory.

- Android and iOS: 28 suites / 113 tests per client and TypeScript checks pass.
  Final 48-pixel Remove correction also passes both native TypeScript checks.
- API: 388 suites / 2,560 tests pass, including the recovery relay through real
  CSRF middleware. Web: 150 suites / 586 tests pass. Keycloak: nine Java tests
  pass, including the new HTTP adapter's success and failure paths.
- ERP `pnpm typecheck`, production build, and lint passed. API lint reports
  pre-existing warnings; web lint passes with zero warnings.
- Hosted production logical restore passed for PostgreSQL 18.6: app database
  `railway` restored 234 tables, 233 migration records, zero app users and zero
  orders; Keycloak restored 92 tables, three realms and five users. Scratch
  container and anonymous volume were removed. Duration: 167.3 seconds.
  This is a logical portability/data drill, not a restored live login exercise
  or proof of Railway's automatic backup schedule.
- Resend confirms invitation template test delivered to the approved owner's
  inbox. Its button deliberately opens the app; no real customer invitation or
  membership was created by this transport/template test.
- Running production OTP endpoint returned HTTP 200 after switching from SMTP
  to Resend HTTPS. Resend confirms OTP delivery to the approved inbox.
- Preproduction API, web and Keycloak are deployed and healthy. The API's initial
  21 cron jobs completed without failure, followed by a recurring scheduled-order
  run. Daily/monthly future ticks are not proven by this observation.
- Actual preproduction Keycloak recovery mail was delivered via the HTTP
  adapter. The approved inbox already had an identity there; it was retained.
  The earlier temporary production SMTP diagnostic identity was removed and its
  settings were rolled back after SMTP connection failure.
- Browser fixtures: web orders/navigation at 390/1440 pixels and native cart at
  320/390/768 pixels have zero runtime errors and horizontal overflow. Quantity
  controls measure 48x48 and Remove targets 56x48. This is not a native-device
  accessibility audit. The final signed APK installed and started on an API 35
  emulator with package version 1.1.0 / code 27 (min SDK 24, target SDK 36).
- Final Android build: version 1.1.0, version code 27, profile `pilot` (production
  API/Keycloak, internal signed APK), EAS build
  [`de477af2-8729-4411-84a8-534fa4e6d39f`](https://expo.dev/accounts/supplify-team/projects/supplify-mobile/builds/de477af2-8729-4411-84a8-534fa4e6d39f).
  The EAS production environment contains `GOOGLE_SERVICES_JSON`. This confirms
  client configuration presence, not FCM credential validity or device receipt.
  The local artifact is `output/pilot-readiness-2026-11-13/supplify-pilot-1.1.0-27.apk`.
  SHA-256: `F6404CE4AEB7FE156FFF147B007314777EDED94D165BBA6C0C832760D1D9C748`.
  On the API 35 emulator, tapping Sign in opens the production Keycloak host
  and renders username/password inputs. No credentials were entered; token
  exchange and authenticated order/payment flows remain device/rehearsal gates.

- Railway's production database volume initially had no backup schedules and
  no hosted snapshots. The owner explicitly chose to leave backup configuration
  pending. The daily + weekly configuration/initial-snapshot script remains a
  dry run; no schedules or hosted snapshots were created. Railway documents
  [daily and weekly retention](https://docs.railway.com/enterprise/security#backups-and-recovery)
  as six and twenty-seven days respectively. This gate remains open.
- The shared Resend account showed real mail attempts to seeded `.demo`
  recipients. This does not identify their originating environment. The new
  application guard prevents those attempts once deployed.

## Deployment inventory

Preproduction source deployments (isolated snapshots, no branch pushes):

- API: `8e0c944f-cf3e-4f06-a4af-29f4e3f2a4b3`.
- Web: `43824465-cf07-4827-b8a0-40be0719ffbd`.
- Keycloak: `a581aeff-4839-47c5-b2fd-bd190988d359`.

Production received the verified `EMAIL_PROVIDER=resend` configuration change.
The new API/web/Keycloak source remains in preproduction while the launch gates
below are open; production recovery therefore still needs the verified adapter
rollout and delivery test. Previous healthy production rollback deployments:
API `00d32105-2723-4087-8129-a4cdb529973e`, web
`b658b24b-cbd0-4e4e-bb02-86d379fab04c`, Keycloak
`77cec117-6208-4a33-88eb-2db1f004c916`.

## Launch gates

Do not invite customers until all of these have dated evidence:

- [x] Final source deployed to preproduction; `/health` and `/ready` pass.
- [x] Observe successful startup runs after boot for scheduled orders, billing,
      overdue invoices, collections, and email jobs, plus a recurring scheduled
      order tick; no failures in the recorded window. Monitor later intervals.
- [ ] Production Keycloak password recovery configured and delivered. Initial
      inspection found reset enabled, no realm SMTP configuration, and no
      account matching the approved test inbox. OTP transport is separate.
- [ ] Railway automated backup schedule, retention, and last successful snapshot
      confirmed in the project dashboard.
- [ ] Install the signed Android pilot APK on the target physical devices.
      Verify PKCE login, logout/login as another user, workspace switching,
      push receipt/tap, airplane-mode checkout recovery, large fonts, receiving
      uploads, and driver GPS/proof where included.
- [ ] Rehearse invitation -> catalog -> cart -> supplier acceptance -> receiving
      -> invoice/manual payment using isolated preproduction pilot tenants.
- [ ] Name the real cohort and support owner, confirm entitlements/roles and
      product units/currencies, and schedule assisted onboarding.
- [ ] Promote the verified source after the preceding gates; repeat production
      readiness and one controlled order flow. Never push directly to main/prod.

No physical Android device was connected at initial inspection. An emulator
can validate installation/rendering but cannot close physical push/GPS gates.
Native pending checkout state is memory-scoped: after process termination,
check Orders before placing the same purchase again.

## Assisted onboarding and acceptance

Record these before creating production memberships: supplier legal/display
name, owner email, three restaurant/branch names and owner emails, billing
currency per price, units/MOQs/order multiples, delivery areas and lead times,
plan/feature entitlements, manual payment instructions, and support contact.
Never populate missing customer details from demo tenants.

1. Load approximately twenty supplier products with correct currencies, stock,
   units and images. Review pricing and each restaurant's access with its owner.
2. Invite owners, accept each actual invitation, and test password recovery.
3. Place a small controlled order; supplier accepts and fulfills it. Restaurant
   receives it and checks the invoice; reconcile the manual payment offline.
4. Rehearse a rejected order, a failed upload and a dropped checkout response.
   Verify retry does not create a second order and retry/recovery UI is clear.
5. Train the driver only if delivery is enabled. Demonstrate permission prompts,
   stop status, proof upload and the fallback when location is unavailable.
6. Run the first working week with a named support owner, daily order/payment
   reconciliation, error/cron/email review and a short issue log. Pause cohort
   expansion for data isolation, order duplication or reconciliation failures.

## Rollback

Keep the previous healthy Railway deployment IDs before each promotion.
Revert to that immutable deployment if health/readiness or pilot smoke fails.
Restore the previous email provider variable if changing providers introduces
delivery failures. No migration is added by this patch. Database restoration
is a separate incident action requiring explicit approval; the drill never
writes to the source database. Never seed/reset/wipe a customer environment.
