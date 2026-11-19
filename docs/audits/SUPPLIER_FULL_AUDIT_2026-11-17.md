# Full supplier code and feature audit - 2026-11-17

Status: **incomplete; exhaustive source review and feature verification are not yet
established.** The objective covers every supplier feature and functionality in
the ERP API/web and both native clients. The earlier focused workflow audit is
evidence for its named checks only, not completion of this broader objective.

## Source inventory

`node scripts/qa/supplier-source-inventory.mjs` builds the
[source manifest](./supplier-full-source-inventory.json) using the installed
TypeScript parser. It follows static imports/exports, literal dynamic imports and
literal `require` calls and literal Vite `import.meta.glob` patterns from explicit
supplier/shared entry points. Every source
entry records its repository, SHA-256, line count and feature reachability.
The [manual review ledger](./supplier-full-review-ledger.json) records the exact
hash and scope of each review. The generator marks a review stale if the source
hash changes; partial reviews never count as full-file review.

At the ninth-stage snapshot (2026-11-19) the manifest contains **1,285 reachable
source files (273,213 lines)**, with 57 fully source-reviewed, 33 partially reviewed,
1,195 pending and zero stale recorded hashes. Earlier feature-gate deltas and scoped
quote locale fields have been revalidated against the current source.
These counts describe source inspection;
feature/runtime completion uses the separate coverage ledger below.

The inventory deliberately includes shared dependencies and some other-workspace
code reached through shared barrels. Generated reachability is **not** evidence
that a source file has been read or its behavior verified. Runtime dependency
injection, environment configuration and external services still need manual
inspection. Scope changes or exclusions require a recorded reason.

The native Driver navigators are explicit entry points because assigned driver
work is part of supplier fulfillment. Their addition corrects an initial source
inventory omission; generated counts must be refreshed from the manifest.

The seventh stage adds the startup quote-schema helper as an explicit entry point
and expands the locale loader's Vite glob. Its 64 matches add 60 previously uncounted
translation files. Application locale loading remains lazy. Nonliteral glob/import
patterns, runtime wiring and unreferenced source still require manual discovery;
the inventory does not establish exhaustive coverage by itself.

## Feature coverage ledger

Every row remains open until source review, relevant successful/failing workflows,
roles/plans and all affected clients have evidence. "Prior regressions" below means
named automated tests exist; it does not establish exhaustive feature coverage.

| Feature area                    | Required review and execution                                                    | Current evidence / next work                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and account lifecycle  | Registration, activation, auth/refresh/revocation, tenant switching, deletion    | Prior auth tests; complete supplier lifecycle matrix pending                                                                                              |
| Profile and business settings   | Profile, contacts, tax/payment settings, cutoff/timezone, POD policy             | Business/cutoff source and timezone/calendar fixes verified; profile/contact/lifecycle and full settings matrices pending                                 |
| Roles and team                  | Default/custom roles, invitations, permission changes, revocation, navigation    | Summary finance leak reproduced and repaired; other permissions pending                                                                                   |
| Organization and branches       | Creation/linking/invitations, branch capacity, scopes, concurrent changes        | Prior PostgreSQL scope/race regressions; full flows pending                                                                                               |
| Warehouses                      | Ownership, assignments, CRUD, lifecycle, zones, stock transfer                   | Prior integrity regressions; complete UI/API/role matrix pending                                                                                          |
| Catalog                         | CRUD/categories/media, publication, plan limits, availability                    | Prior unit/UI tests; complete supplier/restaurant visibility matrix pending                                                                               |
| Product imports                 | CSV/XLSX parsing, partial/error paths, retries, jobs, images, upload isolation   | Prior unit tests; complete import/job/provider matrix pending                                                                                             |
| Pricing and contracts           | Customer access, quantity tiers, discounts, dates, currency, tax                 | Supplier-local contract as-of day and cutoff-boundary agreement verified; full editable and purchase flows pending                                        |
| Orders                          | Lists/details/search, acknowledge/process/cancel/decline, history, idempotency   | Real quote/manual checkout, scoped replay, calendar DTOs, note save/clear and rollback verified; complete lifecycle matrix pending                        |
| Inventory                       | Legacy/warehouse modes, reservations, adjustments, low stock, mirrors            | Prior integrity tests; all adjustment and fulfillment paths pending                                                                                       |
| Fulfillment                     | Pick/pack/dispatch, assignments, shortages/substitutions, exceptions             | Atomic proof rollback, multi-leg completion and lock-order regressions pass; complete end-to-end flow review pending                                      |
| Drivers and delivery            | Assignment, board filters, routes, status/POD, GPS/ETA, driver isolation         | Board/proof/date/scope, route lifecycle, direct completion/handover and exact-leg selection corrections verified; retry/rollover, GPS and devices pending |
| Command center and run sheet    | Summaries, dates, cache, priorities, partial failures and domain visibility      | Finance redaction repaired; other domain/plan visibility and degradation remain open                                                                      |
| Invoices/payments/credit        | Issue/void, partial/full payment, credit, PDF, currency, transaction safety      | Prior tests; all lifecycle, permission and retry paths pending                                                                                            |
| Receivables/collections/exports | Calendar aging, currencies, debtor targets, reminders, exports                   | Earlier reproduced fixes; finance summary access now repaired; full reminders/provider matrix pending                                                     |
| Customers and growth            | Customer lists/details, matching/import, connect/invite/sponsor, limits          | Prior tenant/deduplication checks; full invitations/sponsorship lifecycle pending                                                                         |
| Quotes                          | Supplier inbox/detail, response/decline, validity, conversion and access         | Real SQL ownership/calendar/response/decline/cart/price and checkout commits verified; precision, new-request phantoms and full matrix remain open        |
| Disputes/returns                | Eligibility, shortages/substitutions, replacement/refund/credit and stock        | Prior tests; complete terminal/retry/permission matrix pending                                                                                            |
| Promotions/boosts               | Eligibility, CRUD, review, redemption, limits, boost billing/expiry              | Prior tests; full lifecycle and client parity review pending                                                                                              |
| Loyalty                         | Program settings, earn/redeem, ledger, customer balances, reversals              | Prior isolated tenant checks; full earn/reversal flows pending                                                                                            |
| Reviews                         | Submission, eligibility, moderation, aggregate/display ownership                 | Full source and supplier-facing feature verification pending                                                                                              |
| Public sales                    | Catalog/settings, guest/consumer orders, payment, pickup/delivery, tracking      | Full supplier/public customer lifecycle review pending                                                                                                    |
| Reports and analytics           | All report tabs, filters, exports, currency/date/scope correctness               | Prior unit/UI tests; complete real aggregation matrix pending                                                                                             |
| Chat                            | Tenant/participant access, attachments, unread, send/retry, sockets              | Prior auth tests; full user flows and offline/reconnect pending                                                                                           |
| Notifications                   | Recipient/permission scope, payloads/deep links, read state, delivery            | Prior scope tests; full event and provider matrix pending                                                                                                 |
| Plans/billing/features          | Every supplier tier, feature value/capability, limits, locked states             | Full supplier plan and billing recovery matrix pending                                                                                                    |
| Files/storage                   | Presign/complete/scan, ownership, limits, download and failed/retry states       | Prior security checks; complete supplier attachment/import matrix pending                                                                                 |
| Assistant                       | Supplier tools, data/permission scopes, prompts/errors and limits                | Complete tool and model/provider boundary review pending                                                                                                  |
| Audit/activity                  | Tenant/resource filtering, required audit writes, privacy                        | Complete supplier activity/access/failure review pending                                                                                                  |
| Realtime                        | Membership changes, event authorization, reconnect and offline cache             | Prior isolation checks; full supplier event/client matrix pending                                                                                         |
| Background jobs                 | Billing, collections, delivery rollover, retention, expiry, notification retries | Rollover SQL/calendar/stale-write/numbering corrections verified; full job/retry/provider matrices pending                                                |
| Web and native navigation       | Every screen/action, role/feature gates, error/empty states, locale/layout       | Finance guards mirrored; remaining screens and physical devices pending                                                                                   |

