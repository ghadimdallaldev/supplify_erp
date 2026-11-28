# Restaurant V4 workflow tracker

The inventory follows the Restaurant navigator, drawer, Settings, and contextual
links in the paired `design/round-01-home` worktrees. Recorded device results
use Android emulator `emulator-5556` with the Riviera Beirut Hotel owner session
in Development. The accessibility tree and screenshots record the loaded app.

| Workflow                   | Native route and related controls                                                                                     | Implementation | Android visual         | Functional evidence and blockers                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cart and checkout          | `Cart`, quantities, price locks, supplier subtotals, branch and delivery date, review and receipt                     | Implemented    | Visually Verified      | Functionally Verified through review. Added a Coastline catalog item, increased from one to two cases, observed $34.20 become $68.40, and selected Tomorrow. Blocked for order placement, server receipt and uncertain-submit recovery without an isolated order fixture. |
| Receiving queue            | `ReceivingHub`, All, Ready and Waiting                                                                                | Implemented    | Visually Verified      | Functionally Verified with seven eligible orders, the waiting empty state and navigation into a delivered order.                                                                                                                                                          |
| Delivery verification      | `Receive`, quantities, quality, line notes, discrepancy review and saved state                                        | Implemented    | Visually Verified      | Functionally Verified through review. Entered 0 of 6 for one line and marked another Damaged, then saw both discrepancies. Blocked for final submission, inventory write and audit history verification without a disposable delivered order.                             |
| Invoices                   | `Invoices`, status filters, detail sheet and document handoff                                                         | Implemented    | Visually Verified      | Functionally Verified for list, filter and details. The live list showed 93 documents and 31 outstanding. An invoice showed its due date, eight line items, a completed payment, and zero balance.                                                                        |
| Supplier statements        | `InvoiceStatement`, searchable supplier picker, invoice-to-statement link, period controls and currency balances      | Implemented    | Visually Verified      | Functionally Verified for selecting a supplier and changing dates. The marketplace entry for Cedar Fresh Produce returned an empty year-to-date statement despite invoices appearing under that name. The new invoice link passes the exact billed supplier ID.           |
| Reservations               | `Reservations`, date and status controls, `CreateReservation`, existing booking status and table assignment           | Implemented    | Visually Verified      | Functionally Verified for day navigation and opening the guest, party size, date and time form. The test dates had an empty board. Native reservation editing is limited to status and table operations.                                                                  |
| Recipes                    | `Recipes`, ingredients sheet and authenticated edit handoff                                                           | Implemented    | Visually Verified      | Opened the native list and observed its empty state. Blocked for ingredient detail without a recipe in this fixture.                                                                                                                                                      |
| Recipe costing             | `RecipeCosting`, existing cost and margin detail by recipe                                                            | Implemented    | Visually Verified      | Opened the costing summary and empty alerts state. Blocked for populated costs and margins without a costed recipe.                                                                                                                                                       |
| Staff                      | `Staff`, searchable team and role detail, management and schedule handoffs                                            | Implemented    | Visually Verified      | Opened the roster and observed its empty state. Blocked for staff detail without a staff record in the fixture.                                                                                                                                                           |
| Quotes                     | `QuoteRequests`, `CreateQuoteRequest`, `QuoteRequestDetail`, suppliers and products, offer review and cart acceptance | Implemented    | Visually Verified      | Opened the list and observed its empty state. Blocked for a supplier response and acceptance without a quote fixture.                                                                                                                                                     |
| Disputes                   | `Disputes`, `CreateDispute`, `DisputeDetail`, order lines, comments, evidence and resolution status                   | Implemented    | Visually Verified      | Functionally Verified for the list and detail. Opened a real quality dispute with its order link, $28.00 disputed amount and affected order line. Dispute creation and evidence upload remain unverified.                                                                 |
| Contract prices            | `MyPrices`, contract filters, price detail and catalog comparison                                                     | Implemented    | Verified loading state | Drawer navigation opened the screen. The first capture occurred while the API request was loading.                                                                                                                                                                        |
| Delivery locations         | `DeliveryLocation`, branch picker, location form, current coordinates and save                                        | Implemented    | Visually Verified      | Loaded the main delivery pin, coordinates and driver notes. A branch switch, device geolocation and persisted edit remain unverified.                                                                                                                                     |
| Workspace and organization | Workspace sheet from drawer and `Settings`, scoped switch, organization handoff                                       | Implemented    | Visually Verified      | Functionally Verified for opening the picker and seeing the active Primary account. The session grants one account, which blocks switching verification.                                                                                                                  |
| Guest menu                 | `ConsumerMenu`, Restaurant menu and add/edit item form                                                                | Implemented    | Visually Verified      | Opened the empty menu and exercised the Add guard. Item creation requires a category, which the fixture lacked.                                                                                                                                                           |
| Guest orders               | `ConsumerOrders`, status filters and existing fulfillment actions                                                     | Implemented    | Visually Verified      | Loaded the empty order queue and status controls. A guest order ticket is needed to verify fulfillment.                                                                                                                                                                   |
| Guest rewards              | `ConsumerLoyalty`, program settings and configuration                                                                 | Implemented    | Visually Verified      | The workspace displayed Disabled and the program switch. Test coverage is blocked for enabled rates and program changes without a disposable storefront.                                                                                                                  |
| Notification preferences   | `NotificationPreferences`, channels, categories and device registration                                               | Implemented    | Visually Verified      | Loaded the channels and order activity settings. Android displayed a retry action after the QA build's FCM registration failed. Remote delivery remains blocked.                                                                                                          |
| Subscription               | `Subscription`, current plan and entitlements, billing handoff                                                        | Implemented    | Visually Verified      | Functionally Verified for the live Restaurant Scale plan and the returned mobile capabilities. Billing navigation and other plans remain unverified.                                                                                                                      |
| Account deletion           | `DeleteAccount`, eligibility, retry and confirmation                                                                  | Implemented    | Visually Verified      | Functionally Verified for the live owner eligibility check. The screen required transfer or closure of the organization and offered the existing web action. Final deletion requires a disposable eligible account.                                                       |
| Restricted-role navigation | `Tabs/More` fallback and `MoreGroup`                                                                                  | Implemented    | Blocked                | The owner session opens the V4 drawer. A Restaurant session with only the More tab is needed to exercise the full-page menu.                                                                                                                                              |

