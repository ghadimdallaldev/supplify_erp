# Supplier dynamic workflow audit - 2026-11-17

Supplier API, web and sibling Android/iOS sources were checked with executable
regressions and real PostgreSQL fixtures. Three additional defects were reproduced
and corrected. Existing uncommitted run-sheet/accounting changes from the
[2026-11-16 audit](./SUPPLIER_FEATURE_AUDIT_2026-11-16.md) were preserved and included
in the regression runs. No deployment or live business mutation was performed in
this session.

## Confirmed bugs and corrections

| ID    | Problem before the fix                                                                                                                                                                                                                                                    | Corrected behavior and evidence                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SW-01 | Export filters converted local midnight/end-of-day to UTC and then truncated the timestamp. A June 1 start could become May 31; impossible dates such as February 30 and repeated query values were also accepted.                                                        | Valid `YYYY-MM-DD` values stay literal. Both endpoints are inclusive, with a 366-calendar-day limit independent of DST. Six new date regressions failed before correction; all 14 accounting tests pass afterward.                                                                                                                                                                                       |
| SW-02 | Each top-debtor currency row selected its reminder invoice from a restaurant-only map of the 100-row invoice preview. An EUR balance could point to a USD invoice, and customers outside the preview could lose their reminder target.                                    | PostgreSQL selects the oldest open invoice per restaurant and currency across the full group, with stable tie breaking. A real fixture with 102 invoices reproduced the incorrect EUR target and now passes.                                                                                                                                                                                             |
| SW-03 | Both native receivables screens typed the supplier payload as restaurant invoices. They read nonexistent snake_case fields and nonexistent total/count properties, resulting in blank invoice amounts and a zero total. They also relied on the delayed `OVERDUE` status. | Both repos mirror the canonical camelCase response, full unpaid count, nullable monetary totals and currency groups. Invoice amounts/dates/numbers and supplier-calendar overdue flags render directly. The overdue tile displays an amount because the API has no overdue count. Three rendering tests failed before correction; four screen tests and four currency tests pass per platform afterward. |

## Dynamic workflow coverage

The localhost-only disposable audit database is guarded by its database name,
container ownership label and loopback hostname. Existing integrity suites use
real transactions with mocked external identity/notifications/cache boundaries.

- Supplier command center, daily run sheet, pick queue, calendar aging, mixed
  currency receivables, invoice/payment/AR/QuickBooks exports and intelligence SQL.
- Customer import retry/deduplication, loyalty tenant isolation and supplier order
  list ownership.
- Order placement, supplier splitting, rollback, concurrent final-stock purchases,
  idempotent retries, cancellation stock restoration and currency separation.
- Warehouse reservation races, stock-adjustment invariants, transfer/deactivation,
  branch/tenant isolation, revoked memberships, scoped HTTP reads and event access.
- Existing API route/service tests cover supplier order actions, inventory,
  fulfillment, driver dispatch/POD/GPS, pricing, quote responses, promotions,
  invoices/payments and customer growth. Existing web regressions cover supplier
  navigation, forms, permissions and responsive components.

These are automated fixture/module checks; they do not represent a new hosted
browser walkthrough or physical-device validation.

## Verification

| Check                           | Result                                                                                                                           | Local evidence                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| API suite after corrections     | 396 files / 2,618 tests passed                                                                                                   | `output/supplier-api-final-2026-11-17.log`                                                           |
| Web suite                       | 164 files / 629 tests passed                                                                                                     | `output/supplier-web-2026-11-17.log`                                                                 |
| PostgreSQL integrity suites     | 3 files / 67 tests passed                                                                                                        | `output/supplier-postgres-final-2026-11-17.log`                                                      |
| Focused API checks              | 4 files / 28 tests passed                                                                                                        | `output/supplier-focused-2026-11-17.log`                                                             |
| Export timezone matrix          | 14 accounting tests passed in each of UTC, Asia/Beirut, America/Los_Angeles and Pacific/Kiritimati using separate fork processes | `output/supplier-calendar-*-2026-11-17.log`                                                          |
| Android rendering + currency    | 2 suites / 8 tests passed                                                                                                        | `output/supplier-android-final-2026-11-17.log`                                                       |
| iOS rendering + currency        | 2 suites / 8 tests passed                                                                                                        | `output/supplier-ios-final-2026-11-17.log`                                                           |
| ERP, Android and iOS typechecks | Passed                                                                                                                           | `output/supplier-typecheck-2026-11-17.log`, `output/supplier-{android,ios}-typecheck-2026-11-17.log` |
| API/web lint                    | Passed; API retains its existing warning backlog                                                                                 | `output/supplier-lint-2026-11-17.log`                                                                |

The initial simultaneous full API/web run hit two API import/hook timeouts.
Both affected suites passed in the focused run, and the subsequent full API run
passed. There was no assertion failure associated with those timeouts.

To rerun the SQL workflows against this audit's existing isolated container:
`node scripts/qa/supplier-audit-db.mjs test`. For a fresh isolated instance use the
helper's documented `start`/`test`/`stop` lifecycle after inspecting any existing
audit metadata. No migration, permission key, feature key or environment variable
was introduced.

## Mobile parity and limits

Both sibling clients received the same response types, screen correction and
rendering tests. The existing API response shape is unchanged. Neither native
client calls the supplier accounting export endpoints, so the calendar-filter
correction needs no native export adapter. See the dated
[mobile parity log](../mobile/MOBILE_FEATURE_PARITY.md).

No new customer reminders, payments, invitations or other live business actions
were sent. Hosted deployment, physical devices, external notification delivery
and accounting-provider imports remain unverified. Passing these checks does not
establish that the entire codebase is free of defects.