## Confirmed correction in this audit stage

**FULL-S01 - Financial data through operational summaries (high).** A caller
with only `FULFILLMENT_VIEW` received unpaid/overdue totals, debtor details,
financial priorities and invoice rows through `/api/supplier/command-center` and
`/api/supplier/run-sheet`. The route admission check allowed operational access
but did not apply invoice permission to the aggregated response. A driver-only
caller also passed the run-sheet gate despite that endpoint being tenant-wide.

Both HTTP routes now project the response using the existing `INVOICES_VIEW`
permission (including its `INVOICES_MANAGE` implication and trusted Owner bypass).
Unauthorized money fields are null, finance priorities/debtor previews/currency
groups/invoice rows are removed, and the collection section is empty. Projection
occurs after the shared cache read and creates new objects so one caller cannot
alter another caller's cached response. A driver-only grant no longer admits
the tenant-wide run sheet; driver-specific routes remain available through their
existing assignment checks.

Web and both native run sheets hide finance tiles and collection sections without
invoice permission, including when supplied an old cached payload. Web command
center finance previews/KPIs and financial priorities apply the same permission.
No permission key, role definition or authorized finance response shape changed.

## Evidence for this stage

- Before correction: three of seven new API route tests failed, demonstrating
  both finance leaks and the driver-only admission. The tests retain the real
  permission guards and mock identity/tenant resolution, data services and cache.
- After correction: summary security and existing intelligence routes pass 23
  tests, including Owner/manage permissions and shared-response immutability.
- Web supplier panel/page regressions pass 13 tests, including authorized and
  unauthorized run-sheet rendering with a cached financial payload.
- Native run-sheet regression reproduced unauthorized financial rendering before
  correction. Matching Android/iOS screen, receivables and currency suites pass 10
  tests on each platform after correction.
- Final API suite: **397 files / 2,625 tests passed**. Final web suite:
  **164 files / 630 tests passed**. These are broad regression results, not proof
  of every feature requirement in the coverage ledger.
- ERP, Android and iOS typechecks passed. API/web lint passed; the API retains
  its existing 1,717 warnings and no lint errors.

Logs: `output/supplier-summary-security-{before,after}-2026-11-17.log`,
`output/supplier-web-summary-2026-11-17.log`,
`output/supplier-native-summary-before-2026-11-17.log`, and
`output/supplier-{android,ios}-summary-2026-11-17.log`.
Full-check evidence is in `output/supplier-full-audit-{api,web,typecheck,android-typecheck,ios-typecheck,lint}-2026-11-17.log`.

## Delivery board corrections - second audit stage

- **FULL-S02 (high): broken fallback SQL and filter removal.** The minimal query
  reused a schedule expression referencing `da` without joining it, causing a
  second SQL failure after optional enrichment failed. It also stripped driver,
  status and zone conditions while retaining their bind parameters, and replaced
  assignments/statuses with unassigned/pending values. The fallback now retains
  assignment joins/identity/status, every condition and its parameters, and the
  zone/branch joins needed by an area filter. It fails if a required filter
  dependency remains unavailable. Supplier clauses are explicit on assignment,
  driver-display and route-date lookups.
- **FULL-S03 (medium): malformed delivery day.** A PostgreSQL DATE object was
  converted with `String(value).slice(0, 10)`, returning `Wed Nov 18` rather than
  `2026-11-18`. Queries now return the calendar day as text. Web dispatch/tracking
  prefer it and display a date-only value without a fabricated clock time. Both
  native clients verify their existing canonical-day preference over a prior-day
  legacy UTC timestamp.
- **FULL-S04 (medium): area-label grouping crash.** Plain-object grouping treated
  inherited properties such as `constructor` as existing arrays and then failed
  on `.push`. A null-prototype dictionary now handles arbitrary stored labels;
  real SQL regressions include `constructor`, `__proto__` and `toString`.

The initial four PostgreSQL regressions failed before correction. The expanded
matrix executes real PostgreSQL SQL for schedule values, tenant/driver/status/
area restrictions and degraded results. Additional cases alter only schema-probe
metadata to exercise absent driver display tables/date columns and legacy route
precedence. They do not remove physical tables or establish every historic
schema's compatibility. A fixture needed an explicit UUID cast; that fixture
error is separate from product failures.

Focused checks passed 27 API tests, 14 web tests and six native tests per platform.
Final validation passed **397 API files / 2,626 tests**, **164 web files / 632
tests**, and **four PostgreSQL integrity files / 77 tests**. ERP, Android and iOS
typechecks pass. API/web lint passes with the existing 1,717 API warnings.
Logs are `output/supplier-delivery-before-2026-11-17.log`,
`output/supplier-delivery-api-2026-11-17.log`,
`output/supplier-delivery-web-2026-11-17.log`,
`output/supplier-delivery-postgres-final-2026-11-17.log`, and
`output/supplier-delivery-{android,ios}-2026-11-17.log`.
Full suite/typecheck/lint evidence is in
`output/supplier-delivery-{full-api,full-web,typecheck,android-typecheck,ios-typecheck,lint}-2026-11-17.log`.

Remaining delivery leads from that stage were carried into the third stage below.
Delivery-board limits/query validation, schema-repair DDL on a read path and
additional historical column-drift combinations remain open.

## Assignment, proof and delivery detail - third audit stage

- **FULL-S05 (medium): assignment calendar.** Driver assignment used database
  `CURRENT_DATE`, discarding future requested days and using the wrong day at
  supplier timezone boundaries. It now keeps the later of the requested day and
  supplier today, using `last_order_timezone` with the configured fallback.
