# Supplier feature audit - 2026-11-16

Status: source corrections verified in focused checks; final suites and Development
release verification are in progress. Development remains the selected environment.
The seeded Cedar Fresh supplier owner is the live QA account. No legal agreements
were accepted, and no live orders, stock adjustments, payments, reminders,
invitations, messages, or sponsorships were submitted.

Repository verification and additional corrections were recorded in the
[2026-11-17 workflow audit](./SUPPLIER_WORKFLOW_AUDIT_2026-11-17.md). That follow-up
does not establish a Development deployment or hosted/device verification.

## Confirmed corrections

| ID   | Area                                   | Defect and correction                                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Run sheet pick queue                   | Both SQL paths referenced driver assignment dates without joining that table. Errors were swallowed into an empty queue. Both queries now include the schema-aware join; a real prepared-order fixture must appear in the queue.                                                        |
| S-02 | Run sheet money                        | Collection totals added USD and EUR into one amount, and web/native displays assumed dollars. Totals now include currency groups, mixed totals are null, and all three clients display the currencies on totals and invoice rows. KPI types also reflect the existing nullable amounts. |
| S-03 | Run sheet date selection               | Overdue days were copied from today's receivables even when another run date was selected. Date-only comparisons and overdue days now use the selected calendar date without server timezone conversion.                                                                                |
| S-04 | Accounting export dates                | PostgreSQL DATE objects were serialized as JavaScript timestamps in invoice, QuickBooks, and payment CSVs. The existing calendar-date formatter now produces YYYY-MM-DD.                                                                                                                |
| S-05 | Accounting export currencies and aging | AR CSV summed different currencies for the same customer and aged balances using the database day. It now groups by currency and uses the supplier's local day. General invoice/payment/AR exports append a Currency column.                                                            |
| S-06 | Legacy invoice export                  | A header-only invoice exported a zero QuickBooks amount despite a positive invoice total. The fallback line now uses the stored invoice total. QuickBooks column layout is retained.                                                                                                    |

The database ownership trigger correctly rejects a mixed-supplier order item.
That exploratory case is recorded as a passing security guard, not a product bug.
The customer import template uses readable column names; its initial walkthrough
assertion was corrected to match the actual template.

## Feature verification

Page checks cover 1440px and 390px viewports. Deeper checks open tabs, forms and
details and exercise filters/downloads without submitting business mutations.

| Area                    | Development checks                                                                                                 | Automated / isolated coverage                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Orders                  | Pagination, reference search, details and nested tabs                                                              | Supplier-scoped list, ownership trigger, existing status/decline/fulfillment suites         |
| Products and categories | Catalog/detail; new product, category, CSV and image import dialogs                                                | Product/import/image/stock suites                                                           |
| Contract pricing        | Existing prices and new contract dialog                                                                            | Pricing resolution, quantity/discount rules and contract suites                             |
| Fulfillment             | Dispatch, pick lists, routes, tracking, exceptions                                                                 | Existing warehouse transaction, assignment, dispatch, POD, GPS and route suites             |
| Inventory               | Stock view, warehouse view, adjustment dialog                                                                      | Stock/reservation and warehouse integrity suites                                            |
| Run sheet               | Page, date controls, pick queue and receivable projection                                                          | Real PostgreSQL queue, calendar aging and multi-currency regressions                        |
| Customers               | Grid/list and existing customer detail                                                                             | Supplier/customer access and order-list isolation                                           |
| Quote inbox             | List/empty states; no live response fixture                                                                        | Quote request/response/decline/access suites                                                |
| Disputes                | Incoming dispute list                                                                                              | Eligibility, resolution permission and lifecycle suites                                     |
| Customer growth         | Page and example CSV download                                                                                      | Real import deduplication per supplier; no invitations created; growth/sponsorship suites   |
| Reports                 | Six report tabs and CSV download                                                                                   | Aggregation, fulfillment and finance suites                                                 |
| Deals                   | Status views and new deal form                                                                                     | Promotion eligibility, redemption, boost and rollback suites                                |
| Loyalty                 | Program and balances                                                                                               | Real program tenant isolation; earn/redeem/ledger suites                                    |
| Invoices                | Receivables, invoice detail, valid PDF and payment form                                                            | Real currency totals, supplier isolation, CSV date/amount/aging regressions; payment suites |
| Chat                    | Existing conversation and enabled composer                                                                         | Chat authorization and notification suites; no message sent                                 |
| Settings                | Profile, contacts, team/roles, business, warehouses, zones, drivers, branches, notifications, plan/usage, activity | Existing auth/RBAC, branch, warehouse and entitlement suites                                |
| Dashboard               | Analytics, recent orders, calendar                                                                                 | Existing metrics/calendar suites                                                            |
| Command center          | Priorities and all intelligence panels                                                                             | Real SQL aggregation and all five weekly intelligence sources                               |

## Verification and release

- Baseline: 18 areas at both viewport widths, with no page errors, caught route
  crashes, failed hosted requests or document overflow.
- Focused API: 9 tests passed. Focused web currency formatting: 4 tests passed.
- Native currency regressions: 4 tests per platform passed.
- Fresh disposable PostgreSQL applied all 236 migrations. The integrity suite
  includes restaurant and warehouse regressions alongside the new supplier cases.
- Final suite counts, typechecks, build, lint, source commits and Development
  deployment results will be recorded after the release checks.

Reproduce isolated SQL checks with `node scripts/qa/supplier-audit-db.mjs start`,
then `node scripts/qa/supplier-audit-db.mjs test`, and finally
`node scripts/qa/supplier-audit-db.mjs stop`. The helper validates a localhost-only
target and an ownership label before testing or removing its container. Credentials
remain outside the repository. Redis, notifications and external delivery are
isolated in the database tests. No migrations or permission/feature keys changed.

Android and iOS receive the run-sheet nullable money/currency-group types, currency
formatting and screen changes, with mirrored regression tests. Accounting downloads
are opaque files in native clients; the appended CSV fields do not require parsers.
See the dated [mobile parity entry](../mobile/MOBILE_FEATURE_PARITY.md).

## Scope limits

The results establish the checks listed here, not an absolute absence of defects.
The owner account does not certify every plan/role/warehouse/branch combination.
Live quote-response fixtures are absent. Physical devices, offline sessions,
external notification delivery and real payment/accounting-provider imports remain
unverified. Business mutations are exercised in isolated tests or existing API
suites. Production and preproduction are outside this audit.
