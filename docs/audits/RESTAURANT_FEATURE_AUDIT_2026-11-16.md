# Restaurant feature audit — 2026-11-16

Status: source verification and the documented Development walkthrough passed.
Target is Development, as selected by the user.
Account: the user-provided seeded Riviera restaurant owner. An initial Hamra
account required updated legal consent; that gate was retained, and no agreement
was accepted on the user's behalf. The prior dashboard redesign remains reverted.

## Confirmed defects and corrections

| ID   | Feature                        | Reproduction and correction                                                                                                                                                                                                                                                              |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Order placement retry          | Real concurrent PostgreSQL submissions hit the legacy restaurant/key unique constraint, despite actor/key conflict handling. Claims now handle both constraints before replaying the original result.                                                                                    |
| R-02 | Inventory / waste intelligence | Development weekly-summary returned 500. `WINDOW` was used as an unquoted SQL identifier; it is now `period_window`. Real waste and weekly-summary queries execute against PostgreSQL.                                                                                                   |
| R-03 | Inventory / expiry reorder     | The live Inventory route crashed on `undefined.localeCompare`. Lot mapping read `productName` although expiry lots expose `itemName`. The mapper and a defensive web sort/display fallback are corrected.                                                                                |
| R-04 | Orders counterparty            | Restaurant lists showed the restaurant's own name instead of the purchased supplier. Restaurant-scoped list responses now project supplier names; the table and phone card show the proper counterparty. Supplier views retain customer names.                                           |
| R-05 | Orders currency                | Both web list layouts hardcoded `$`. They now format the stored order currency; EUR regressions cover both layouts.                                                                                                                                                                      |
| R-06 | Supplier details               | Restaurant visitors triggered an unused supplier-only `/api/restaurants` query and received 403. The unused hook invocation and import are removed.                                                                                                                                      |
| R-07 | Order pagination               | Creation time alone did not define stable boundaries for orders with identical timestamps. The ID is now the tie-breaker, verified with equal-timestamp rows in PostgreSQL.                                                                                                              |
| R-08 | Waste entry                    | The API accepts restaurant waste/spoilage/count corrections, while the old database check only allowed supplier `IN`/`OUT`. New migration `0235` permits the existing restaurant values and still rejects unknown types. Recorded-waste tests failed before migration and pass after it. |

A separate flaky-test defect was identified: a storage test rejected any random
opaque upload token containing the characters `s3`. It now checks the gateway
hostname; the existing strict gateway URL/path assertion is retained. Storage
product behavior is unchanged.

## Per-feature verification matrix

Live checks are authenticated browser/API reads and local cart operations. Business
mutations that can notify suppliers, move stock, record money, or create bookings
are tested in isolated fixtures or the existing API suites, not submitted against
the Riviera account. Opening a page or form is recorded as such; it is not proof
of a completed business transaction.

| Feature              | Development checks                                                                            | Automated / isolated checks                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orders               | Pagination forward/back, order-reference search, detail timeline/details/items, status filter | Retry concurrency, payload conflict, stock competition, split orders, rollback, drafts, cancellation, tenant-scoped list; order route/quantity/status suites |
| Products             | Catalog, product detail, add to cart, supplier filter                                         | Products/detail page suites, catalog access, quantity and pricing rules                                                                                      |
| My prices            | Supplier tabs and filters                                                                     | Contract pricing / price resolution API suites                                                                                                               |
| Ordering lists       | List/detail and transfer to local cart                                                        | Quick-list cart, branch validation, schedule and ordering API suites                                                                                         |
| Cart                 | Quantity increment/decrement, removal, empty state, list transfer                             | Currency grouping, quote locks, quantity validation, supplier stock and retry transactions                                                                   |
| Quote requests       | List/empty state and new request form; no live comparison record                              | Quote request create/response/decline/access API suites                                                                                                      |
| Receiving            | Pending/history, delivery form, order link                                                    | Receiving validation, duplicate receipt/invoice protection, warehouse integrity suites                                                                       |
| Suppliers            | List/detail, catalog links, relationship controls visible                                     | Tenant/organization supplier access, reviews and blocklist API suites                                                                                        |
| Reports              | Eight report tabs and actual CSV download/header                                              | Report-response, aggregation, waste and finance API suites                                                                                                   |
| Disputes             | List and existing dispute detail                                                              | Eligibility, lifecycle, credits and replacement-order API suites                                                                                             |
| Deals                | Eligible deals and supplier controls                                                          | Discovery, redemption limits, pricing, quote-lock and promotion rollback suites                                                                              |
| Price intelligence   | Page and evidence/empty states                                                                | Deterministic price-change and restaurant intelligence suites                                                                                                |
| Invoices             | Dashboard/list, supplier/date filtering, detail, valid PDF bytes                              | Balances, payment/status rules, receiving-linked invoicing and payables suites                                                                               |
| Chat                 | Inbox, existing conversation, enabled composer; no message sent                               | Chat access, realtime authorization and notification suites                                                                                                  |
| Recipe costing       | Dashboard and empty states                                                                    | Real recipe cost creation/recalculation plus unit/conversion and price-impact suites                                                                         |
| Recipes              | List/empty state and builder form; no live recipe detail record                               | Recipe CRUD/cost engine and tenant isolation                                                                                                                 |
| Inventory            | Stock/waste/history/expiry/totals tabs; weekly summary 200; 29 named reorder suggestions      | Real waste, weekly-summary and expiry/reorder SQL, stock and inventory import suites                                                                         |
| Settings / profile   | Profile, team, branches, activity, reviews                                                    | Auth, branch scope, role and entitlement suites                                                                                                              |
| Reservations         | Calendar day/week/month and waitlist                                                          | Policy, capacity, availability, branch ownership and reservation route suites                                                                                |
| Staff                | Calendar/team directory and attendance entry views                                            | Staff routes, shift windows, portal access and payroll/labour suites                                                                                         |
| Guest menu           | Menu and fulfillment views                                                                    | Consumer menu, availability and ordering-hours suites                                                                                                        |
| Guest orders         | All/received/preparing/ready views                                                            | Consumer checkout, status, idempotency and currency suites                                                                                                   |
| Guest rewards        | Program and earn/redeem controls                                                              | Loyalty ledger, redemption and consumer reward suites                                                                                                        |
| Dashboard / calendar | Metrics, 7/30/90-day spend periods; month/week/day/agenda calendar views                      | Dashboard role metrics, period controls and calendar API suites                                                                                              |