- **FULL-S06 (high): proof/assignment mismatch and retry.** Supplier atomic
  completion without a selector could insert an unbound proof, then fail the
  required-POD check for the actual assignment. It now resolves/locks the target
  first and uses its ID for both proof and status. Single-leg and warehouse-leg
  delivered retries reuse the same proof row; ambiguous legs require a selector.
  An explicit nonexistent/foreign proof selector now fails instead of silently
  storing an unbound proof.
- **FULL-S07 (medium): transaction pool starvation.** Proof ownership validation
  acquired a global pool connection while completion already held a transaction
  connection. A one-connection pool timed out. Validation now uses the supplied
  transaction client; the same constrained-pool scenario passes.
- **FULL-S08 (high): delivery lock inversion.** Status update locked assignment
  then order while reassignment locked order then assignment. Controlled real
  transactions produced PostgreSQL `40P01`. Status/completion now lock the parent
  before the leg. The same barriers serialize the race and retain one occupied
  assignment; a stale caller may receive a validation error.
- **FULL-S09 (high): driver proof across legs.** Standalone proof submission
  checked order access before parsing its assignment selector, letting a driver
  target a different driver's leg of that order. The endpoint now authorizes the
  supplied leg and uses the returned authorized assignment even for older driver
  requests without selectors. New route regressions reproduced the successful
  unauthorized write and the missing binding before correction.
- **FULL-S10 (medium): driver detail calendar shift.** Converting a PostgreSQL
  DATE to UTC moved `2099-02-03` to `2099-02-02` in the Beirut fixture. Effective
  day selection now happens in SQL and returns text. The route date is text too.
- **FULL-S11 (medium): driver detail SQL filter bypass.** When no assignment
  matched the requested driver, an `EXISTS(any assignment)` fallback returned
  operational detail anyway. Existing route authorization was an outer defense;
  the service now independently rejects this case. Supplier calls without a
  driver filter retain their historical-assignment fallback.
- **FULL-S12 (medium): ambiguous legacy POD indicator.** Driver detail counted a
  header-only legacy proof for every leg. It now applies the board's existing
  rule: an unbound proof counts only when no different non-reassigned leg exists.

Android and iOS standalone proof clients now forward the optional assignment ID,
and their proof response types expose it. Web accepts the same selector. All
three clients type proof responses and atomic completion assignment IDs/status.
The active native proof screens already require and preserve their exact leg and
uploaded file during retries; no camera/upload flow rewrite was required.

### Third-stage evidence

- The initial seven real PostgreSQL cases all failed before correction: future
  day, two timezone boundaries, required proof/replay, invalid proof selector,
  pool starvation and the actual deadlock. Fixture setup errors were corrected
  before recording this product-failure baseline.
- Driver detail's date/filter cases failed with real SQL. The legacy-proof
  fixture initially lacked required `delivery_date`; after fixing the fixture,
  its isolated test failed on the old POD expression and passed on the new one.
- Expanded PostgreSQL fulfillment suite: **15 cases passed**, including warehouse
  selector replay, multi-leg ambiguity/isolation, cross-supplier IDs and atomic
  rollback. Warehouse fixtures begin after stock dispatch; these cases do not
  establish physical stock-return semantics or all reservation transitions.
- API access regression: two of the three new route cases failed before repair;
  all 11 route cases pass after it. These route tests retain real routing and
  permission middleware but mock the assignment guard's contract and data writes;
  PostgreSQL tests exercise actual service SQL and transactions separately. An
  additional real linked-user/driver fixture verifies the assignment guard accepts
  the driver's own leg and rejects the other leg, even with an unrelated extra
  `ORDERS_VIEW` grant.
- Matching Android/iOS React Query hook suites each pass **four tests**, including
  explicit/omitted selectors, lost-response retry with unchanged proof/leg and
  success-only cache invalidation. Test notification/GC cleanup was fixed after
  the initial passing run left timers alive; final runs exit without that issue.
- Final broad checks: **397 API files / 2,629 tests**, **164 web files / 632 tests**,
  **five PostgreSQL files / 92 tests**; ERP, Android and iOS typechecks pass.
  API/web lint passes with its existing **1,717 API warnings** and no errors.

Reproduction logs: `output/supplier-fulfillment-before-2026-11-17.log`,
`output/supplier-pod-access-before-2026-11-17.log`,
`output/supplier-driver-detail-before-2026-11-17.log`, and
`output/supplier-pod-legacy-before-2026-11-17.log`.
Final evidence: `output/supplier-fulfillment-{after,postgres-verified,full-api,full-web,android-final,ios-final,typecheck,android-typecheck,ios-typecheck,lint}-2026-11-17.log`.

Route lifecycle leads from that stage continue below. Ready/reassignment/POD date
fallbacks, driver activity changes racing assignment prechecks, GPS/privacy/provider
behavior and offline/device capture remain open. No stock-return policy was changed
speculatively.

## Route lifecycle and client contracts - fourth audit stage

- **FULL-S13 (high): driver route creation rolled back.** The builder inserted a
  route, then read it through a global connection before committing its transaction.
  Real SQL returned `Route not found` and rolled creation back. Detail now uses the
  creation client; a sequential replay returns the same committed route.
- **FULL-S14 (medium): route calendar mismatch.** Route responses returned a Date
  serialized as the prior UTC day in positive timezones. List/detail/create/build
  now return calendar text. Planned-route lookup used database today, while default
  driver building used UTC today. Both now use the supplier timezone and configured
  fallback; boundary fixtures verify both lookup and omitted-date creation.
- **FULL-S15 (high): stale route mutations.** Add/remove/reorder/activation trusted
  status read before the transaction. Tests cancelled, started or completed the
  route in between, and the writes still succeeded, including reactivating a
  cancelled route. Writers now lock/recheck route status, driver and scheduled day;
  reorder/next operations also lock/recheck the stop set and terminal states.
  Cancellation and existing-driver-route merging apply the same route guard.
- **FULL-S16 (medium): driver handlers blocked by shared gate.** Six route paths
  intended for linked drivers were rejected by the router-wide `FULFILLMENT_VIEW`
  requirement before their scoped handlers ran. Existing driver view/manage keys
  now admit route reads/build/reorder/next operations. Negative tests preserve the
  supplier board/metadata boundary and reject unlinked or view-only writers.
- **FULL-S17 (medium): native route request/error contracts.** Both clients sent
  PATCH `stop_ids` to a handler expecting order-sequence updates, sent `order_id`
  instead of `orderId` for next stop, and converted every active-route failure into
  a successful null route. Clients now use canonical methods/fields and preserve
  errors plus cached data. Home/run sheet show one retry banner. Optimization types
  follow `{ preview, route }`; estimated route distance is labeled as an estimate,
  with matching English/Arabic messages rather than an unsupported savings field.