## Existing browser workflows

- The Staff workspace owns invitations, role and permission editing, scheduling,
  and payroll. Organization owns branch creation and organization administration.
- Recipe edits, secure dispute evidence upload, billing, and advanced guest
  management open their existing web destinations. Android/iOS preserve the
  existing session boundaries for those destinations.
- Both native clients continue to use the existing order, receiving, finance,
  reservation, and workspace APIs and permission gates. Dispute creation now
  uses the camel-case fields accepted by the current API.

## Regression and verification

- Android navigation reached the Home shell, drawer, floating menu, Suppliers,
  supplier Catalog and Quick Lists. A stale seeded list returned the existing
  unavailable-items response when adding its products to the cart.
- Previously redesigned screens are Home, Suppliers, Catalog, Orders, Chat,
  Notifications, Assistant, Inventory, Reports, Quick Lists, Settings and Deals.
  Their nested routes include `HomeSearch`, `OrderDetail`, `ChatThread` and
  `QuickListDetail`.
- The final implementation passed `pnpm typecheck` in ERP, Android, and iOS.
  The focused native test pass covered 21 tests per platform across cart state,
  quantity and currency, drawer gates, reservation board and localization.
  All 32 changed native files matched by SHA-256 in the two worktrees.
- Thirty-seven existing ERP receiving, invoice, payables and dispute tests passed.
  A further 26 checkout tests passed after applying 238 migrations to a
  disposable local PostgreSQL database. These exercised the checkout API and
  database, including existing price, quote and idempotency behavior.
- A clean Android x86_64 Gradle release build and an incremental final-source
  build passed from an isolated short-path checkout. Early captures used the
  existing debug-signed emulator APK with a fresh Expo production-mode bundle.
  Later captures used the Gradle APK. The iOS Expo export passed. Running the
  native iOS app requires a simulator or device unavailable on this Windows host.
- At 335 dp and 135% Android font scaling, the receiving summary, filters and
  wrapped supplier names remained readable. Switching the app to Arabic showed
  right-aligned labels and mirrored field order in the delivery form. The test
  exposed a clipped location name, which was changed to wrap. Accessible names
  were checked in Android's UI hierarchy. TalkBack remains untested.

## Android captures

The [before](../../design-audit/mobile/round-08-restaurant-workflows/before-contact-sheet.jpg)
and [after](../../design-audit/mobile/round-08-restaurant-workflows/after-contact-sheet.jpg)
contact sheets are local artifacts. The cart pair uses an empty baseline and
a real catalog product in the updated app. Receiving captures include the
waiting filter, the delivered order, the quality picker and discrepancy review.