## Evidence and gates

- API baseline: **396 files / 2,610 tests passed**.
- Web baseline: **162 files / 621 tests passed**.
- The feature-to-test inventory check passes for all **26 inventory entries**;
  this checks linked files, not completeness of their assertions.
- Final API suite: **396 files / 2,610 tests passed**.
- Final web suite: **163 files / 625 tests passed**.
- PostgreSQL integrity suite: **43 tests passed**, including 20 restaurant checks.
- All **236 migrations** pass fresh installation; migration `0235` also passes an
  upgrade from the preceding 235-migration schema.
- Focused native checkout compatibility: **11 tests per platform** passed.
- Root and both native typechecks pass. Web lint has no errors or warnings; API
  lint has no errors and retains 41 existing unused-import/variable warnings in
  the changed legacy files. Web production build passes.
- Development post-release page sweep: **24 areas at 1440px and 390px** (48 visits).
  No console/page errors, caught route crashes, failed hosted requests, or document
  overflow were recorded.
- **38 deeper checks passed**, covering nested tabs, pagination, search, details,
  local cart operations, entry forms, chat composer, chart/calendar controls,
  filters, and PDF/CSV downloads. No live purchase, receipt, recipe, quote,
  payment, booking, or message was submitted.
- The corrected weekly-summary and reorder-assistance endpoints return 200;
  all 29 returned reorder suggestions have names. Supplier detail no longer
  triggers the unused forbidden restaurant query.

## Development release

- ERP source: `206c4622286520ad1cbb959c552a2f4d6aa10283` on `dev`.
- Android parity: `d55333ee69be225c7b6ae9db3fe6de7f8d7cdc9c` on `dev`.
- iOS parity: `075ea9bfcfe43c70a5e3104f108d150bb8160f1c` on `dev`.
- API deployment: `a375ae1a-fc42-462a-9c01-9663cbc3ac25` (SUCCESS).
- Web deployment: `fd4c1ca8-1c0d-4be8-aa51-84275af25e8d` (SUCCESS).
- API startup logs confirm migration `0235` and migration completion. Both API
  and web have one healthy replica and no pending work or active service issues.

Evidence lives in `output/restaurant-audit-2026-11-16/`; the committed
`verification-summary.json` contains the aggregate results. Detailed captures and
logs remain local. Scripts retain sessions in
memory, never write tokens, and use the existing seeded login password through
the seed-data module. `scripts/qa/restaurant-audit-db.mjs` creates an owned,
disposable localhost-only PostgreSQL container. No business records are copied
from hosted databases. Existing SQL migrations are unchanged; migration `0235`
adds the compatible inventory-adjustment constraint correction.

Native parity: nullable `Order.supplier_name` and concurrent checkout regressions
are mirrored in Android and iOS. Existing native order lists already consume the
supplier field and currency. No native UI redesign or binary release is involved.

## Scope limits

This record establishes the checks listed above, not an absolute absence of bugs.
It does not certify every plan/role/branch combination, payment provider, physical
device, offline session, or external notification channel. Recipe and quote detail
coverage needs isolated fixtures where the selected live tenant has no records.
Production and preproduction are outside this Development audit. Live business
transaction receipts and external-delivery checks remain distinct from mocked or
database-level verification.