- **FULL-S18 (medium): wrong stop context.** Stop assignment enrichment selected
  the latest leg for any driver instead of the route's supplier/driver; currency
  was omitted so an LBP total could display with a client USD fallback. The query
  now scopes assignment selection and returns the actual currency. An exploratory
  cross-supplier item fixture was rejected by the existing ownership trigger and
  was not treated as a product defect; the regression uses a valid other-driver
  row within the same supplier.
- **FULL-S19 (high): driver scope checked too early.** A route driver change
  between HTTP authorization and transaction execution let an old driver's stop
  write proceed. The linked-driver scope now reaches the service and is checked
  against the locked route. The scoped response read preserves that boundary.
  Stop permission checks also use the existing common Owner/permission policy.
- **FULL-S20 (high): route-stop reassignment deadlock.** Route-stop dispatch locked
  assignments/stop before acquiring the order lock while reassignment held the
  order and needed those rows. Controlled real transactions produced `40P01`.
  After locking the route, dispatch now locks order before stop/assignment; the
  same barriers serialize the requests and reject a stop deleted by reassignment.
  Multi-order creation/build acquires order locks in sorted order before allocating
  a route number, avoiding an opposing number-lock/order-lock sequence.
- **FULL-S21 (medium): cancelled order planned from an old read.** An order
  cancelled between route precheck and insertion was still added. Eligibility,
  supplier ownership and pickup method are now checked again under its order lock
  before route insertion. No route is committed for the stale cancellation case.

Existing-driver-route merging also invalidates dispatch cache after its commit.
No notification payload, permission/feature key, environment variable or migration
changed. Both native clients have matching runtime/type/test/locale edits and a
dated parity record.

### Fourth-stage evidence

- The eight initial PostgreSQL route regressions failed before product fixes.
  Subsequent isolated baselines reproduced stale order insertion, stale driver
  scope and the actual route-stop deadlock. The race fixture first needed an
  explicit UUID cast; its later `40P01` is the product failure.
- The final route suite passes **13 real SQL cases**, including complete positive
  create/add/reorder/next/remove/cancel and start/dispatch/deliver workflows, plus
  calendar, stale-state and access failures. The fulfillment suite now has **16
  cases**, including the controlled route-stop/reassignment race.
- Route HTTP and route service suites pass **46 tests across three files**.
  The HTTP suite has 18 tests. Six new path cases failed before the gate fix; a
  temporary dispatch fixture failure came from a cache mock returning a non-Promise
  and was corrected separately. Identity/features/data services remain mocked at
  the HTTP boundary; database suites execute real SQL/transactions separately.
- Native route-hook regressions reproduced **four failures out of five cases**
  before correction. Final matching Android/iOS runs each pass **14 tests across
  three suites**: request/error contracts, existing atomic proof retries and new
  rendered home/run-sheet cases. Screen tests caught a duplicated Android banner
  from the first edit; it was removed and final screen/client/type/locale hashes
  match iOS. These are rendered tests with native UI/GPS/identity dependencies mocked.
- Broad API run: **397 files / 2,641 tests passed**. Full isolated integrity run:
  **six files / 106 tests passed**. Focused web route/status tests: **two files /
  six tests passed**. The full web suite's last run remains the third-stage
  **164 files / 632 tests**; no web runtime source changed in this fourth stage.
- Final ERP, Android and iOS typechecks pass. API/web lint passes with the existing
  **1,717 API warnings**, zero errors. Diff whitespace checks pass across all repos.

Baselines: `output/supplier-routes-before-2026-11-17.log`,
`output/supplier-route-{access,order,scope,lock}-before-2026-11-17.log`, and
`output/supplier-routes-android-before-2026-11-17.log`.
Final logs: `output/supplier-routes-{api,full-api,postgres-final,web,android,ios,typecheck,android-typecheck,ios-typecheck,lint}-2026-11-17.log`.

Fourth-stage source snapshot: **1,218 files / 254,222 lines**, with **18 source-reviewed,
16 partial, 1,184 pending and zero stale** entries. Source review does not certify
every runtime path. The planned/active driver replacement, zero-target stop update
and direct atomic POD synchronization leads are addressed in the fifth stage below.
Concurrent route building beyond sequential replay, invalid calendar input handling,
single-connection enrichment and historic schema/provider/device combinations remain open.

## Delivery and route consistency - fifth audit stage (2026-11-18)

- **FULL-S22 (high): direct delivery writes left routes stale.** Calling the
  assignment status or atomic proof endpoint changed the assignment/order but
  left its route stop/header planned or in progress. Both paths now synchronize
  the current route driver's warehouse legs, stop and route in the same transaction.
  A stop waits for all that driver's current legs; another driver's unfinished leg
  does not prevent this driver's route completing or prematurely deliver the order.
- **FULL-S23 (high): a stop could complete without an assignment.** The route
  endpoint accepted a delivered transition after finding zero eligible driver
  assignments. It now rejects the write and preserves the stop/header/order.
- **FULL-S24 (high): route driver handover failed or changed only the header.**
  Planned handover rejected the existing driver as a conflict; active handover left
  live assignments on the old driver. Both now retire the old unfinished records
  as reassigned and create the new driver's exact warehouse legs, preserving
  progress, schedule and history. Completed stops and other drivers' legs remain
  intact. Driver eligibility is rechecked in the transaction. Combined driver
  replacement and activation is covered as well as separate planned/active writes.
- **FULL-S25 (high): actions could target another warehouse leg.** Web indexed
  rows only by order ID, so clicking the first warehouse row could use the second
  row's assignment/warehouse IDs. Native stop details selected the first row while
  retaining a different explicit ID in the action. Both native home and stop
  selection also preferred completed history over remaining active work. All three
  clients now preserve explicit exact-leg selectors, reject stale explicit selectors
  and prefer active work when no selector was supplied. Status mutations invalidate
  native order, detail, board and route caches.
- **FULL-S26 (medium): proof completion sent a second delivered request.** The web
  route proof callback called the route-stop delivered endpoint after atomic POD
  completion had already committed. It now refreshes the board/route directly;
  there is one delivery mutation and no second failure after a successful proof.

Direct writes now lock order before route before assignment. Route-wide writes
lock their affected parent orders in sorted order before the route header; added
orders join that lock set. A controlled proof-versus-cancellation regression checks
this ordering and stale-state rejection. This is a regression guard for the new
synchronization, separate from the previously reproduced FULL-S20 deadlock.

No permission/feature key, required environment variable, migration or new payload
field changed. Both native repositories contain matching runtime and test edits;
the dated parity, driver/operations docs and regression checklist are updated.

### Fifth-stage evidence

