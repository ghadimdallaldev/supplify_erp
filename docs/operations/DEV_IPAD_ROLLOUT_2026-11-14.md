# Development iPad repair rollout - 2026-11-14

Target: [Development web](https://app-dev.supplifyerp.com) and its Development API.
This follows the user's clarification that the reported iPad issues were in dev.
The implementation and earlier local verification are documented in
[the November 13 repair report](./IPAD_WEB_REVIEW_2026-11-13.md).

## Scope and source

Deployment uses an isolated source archive based on
`d744d99e29779ff33ed54abefb5d48fc64ee93bd`, with the verified pilot/iPad source
changes overlaid. The archive excludes local credentials, build outputs and
marketing artifacts. No branch was pushed. Source hashes and rollback references
are in `output/dev-verification-2026-11-14/dev-ipad-2026-11-14-v2-source.json`
(initial API/web), `dev-ipad-2026-11-14-v3-source.json` (final web follow-up), and
`dev-ipad-2026-11-14-v4-source.json` (deal database-adapter API follow-up).

Only Development API/web are released. Production, preproduction, Keycloak
configuration and the owner's pending hosted-backup decision are outside this
rollout. Native source parity was verified in the earlier report; no new native
binaries are distributed here.

## Live database and API evidence

Read-only inspection found 428 invoices and 2,394 invoice lines before deployment.
Every invoice has line items and an existing linked order. Thus the observed empty
invoice details/PDF failures were not caused by empty seed invoices.

Using the existing seeded Hamra Bistro owner, authenticated GET requests reproduced
invoice detail/PDF and product detail HTTP 500 responses. The old deals endpoint
returned zero offers while the banner reported nine new offers.

After API deployment `b4c7fc9a-a8e6-4d2c-b0e3-46efcf27e820`:

- Health, readiness, invoice detail and product detail return HTTP 200.
- The sampled invoice has seven lines and downloads a valid 1,974-byte PDF.
- Twenty eligible deals span seven suppliers; all eight current banner offers
  are discoverable. The banner is a recent, undismissed subset, so its count
  need not equal all available deals.
- Reorder assistance returns 22 recommendations. Guest storefront/menu and
  reservation reads succeed; the menu returns 23 items.
- Migration count is 233 and the checkout replay migration is present. Invoice,
  invoice-line, restaurant, supplier and product counts are unchanged.

Evidence: `output/dev-verification-2026-11-14/api-before.json`, `api-after.json`,
`before.json`, `after.json`. These contain no credentials or tokens. Diagnostic
scripts keep sessions in memory and do not create orders, payments or bookings.

## Reservation setup

Hamra Bistro and the other nine seeded restaurants have no reservation tables.
GhadiTestResto has one table and one reservation. The web portal now explains
unavailable online booking for a restaurant without seating capacity and keeps
confirmation disabled. It offers public phone contact when configured.
The configured GhadiTestResto portal returns ten available times for a party of
one on the verification date. No booking was submitted.

## Web rollout and remaining checks

Initial web deployment `d2705cee-941b-4e90-9d68-fcdb8fa2151e` succeeded after API
health and migration application were confirmed. Touch-enabled desktop WebKit
verified invoice detail/PDF download, product detail, deal supplier filtering,
reservation board, both configured/unconfigured public availability, and guest menu.
Live payment controls measure 415 by 40 pixels each; the invoice close icon has
44 pixels of vertical clearance above Make payment. Report controls have equal
heights at 768/1024/1194 pixels; receiving quality has no long decimal strings.
A live reorder recommendation carries quantity one into product detail unchanged.
Signed-out guests are redirected from rewards to their restaurant's account page.

Visual inspection then found compressed Chef picks titles/prices and broken seeded
photo URLs. The final web follow-up uses vertical featured cards, image-error
placeholders and the same preorder/closed mode as the main menu. Payment date and
method labels now target their controls in all payment modes. These are web-only
changes. Six focused menu/booking regressions pass, as do root typecheck, web lint
and production build, captured with exact exit codes in `final-checks.json`.
Final web deployment `641a7c31-1f11-4065-bc25-e7afdaa5e1b1` is healthy. Its live
layout pass records 17 successful checks in `browser-layouts.json`. Chef picks
also pass title/price non-overlap checks at all three tablet widths, preserve
preorder actions and render no broken-image elements.

The subsequent browser pass caught a deal impression HTTP 500. Four restaurant
routes passed the bare query function to an active-boost helper expecting a
database adapter. They now pass `{ query }`. Thirty focused API tests pass,
including four route regressions using the real helper; affected-file lint has
zero errors and 20 existing warnings. No response shape or migration changes.
This repair also covers detail, coupon use and the existing message action;
no live message or coupon action is invoked by verification.
The API follow-up `356738b9-8e3d-4434-a156-12cf358378d6` is healthy. Final live
API checks return HTTP 200 for both organic and sponsored detail (including their
normal view recording), invoice detail/PDF, product detail, discovery/banner,
reorder and the public menu/reservation reads. See `api-final.json`.

The seeded owner is subject to the existing legal reacceptance gate. Browser
layout checks fixture only that account's `legalStatus.needsReacceptance` field
in the fetched session response. Authentication, permissions and business data
remain live. No legal acceptance is submitted, and no deployed guard is changed.
This does not verify the legal acceptance workflow.

Live browser results and screenshots are in
`output/dev-verification-2026-11-14/browser-live.json` and `browser-layouts.json`.
Final runs both pass: the first contains 12 functional checks plus the consent
fixture boundary record; the second contains 17 layout/interaction checks.
Neither final run records runtime errors, failed checks, API HTTP errors or page
overflow. The final deal card view requests succeed after the API adapter repair.
Early harness failures targeted the shell Cart link and both Close buttons;
the harness now scopes those locators to the actual recommendation and close icon.
Automatic deal-view analytics can be recorded while viewing the real pages.
No orders, payments, reservations, customer messages or coupon redemptions are
submitted by the live checks.

Physical iPad Safari validation and an owner-observed real reservation/guest
checkout/rewards receipt remain separate release checks. Automated browser and
database tests do not establish zero bugs or verify every physical iPad control.