- Real PostgreSQL baseline: **five failures / 13 passes** before correction,
  reproducing direct dispatch/POD staleness, zero-target completion and both
  planned/active driver handover failures. Four new rendered native cases all
  failed before correction. Two new web cases failed while the four existing
  page cases passed.
- The final route suite passes **23 real SQL cases** and fulfillment passes **17**.
  Added cases include multi-warehouse aggregation, another driver's leg, completed
  stop history, mid-route handover, combined handover/activation and the controlled
  direct-proof/cancellation race. Injecting an application error before commit
  rolls back proof, assignment, order, stop and route together; this is not a
  simulated PostgreSQL COMMIT failure. Warehouse fixtures start after dispatch:
  preserved available/reserved quantities do not establish stock-return policy.
- Final broad checks: **397 API files / 2,641 tests**, **164 web files / 634 tests**,
  and **six isolated PostgreSQL files / 117 tests passed**. Focused API service
  suites pass **55 tests / four files**. Focused web suites pass **nine tests /
  two files**. Matching native runs pass **28 tests / five suites per platform**,
  with native UI/GPS/identity dependencies mocked.
- ERP, Android and iOS typechecks pass; API/web lint passes with **1,717 existing
  API warnings and zero errors**. Native parity hashes and all repo whitespace
  checks pass. Typecheck found a missing optional warehouse field in the new
  generic selector constraint; the corrected declaration passes the final check.
- The first overlapping API/web/database run hit one API setup timeout and five
  web failures in two unrelated files. Their isolated reruns passed, followed by
  full API/web passes capped at four workers. Timeout thresholds and those test
  implementations were not changed; the initial logs are retained.

Baselines: `output/supplier-delivery-sync-before-2026-11-18.log`,
`output/supplier-delivery-sync-web-before-2026-11-18.log`, and
`output/supplier-delivery-sync-android-before-2026-11-18.log`.
Final logs: `output/supplier-delivery-sync-{api,web,android,ios,typecheck-final,android-typecheck,ios-typecheck,lint}-2026-11-18.log`,
`output/supplier-delivery-sync-postgres-verified-2026-11-18.log`, and
`output/supplier-delivery-sync-full-{api,web}-final-2026-11-18.log`.
The Nov17 baseline attempt was rejected before execution by automatic approval
review because the account usage limit was reached; it is not test evidence.
The resumed Nov18 run executed successfully.

Fifth-stage source snapshot: **1,219 files / 254,526 lines**, with **25 source-reviewed,
16 partial, 1,178 pending and zero stale** entries. The full audit remains active.
Remaining delivery leads include retry/rollover membership after failed stops,
tracking-session current-stop advancement after direct completion, concurrent
route creation/appends, invalid calendar inputs, pool-constrained enrichment,
order-only detail notes and web notes shared across warehouse cards. Physical
devices, GPS/providers, historical schemas and the complete failure/stock matrix
are not established by these fixtures.

## Rollover workflow - sixth audit stage (2026-11-18)

- **FULL-S27 (high): automatic rollover query failed on the real enum.**
  `customer_order.status <> ALL(text[])` raised PostgreSQL `42883`, preventing job
  selection. The predicate now compares the status's text value to the text array.
- **FULL-S28 (high): rollover dates were database Date objects.** The actual DATE
  result failed string-based cutoff comparisons and manual day addition raised
  `RangeError: Invalid time value`. Selection and assignment reads now return
  literal calendar text. The actual automatic job and manual transaction both run.
- **FULL-S29 (high): rollover trusted stale order/calendar state.** Between
  preflight and transaction, tests cancelled the order, changed its date to the
  future or committed another automatic rollover. Every old path still wrote.
  Rollover now locks parent order before its live routes and assignment, rechecks
  current order/assignment eligibility, recomputes the calendar from current rows
  and rechecks the automatic same-day marker. Newer state survives without writes.
- **FULL-S30 (medium): numbering gaps broke rollover route creation.** Its
  `COUNT(*) + 1` allocator collided with an existing `R-YYYYMMDD-002` after a gap,
  raising real PostgreSQL `23505`. Normal planning's allocator is now a shared
  module used by rollover: supplier transaction advisory lock, UTC day and maximum
  allocated suffix. Normal route-planning behavior is preserved by extraction.
- **FULL-S31 (medium): manual rollover left native delivery caches fresh but stale.**
  Only dispatch was invalidated, leaving order/driver/supplier delivery/run-sheet
  views on the old day or route. Android and iOS now invalidate all affected query
  families on success. Rejected requests retain cached work; a successful retry
  refreshes it. The existing assignment-ID endpoint/body/response is preserved.

Rollover unit tests now mock dispatch cache rather than accessing Redis through
that dependency. Real SQL tests retain actual database transactions and mock only
external notification/audit/cache side effects. No migration, environment variable,
permission/feature key or notification payload changed. Both native clients and
dated parity/domain/regression documentation are updated.

### Sixth-stage evidence

- Initial SQL execution reproduced the enum error and Date arithmetic error.
  After those fixes, the first fixture run lacked an active supplier subscription;
  its tenant-locked outcomes are fixture errors, not additional product failures.
  The corrected active-subscription baseline has **three failures / two passes**,
  independently reproducing stale cancellation, schedule and daily-marker writes.
- The isolated numbering baseline has **one failure / five passes**, with actual
  duplicate-key error `23505`. The final rollover suite has **eight passing real
  SQL cases**, including actual job selection/execution, manual route creation,
  repeat automatic processing and controlled pickup-versus-rollover serialization.
  The concurrency guard checks the first lock is the order, observes no `40P01`
  and preserves pickup; it is not claimed as an old-code deadlock reproduction.
- Both native baseline cases fail on stale success/retry caches. An earlier test
  fixture allowed zero-GC inactive queries to disappear during error assertions;
  the recorded verified baseline retains them until cleanup, then reproduces the
  two product failures. Final matching native runs pass **32 tests / seven suites
  per platform**, including prior delivery/route cases and order-detail unwrapping.
- Full integrity run: **seven files / 125 tests passed**. Full API: **397 files /
  2,641 tests passed**. The latest full web run remains fifth-stage **164 files /
  634 tests**, with no subsequent web runtime edit. Focused rollover/route API run:
  **35 tests / three files** before final broad confirmation.
- Final ERP/Android/iOS typechecks pass. API/web lint passes with its existing
  **1,717 API warnings and zero errors**. Native runtime/test hashes match; normal
  Git whitespace checks pass in all repos. An accidental check overriding Windows
  line-ending normalization reported CRLF as trailing whitespace; it was corrected
  to the repositories' normal Git settings without rewriting unrelated files.

Baselines: `output/supplier-rollover-before-2026-11-18.log`,
`output/supplier-rollover-race-verified-before-2026-11-18.log`,
`output/supplier-rollover-number-before-2026-11-18.log`, and
`output/supplier-rollover-android-verified-before-2026-11-18.log`.
Final logs: `output/supplier-rollover-{api,full-api,postgres,android,ios,typecheck,android-typecheck,ios-typecheck,lint}-2026-11-18.log`.

Sixth-stage inventory: **1,220 files / 254,558 lines**, **29 source-reviewed, 16 partial,
1,175 pending and zero stale**. Reading the complete retry source identifies open
route-membership/date/physical-return questions; it does not verify their behavior.
Remaining rollover leads include manual forced replay, advancement of long-overdue
dates, route grouping/header/sequence races across API instances, assignment-scoped
date fallbacks and retained stops on in-progress routes. Retry membership, GPS,
providers, devices and the broader supplier coverage ledger remain open.

## Supplier quotes - seventh audit stage (2026-11-18)

- **FULL-S32 (high): another supplier's requested line could be priced.** Response
  validation accepted any item in the shared RFQ. An invited supplier submitted the
  other supplier's line successfully. Writes now validate supplier ownership before
  and inside the transaction and freeze the corresponding request/product rows.
  Detail/cart/pricing reads also enforce request and supplier joins, covering
  historical invalid rows and links to another restaurant's request.
- **FULL-S33 (high): foreign substitute products were accepted.** A supplier could
  offer another supplier's product, and cart/pricing paths trusted that ID. New
  substitutes must share the responding supplier; historical foreign substitutes
  are excluded from detail, comparison, cart and all quote-price lookup paths.
- **FULL-S34 (high): a substitute price also priced the original SKU.** Single and
  batch resolution, mandatory-quote discovery and automatic manual-order locks
  accepted either product ID. All now use the offered effective SKU. A separate
  original-product quote can still coexist and keeps its own price.
- **FULL-S35 (high): response/decline decisions overwrote newer state.** A decline
  committed after response preflight was overwritten; decline also accepted an old
  open-request read after closure. Both writers now lock request then invitation
  and recheck current statuses. Overlapping decisions serialize to one valid result
  and notification. Response replacement rolls back on an application error before
  commit, retaining the prior response rather than a partial replacement.
- **FULL-S36 (medium): quote calendar days shifted during serialization.** Real
  PostgreSQL DATE values returned Date objects (`2099-02-03` became the prior UTC
  day in the Beirut fixture). Create/list/detail/compare and response reads now
  project needed-by/delivery dates as literal calendar text.
- **FULL-S37 (medium): unusable response values reached storage or submission.**
  Available lines accepted null prices; duplicate lines reached the unique
  constraint. Server validation now requires finite nonnegative available prices,
  positive optional quantities, unique items, currency codes and valid calendar
  days. Web/mobile also reject invalid available quantities; native price checks
  now reject NaN. Zero prices and price-free unavailable lines remain supported.
- **FULL-S38 (high): edits discarded quote identity/currency.** Web resent every
  line in the first currency and omitted the offered substitute. Native payloads
  omitted date/substitute and also used one currency. Edits now retain each line's
  currency, substitute ID and delivery day across all three clients; native types
  expose the existing optional substitute field.
- **FULL-S39 (medium): native clients blocked valid response edits.** They made
  every responded invitation read-only despite `canRespond: true` and an open RFQ.
  Android/iOS now follow the canonical guard; closed/declined responses stay locked.
- **FULL-S40 (medium): native draft values crossed request navigation.** Draft
  initialization stopped whenever any draft existed. Opening another invitation
  retained the first request's edited price instead of the second request's price.
  Draft identity now follows the invitation; refreshes of that same invitation
  retain the user's current draft.

No new endpoint, permission/feature key, environment variable, migration or
notification payload was introduced. Both native clients contain matching source,
type, test and locale edits. Quote/RBAC/product/parity/QA docs are updated; stale
documentation now names the actual PATCH path and migration 0154.

### Seventh-stage evidence

- Baseline: **10 failing / one passing PostgreSQL cases**, reproducing ownership,
  substitute, original-SKU pricing, stale decisions, date objects and value failures.
  Rendered web baseline: **two failures**. Android rendered baseline: **four failures /
  one pass**, including blocked edits, draft reuse, NaN and zero quantities.
- Final quote PostgreSQL suite: **16 cases passed**. It executes actual create,
  inbox/detail, response, comparison/cart and single/batch/discovery/manual-lock
  pricing SQL. Additional cases cover historical cross-request links, restaurant
  isolation, controlled overlapping response/decline preflights, unavailable lines
  and rollback on an application error before commit. These are price/cart service
  workflows, not proof of the full order-commit transaction or a PostgreSQL COMMIT
  failure. External notification delivery is mocked.
- Full API: **397 files / 2,650 tests passed**. Full web: **165 files / 636 tests
  passed**. Full isolated PostgreSQL: **eight files / 141 tests passed**. Focused
  quote API suites pass **54 tests / three files**; their identity/data boundaries
  are mocked separately from real SQL fixtures.
- Both native broad regressions pass **41 tests / nine suites per platform**.
  Post-encoding quote/locale runs pass **12 tests / three suites per platform**,
  including real Arabic copy-runtime assertions. The post-encoding web run passes
  **22 tests / three files**, including a newly added Arabic rendered case and
  namespace key/interpolation checks. Counts overlap with broad runs.
- New Arabic copy initially lost characters through PowerShell's stdin encoding.
  ASCII-safe JavaScript escapes repaired the stored UTF-8 entries; exact stored
  values and actual native/web runtime regressions now verify the correction.
  The full web run is supplemented by these later locale checks.
- ERP/Android/iOS typechecks and API/web lint pass, with **1,717 existing API
  warnings and zero errors**. Matching native file hashes and whitespace checks
  cover the final changes. Earlier focused unit failures were updated transaction
  mock sequences and an obsolete original/substitute expectation; final suites pass.

Baselines: `output/supplier-quotes-{before,web-before,android-before}-2026-11-18.log`.
Final evidence: `output/supplier-quotes-{api,full-api,full-web,postgres,postgres-focused,android-final,ios-final,web-locale-final,android-locale-final,ios-locale-final,lint}-2026-11-18.log`.
Final typechecks: `output/supplier-quotes-typecheck-verified-2026-11-18.log` and
`output/supplier-quotes-{android,ios}-typecheck-final-2026-11-18.log`.

Latest inventory: **1,282 files / 271,933 lines**, **41 source-reviewed, 23 partial,
1,218 pending and zero stale**. The larger pending count includes newly discovered
lazy translation files. Remaining quote leads include creation-eligibility races,
numeric scale/rounding/overflow, changes between checkout price reads and order
commit, invalid path IDs, notification/provider failures, web draft refreshes,
new substitute/date selection UI and the full role/plan/schema/device matrix.
All other open supplier feature rows remain part of the active goal.

## Checkout and stock entitlements - eighth audit stage (2026-11-18 to 2026-11-19)

- **FULL-S41 (high) - Checkout committed stale quote state.** A quote closure,
  price edit or reduced quantity committed between restaurant checkout preflight
  and its order transaction still produced an order with the earlier quote.
  Checkout now locks relevant request parents in ID order, reads eligible current
  lines under shared locks and validates product/supplier identity, selected
  response, price, currency and quantity before order writes. A response arriving
  on an included request after preflight also prevents catalog fallback. Quote
  writers wait while a valid checkout holds these locks. New RFQs and newly
  relevant substitutes outside the initial parent set remain an open phantom lead.
- **FULL-S42 (high) - Manual replay crossed supplier actors.** Reusing a manual
  key with another supplier could return the first supplier's order. Separate
  valid suppliers also conflicted on the same customer/key. Keys now include
  authenticated supplier and restaurant IDs. Historical successful manual rows
  replay only when the stored restaurant and every line belong to that supplier.
  Migration 0236 preserves historical rows and the actor/key index while removing
  the older restaurant/key uniqueness constraint. Concurrent owned retries,
  payload mismatches, quote closure and rollback are covered by real SQL.
- **FULL-S43 (high) - Manual price resolution acquired another connection.** The
  transaction called batch pricing through the pool, causing a one-connection
  checkout to time out. Automatic selectors and pricing now use the order's
  transaction client. Stock feature acquisition is additionally addressed in
  FULL-S47 below.
- **FULL-S44 (medium) - Manual quote references were discarded.** Manual orders
  stored the quote price without its response-item ID. The item insert now retains
  `quote_response_item_id`, with an HTTP/SQL assertion on the actual stored row.
- **FULL-S45 (medium) - Manual checkout discarded its resolved delivery day.** It
  calculated the supplier delivery day for pricing but persisted the raw optional
  request date. Headers now store the existing resolver's result, including when
  the caller omits the day. Cutoff timezone policy remains open.
- **FULL-S46 (medium) - Native placement hooks returned success wrappers.** Both
  hooks promised arrays but returned `{ order }` or `{ orders }`. Empty success
  data could confirm checkout. Android/iOS now normalize actual wrappers and
  validate order IDs. They preserve selectors and retry headers and expose a
  typed manual endpoint. Web types now describe the actual wrappers. The existing
  native cart already had a supplier-count fallback, so the regression establishes
  the hook contract and malformed-confirmation behavior.
- **FULL-S47 (high) - Stock entitlement checks escaped the transaction client.**
  Warehouse-mode selection queried organization billing, subscriptions, trials
  and overrides through the pool while holding the order connection. These
  dependencies now accept the scoped query. Transactional reads bypass shared
  caches and singleflight, protecting rollback and avoiding a second acquisition.
  Manual routing-feature preflight also runs before the transaction. Stock display
  with a supplied query follows that same scope. Missing compatibility-subscription
  creation retains its executor, serializes stock feature reads and handles the
  existing nonterminal tenant unique conflict in both subscription constructors.

### Eighth-stage evidence

- Initial checkout reproduction passed one control and failed **eight of nine**
  HTTP/SQL cases. Native reproduction failed **three of four** hook cases.
  Logs are `output/supplier-checkout-verified-before-2026-11-18.log` and
  `output/supplier-checkout-android-before-2026-11-18.log`.
- Checkout PostgreSQL regressions now pass **17 cases**, covering quote state,
  actual header/item/usage/reservation writes, manual audit references/dates,
  independent/overlapping keys, historical ownership, rollback/retry and a writer
  observed blocked via PostgreSQL while the order holds its quote lock. Both
  legacy and warehouse manual checkout run with one connection. Tenant identities
  and checkout eligibility/plan inputs are fixtures. The actual child router and
  role/permission guards execute, while external notifications, cache, audit,
  promotions and loyalty providers are mocked.
- A separate **six-case** real stock-entitlement suite uses actual feature,
  subscription, trial and organization code with a one-connection pool. It covers
  cold overrides, branch inheritance, trial targets, overlapping missing-row
  creation and rollback, including assertions that scoped values avoid shared
  caches. Its first fixture revision needed UUID casts and a new branch warehouse
  because warehouse ownership is immutable.
- A strengthened checkout harness initially used an unintended connector, which
  failed authentication. It was replaced by the guarded audit-pool query. The
  controlled SQL reproduction is
  `output/supplier-checkout-stock-feature-before-2026-11-19.log`. All subsequent
  entitlement regressions use the owned local database.
- The first broad SQL run found **11 transaction failures** from overlapping
  compatibility-subscription inserts and one cold connection timeout. Sequential
  reads, conflict-safe inserts and a less aggressive fixture connection timeout
  corrected these. The affected restaurant/warehouse/entitlement rerun passes
  **49 cases**. Final full isolated SQL verification passes **164 tests / ten
  files** with the intended single-fork runner.
- Current Android/iOS checkout, cart, quote and locale regressions pass **32 tests /
  seven suites per platform**. Both typechecks pass. Focused web order/cart
  regressions pass **nine tests / four files**. ERP typecheck passes.
- API/web lint passes with **1,717 existing API warnings and zero errors**. The
  earlier checkout broad run passed **2,650 API tests / 397 files** on 2026-11-18.
  The first 2026-11-19 broad run passed 2,757 tests and timed out in one billing
  fixture under high worker concurrency. That fixture passed independently.
  Final bounded-worker API verification passes **2,758 tests / 404 files**.
  Final touched-source lint also passes after the subscription race correction.
- Migration 0236 was applied only in the disposable audit database. Application
  and retry behavior in hosted environments, mixed API versions and all
  warehouse/plan combinations remain rollout gates. Current source also includes
  subsequent feature-flag work, whose changed hashes were recorded for follow-up.

Final logs are `output/supplier-checkout-postgres-final-2026-11-19.log`,
`output/supplier-checkout-full-api-final-2026-11-19.log`,
`output/supplier-stock-entitlements-recovery-2026-11-19.log`,
`output/supplier-checkout-{web,android,ios,android-typecheck,ios-typecheck,lint}-2026-11-19.log`,
and `output/supplier-checkout-typecheck-2026-11-19.log`.
Final touched-source lint is
`output/supplier-stock-entitlements-lint-final-2026-11-19.log`.
The four checkout/type/query/test files match by SHA-256 between native clients;
all three worktree whitespace checks pass.
The SQL tests are `tests/integrity/supplier-order-checkout.pg.test.js` and
`tests/integrity/supplier-stock-entitlements.pg.test.js`.

Domain, parity, RBAC, production-readiness and regression docs cover these changes.
Remaining leads include non-quote pricing races, precision/rounding, supplier
cutoff timezones, manual-order product/quantity/minimum policy, native manual-order
UI, new quote request phantoms, provider failures and the complete role/plan/device
matrix. Every other open feature row remains within the active objective.

## Supplier calendars and notes - ninth audit stage (2026-11-19)

- **FULL-S48 (high) - Cutoffs ignored supplier timezones.** Delivery resolution
  used the process-local date and clock. Tokyo and Los Angeles fixtures produced
  wrong cutoff decisions, and supplier-local today/default days shifted around
  server midnight. The resolver now uses the supplier timezone, literal calendar
  days and calendar addition. Restaurant price preparation also selects the
  supplier timezone column. Blank/invalid historical settings use the platform
  default; a stored UTC choice uses UTC.
- **FULL-S49 (medium) - Skipped midnight resolved into the preceding day.** The
  shared wall-time conversion oscillated across a DST gap and returned Beirut's
  prior-day 23:00 for a missing local midnight. It now advances through the gap.
  Relative supplier cutoffs use that zoned delivery midnight. Beirut's transition
  and New York's 25-hour day have explicit boundary regressions.
- **FULL-S50 (medium) - Impossible checkout days were accepted.** Both restaurant
  and manual checkout accepted `2099-02-30`, created orders and normalized the day
  silently. Their schemas now reuse the existing strict calendar validator and
  reject before order or reservation writes.
- **FULL-S51 (high) - Price and header days diverged across the cutoff.** After
  the timezone correction, a controlled checkout priced a contract for February 3
  and wrote February 4 when the transaction began after the cutoff. Each supplier's
  preflight delivery resolution is now reused for header insertion. Manual pricing
  and headers share their resolution and return its metadata.
- **FULL-S52 (medium) - Unsupported timezone settings reached date queries.** The
  update schema accepted unknown names, blank values were mapped inconsistently,
  and the web form lacked its existing timezone field. Named zones now validate
  and trim, blank selects the platform default, and reads normalize historical
  invalid settings. The web Business tab exposes the field with English/Arabic
  copy. Migration 0237 clears names absent from PostgreSQL's timezone catalog and
  preserves recognized values. The SQL repair is idempotent.
- **FULL-S53 (medium) - Order delivery days serialized as shifted timestamps.**
  A saved `2099-02-04` returned `2099-02-03T22:00:00.000Z`. Placement, list, detail
  and ordinary update queries now project requested days as text. Tests cover both
  supplier and restaurant readers plus historical null values. Earlier saved
  idempotency response JSON remains a separate compatibility lead.
- **FULL-S54 (medium) - Note-only updates discarded accepted input.** Validation
  and all clients exposed `notes`, but the update builder only wrote status and
  cancellation fields, producing `No fields to update`. Notes now participate in
  the transaction, including empty-string clears, under the existing access checks.

The existing administrator draft-placement path also passes its transaction query
to the remaining routing-feature lookup. Its one-connection HTTP/SQL case passes.
Normal-actor draft admission differs from the shared transition map and requires
broader review of plan, usage, quote, price and delivery rules before changing it.

### Ninth-stage evidence

- Initial helper/settings baseline fails **eight of 19 cases**. The skipped-
  midnight baseline adds the shared conversion failure, with overlapping resolver
  cases. Full checkout baseline fails **five of 22 cases** while prior checks pass.
  After timezone repair, a separate run isolates **one cutoff-boundary failure**
  with correct contract price and a mismatched stored day.
- Serialization baselines reproduce shifted placement timestamps in both paths
  and shifted list/detail days for both actor types. Extending the read workflows
  exposed two actual note-update rejections. The initial read-router mock needed
  a middleware function, and draft placement was corrected to use the existing
  administrator impersonation fixture. These fixture issues are recorded separately
  from the product failures.
- Final checkout HTTP/SQL suite passes **26 cases**. It covers selected/resolved
  contract days, cutoff interleaving, invalid calendar requests, literal/null
  placement/read/update DTOs, note save/clear, legacy timezone repair/idempotence,
  administrator draft placement with one connection, and prior quote/stock/replay
  regressions. Authentication identities, checkout plan inputs and external side
  effects remain fixture boundaries; actual SQL and child-router access logic run.
- Final full isolated PostgreSQL suite passes **173 tests / ten files**. Migration
  0237 was applied to the owned audit database, with one pending migration applied.
  The repository now contains **238 SQL migrations**, reflected in onboarding.
- Focused API suites pass **57 tests / five files**. Final full API passes
  **2,771 tests / 404 files**. A western process-timezone run passes **16 resolver/
  timezone tests**, verifying the same supplier clock/DST expectations.
- Final web checks pass **19 tests / four files**, including the rendered timezone
  form save, orders rendering, quote editing and actual namespace key/interpolation
  parity. The new timezone labels were added with ASCII-safe Unicode escapes.
- Android/iOS pass **34 tests / seven suites per client**. Both Order types expose
  optional delivery-resolution metadata, and hook tests retain original selected
  days plus server-resolved days. Both native typechecks and ERP typecheck pass.
  API/web lint passes with **1,717 existing API warnings and zero errors**. Native
  source/test parity and all worktree whitespace checks are verified separately.
- Earlier stale API route hashes match commit 24345ca2 after EOL normalization.
  Their full subsequent diffs add feature gates, which were reviewed with the
  middleware implementation. Earlier scoped quote locale fields were re-read and
  revalidated by current rendered/copy tests. These reviews preserve the earlier
  partial scopes and their open full-role/feature/runtime matrices.

Baseline logs are `output/supplier-cutoff-{before,midnight-before,workflow-before,boundary-before,response-date-before,order-read-reproduced}-2026-11-19.log`.
Final logs are `output/supplier-cutoff-{full-api,api-focused,postgres-final,migration,western-tz,web-final,android,ios,typecheck,android-typecheck,ios-typecheck,lint}-2026-11-19.log`.
The principal SQL regression is `tests/integrity/supplier-order-checkout.pg.test.js`.
The 1,285-file manifest now has **57 reviewed, 33 partial, 1,195 pending and zero
stale** entries at the recorded hashes.

Migration application in hosted environments, historical replay JSON, complete
manual-order quantity/minimum policy, normal-actor draft activation, all settings
edit/refresh/error cases, native Business UI, precision and provider/device/role/
plan matrices remain unverified. Source inspection counts and
local regressions describe their named coverage.

## Remaining completion gates

Every open feature/source row above, real role/plan/branch/warehouse combinations,
cross-feature transitions and failure/retry behavior still require review and
direct evidence. Prior green suites cannot close those gaps. Hosted environments,
physical devices, external messaging/payment/accounting providers and real-world
delivery behavior have not been established by local module/fixture tests.
No release or live business mutation was performed in this stage.
