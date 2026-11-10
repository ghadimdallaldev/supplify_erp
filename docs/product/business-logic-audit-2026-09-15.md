# Supplify ERP — Product and Business Logic Audit

**Prepared:** 2026-09-15  
**Purpose:** Print-ready briefing for shareholder questions  
**Scope:** Repository-wide product, business-logic, data, workflow, monetization, and opportunity study  
**Method:** Read the supplied brief, then inspected the API routes/services, SQL migrations, web routes/components, existing product documentation, automated-job registry, and the Android/iOS parity records.  
**Implementation rule:** No product or application code was changed for this study.

## How to use this document

This document is written as a shareholder briefing, not as an engineering specification. It answers four questions:

1. What does Supplify actually do today?
2. What business process and data does it control?
3. Where is the product still manual, disconnected, or risky?
4. What should be built next to create measurable business value?

The most important discipline is to separate:

- **Implemented:** the API, database, and user surface support the workflow.
- **Partial / foundation:** some real capability exists, but the end-to-end promise is incomplete.
- **Data exists, opportunity remains:** Supplify records the inputs needed for a stronger product, but does not yet turn them into a closed-loop action.
- **Deferred / external:** the idea depends on a future integration, deployment credential, or product decision.

Primary evidence includes `apps/api/src/server.js`, `apps/api/src/routes/`, `apps/api/src/services/`, `apps/api/db/migrations/`, `apps/web/src/App.tsx`, `apps/web/src/pages/`, `apps/web/src/services/api/`, `docs/product/feature-catalog-full.md`, `docs/product/feature-catalog-technical.md`, and `docs/features/`.

---

## 1. Executive Product Summary

### The one-sentence answer

Supplify is a multi-tenant operating system for restaurant purchasing and supplier fulfillment: it connects restaurants and suppliers, resolves the right price, places and tracks orders, reserves and delivers stock, records receiving and disputes, creates invoices, and gives each side operational, inventory, financial, and relationship tools.

### What problem it solves

Restaurant supply is usually managed through fragmented channels: phone calls, WhatsApp messages, spreadsheets, supplier price lists, paper delivery notes, manual stock counts, and separate accounting records. Supplify brings the commercial transaction and its operational consequences into one system.

The central business loop is:

```text
Restaurant need
   -> supplier discovery / relationship
   -> catalog, contract, quote, or deal price
   -> cart and order
   -> supplier stock reservation and fulfillment
   -> driver route, GPS, and proof of delivery
   -> restaurant receiving and quality reconciliation
   -> invoice, payment, dispute, credit, or replacement
   -> inventory, recipe cost, reorder, and supplier performance insight
```

### What Supplify is today

| Area                   | Current reality                                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2B marketplace        | Real supplier catalog, restaurant discovery, follow/block relationship, RFQs, deals, contract pricing, cart, checkout, and split-by-supplier ordering.                                                                                                                                                    |
| Order operating system | Strong transactional core with server-side price resolution, quantity rules, stock reservation, idempotency, audit events, notifications, and state transitions.                                                                                                                                          |
| Supplier operations    | Catalog, customer pricing, inventory, warehouses, fulfillment board, routes, drivers, GPS, POD, failed-delivery retry, receivables, customer growth, and command center.                                                                                                                                  |
| Restaurant operations  | Purchasing, receiving, inventory, lots/expiry, waste, reorder assistance, quick lists, recipes/costing, invoices/payables, reservations, staff, and consumer ordering.                                                                                                                                    |
| Finance                | Operational accounts receivable/payable recordkeeping, invoices, payments, credit notes, aging, reminders, and exports. It is not yet a complete payment-collection or accounting-reconciliation platform.                                                                                                |
| Consumer channel       | Optional public restaurant menu, modifiers, COD ordering, receipt tracking, diner accounts, reviews, and loyalty. This is a separate B2C loop, not the same order model as B2B.                                                                                                                           |
| Intelligence           | Deterministic reorder calculations, cached forecasts, recipe cost impact, dashboards, and a read-only AI assistant exist. The product is not yet a fully closed-loop autonomous purchasing copilot.                                                                                                       |
| Monetization           | Restaurant Growth $49/month or $490/year; Restaurant Scale $149/month or $1,490/year; Supplier Growth $149/month or $1,490/year; Supplier Scale $349/month or $3,490/year, plus selected add-ons. Billing is currently manual/stub-provider capable; live recurring PSP automation remains external work. |

### The strongest shareholder answer

> “Supplify owns the workflow from a restaurant deciding what it needs through a supplier delivering it and the restaurant accepting, disputing, and paying for it. That gives us transaction data, operational data, and relationship data in one place. The next value step is to connect those data sets so the platform does more of the decision work proactively.”

### The honest maturity statement

Supplify has more than a catalog and ordering page. It has a genuine transaction backbone with database transactions, row locks, quantity/MOQ validation, price snapshots, stock reservation, multi-supplier cart splitting, receiving, invoicing, and auditability. The main product gap is not the absence of modules; it is the incomplete connection between modules.

The most important gaps are:

- multiple parallel status systems make the order lifecycle harder to explain;
- receiving, invoice, payment, dispute, and credit are not yet one clean reconciliation timeline;
- branch, organization, warehouse, and supplier-tenant concepts require careful explanation;
- many decisions still depend on a human operator;
- finance is mostly a ledger and reminder workflow rather than embedded payment collection;
- central purchasing is explicitly only a foundation;
- premium feature strings such as advanced reporting, developer APIs, and full central purchasing are not all differentiated by implementation;
- B2B recipes, B2C menus, sales demand, and procurement are separate data models;
- AI answers are read-only and do not execute approved actions.

### Short answers to predictable shareholder questions

| Question                             | Answer                                                                                                                                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is this a marketplace or an ERP?     | Both, with the B2B transaction joining them. The marketplace brings suppliers and restaurants together; the ERP records what the restaurant buys, receives, stores, wastes, costs, and pays.                                                               |
| Who pays?                            | Restaurants pay $49/$149 monthly depending on scale; suppliers pay $149/$349. Add-ons and sponsored onboarding can add revenue.                                                                                                                            |
| What is the moat?                    | The cross-party operational record: price snapshot, order, warehouse reservation, route, delivery proof, receiving discrepancy, invoice, payment, dispute, and reorder history. A simple storefront does not own that chain.                               |
| What is live versus a vision?        | Ordering, fulfillment, receiving, finance records, dashboards, notifications, and deterministic reorder tools are live. Autonomous purchasing, full central purchasing, live accounting/PSP reconciliation, and action-taking AI are future opportunities. |
| What is the biggest commercial risk? | Selling a plan promise that is represented in a feature catalog but not differentiated in the actual workflow, especially central purchasing, advanced reports, full API integrations, and live recurring billing.                                         |
| What is the best next investment?    | A unified exception and recommendation layer that turns existing transaction, inventory, delivery, price, finance, and recipe data into prioritized actions with approvals.                                                                                |

---

## 2. Actors and Roles

### External and platform actors

| Actor                                 | Job in the business                                                                                          | Main permissions or boundaries                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform administrator                | Operates the Supplify platform, plans, tenants, support, growth programs, overrides, health, and audits.     | `ADMIN_ACCESS` plus narrower admin permissions such as `ADMIN_TENANTS`, `ADMIN_PLANS`, `ADMIN_FINANCE`, `ADMIN_GROWTH`; impersonation is time-limited and audited. |
| Restaurant owner / organization owner | Owns restaurant business access, branches, team, purchasing policy, finance, and customer-facing operations. | Full tenant or organization scope; owner protections prevent removal of the last owner.                                                                            |
| Restaurant manager                    | Runs daily restaurant operations.                                                                            | Orders, receiving, inventory, reservations, staff, chat, recipes, and selected settings.                                                                           |
| Purchaser                             | Sources and places supplier orders.                                                                          | Orders create/edit, catalog view, inventory view, chat, recipe editing; typically no finance management.                                                           |
| Receiving staff                       | Checks deliveries and records actual quantities/quality.                                                     | Orders view plus receiving view/manage.                                                                                                                            |
| Restaurant accountant                 | Controls invoices, payments, credits, payables, and accounting records.                                      | Invoice/payment management and order visibility; recipe cost visibility.                                                                                           |
| FOH staff                             | Manages reservations and front-of-house context.                                                             | Reservation create/edit/view; limited recipe visibility.                                                                                                           |
| Restaurant viewer                     | Reads operational information without changing it.                                                           | Read-only workspace permissions.                                                                                                                                   |
| Supplier owner / organization owner   | Owns supplier commercial and operational decisions.                                                          | Full supplier tenant or organization scope.                                                                                                                        |
| Supplier manager / sales manager      | Manages incoming orders, customers, catalog, pricing, fulfillment, and growth.                               | Orders, catalog, inventory, fulfillment, warehouses, chat, promotions, growth.                                                                                     |
| Catalog manager                       | Maintains products, SKUs, images, categories, and prices.                                                    | Catalog and inventory editing.                                                                                                                                     |
| Warehouse manager                     | Controls stock location, picking, transfers, and fulfillment execution.                                      | Warehouse, inventory, fulfillment, and order view/manage.                                                                                                          |
| Order fulfillment staff               | Picks, packs, prepares, and dispatches orders.                                                               | Order edit, fulfillment manage, inventory view, warehouse view, receiving view.                                                                                    |
| Supplier driver                       | Executes assigned delivery legs, sends GPS, updates delivery status, and captures POD.                       | Own linked delivery assignments and driver-delivery permissions only.                                                                                              |
| Supplier accountant                   | Issues invoices, records payments, monitors receivables, exports records.                                    | Finance permissions.                                                                                                                                               |
| Supplier viewer                       | Reads supplier information.                                                                                  | Read-only supplier permissions.                                                                                                                                    |
| Public restaurant guest               | Books a table, joins a waitlist, manages a reservation, and leaves a reservation review.                     | Token-based public actions; no tenant access.                                                                                                                      |
| Consumer diner                        | Browses a restaurant menu and may order as guest or member.                                                  | Public storefront; optional restaurant-scoped diner account and loyalty.                                                                                           |
| Operational staff portal user         | Clocks in/out, sees shifts, requests PTO/swaps, acknowledges announcements, and views own documents.         | `STAFF_PORTAL`; explicitly blocked from the main ERP app and manager APIs.                                                                                         |
| Invited team member                   | Joins one restaurant/supplier workspace or branch through an invitation.                                     | Access determined by assigned tenant/org role; one active workspace per user is enforced.                                                                          |

### Role architecture

Supplify has three overlapping access layers:

1. **Keycloak identity:** authentication, refresh, logout, email OTP, and user lifecycle.
2. **Tenant membership and role:** restaurant, supplier, staff portal, or admin context.
3. **Permission and feature entitlement:** RBAC keys such as `ORDERS_MANAGE`, plan feature keys such as `fulfillment`, and usage limits such as `orders_per_day`.

Tenant permission resolution merges newer named-role records with legacy role records so migration does not accidentally remove existing access. Permission results are cached for five minutes and invalidated when roles change.

### Shareholder interpretation

The actor model is unusually deep for a small ERP: purchasing, warehouse, driver, receiving, accounting, FOH, operational staff, supplier growth, and platform admin are separate personas. That is a strength for workflow depth, but it increases training, permission, navigation, and product-explanation costs.

---

## 3. Product Map

### Product architecture by business layer

| Layer                 | Restaurant side                                                                 | Supplier side                                                                   | Shared / public layer                                                  |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Identity and account  | Restaurant signup, activation, branches, team, roles, staff portal              | Supplier signup, activation, branches, org roles, drivers                       | Keycloak, sessions, invitation links, tenant context, admin support    |
| Relationship          | Supplier discovery, follow/block, reviews, RFQs                                 | Customer list, imported prospects, connection requests, sponsorship             | Chat, notifications, audit, files                                      |
| Commercial            | Catalog browsing, contract prices, deals, cart, quote locks, loyalty redemption | Catalog, prices, customer-specific contract prices, deals, quote inbox, loyalty | Price resolver, promotion engine, order snapshots                      |
| Transaction           | Place orders, schedules, quick lists, amendments, receive, dispute              | Accept/decline, fulfill, pick, route, deliver, invoice, collect                 | Order lifecycle, idempotency, audit, notifications                     |
| Physical operations   | Inventory, lots, expiry, waste, recipes, reorder                                | Stock, warehouse, zones, routing, drivers, POD, failed delivery retry           | Delivery coordinates, GPS, route stops                                 |
| Money                 | Payables, invoice review, payments, credits, expense records                    | Invoices, receivables, reminders, statements, exports                           | Invoice/payment/credit-note data model; billing/subscriptions separate |
| Restaurant operations | Reservations, waitlist, guest CRM-lite, reviews, staff/labour                   | Customer growth, campaign/boost analytics                                       | Reports, dashboards, assistant                                         |
| Consumer              | Menu, modifiers, hours, B2C orders, reviews, loyalty                            | Supplier public mini-store                                                      | Public reservation and consumer portals                                |
| Platform control      | Entitlements, branch limits, usage, upgrade flows                               | Same, plus customer-location and warehouse limits                               | Plans, feature flags, overrides, impersonation, health, audit          |

### Main web surfaces

The web application exposes dashboards, products, orders, cart, quick lists, restaurant inventory, receiving, recipes, recipe costing, reservations, consumer menu/orders/loyalty, suppliers, restaurants, RFQs, chat, fulfillment, supplier inventory, invoices, settings, organization/branches, reports, disputes, deals, command center, run sheet, and admin tabs.

Public surfaces include restaurant reservations, reservation management/waitlist links, supplier mini-stores, consumer restaurant menus/orders/tracking, and staff portal login/dashboard.

### Mobile parity

Android and iOS have broad operational parity for restaurant, supplier, and driver use cases: orders, cart, inventory, invoices/statements, receiving, disputes, chat, quick lists, fulfillment, run sheet, pick lists, POD, driver tracking, branch context, and assistant. Web-first areas remain admin, bulk imports, much of growth setup, accounting export, branch management, some loyalty configuration, Arabic localization, and central-purchasing management.

### The product map in one sentence

Supplify is a **shared commercial data layer** with two operational cockpits, a restaurant operating layer, optional consumer channels, and a platform-control layer.

---

## 4. Feature Business Logic

The sections below summarize actual behavior. Each module is assessed by user, purpose, workflow, rules/state, data, dependencies, notifications, edge cases, and completeness.

### 4.1 Identity, authentication, and onboarding

- **Who / purpose:** restaurant and supplier owners, invited team members, drivers, staff portal users, platform admins, and consumer diners authenticate through different channels appropriate to their risk and scope.
- **Workflow:** Keycloak registration/login -> `PENDING` user -> `/register/complete` -> tenant/org, roles, catalog/warehouse where applicable, subscription -> trial activation or payment -> workspace. Invited users accept a link and join an existing workspace.
- **Rules and states:** ERP sessions use access and refresh cookies with proactive refresh and refresh rotation. Consumer diners use a separate restaurant-scoped JWT cookie. Staff portal uses `STAFF_PORTAL` or legacy magic link. Trial accounts can read after expiry but writes return `402` until paid or extended.
- **Data / dependencies:** Keycloak, `app_user`, `user_workspace_membership`, tenant rows, `subscription`, `legal_acceptance`, invite tables, cookie/session middleware.
- **Notifications / side effects:** welcome, new tenant to admins, trial started, activation, plan changes, invite links, OTP and login lifecycle emails.
- **Edge cases / completeness:** transient Keycloak failures preserve cookies and return a temporary-auth error; unverified email re-enters hosted login; one active workspace per user prevents accidental cross-tenant membership. Core flow is implemented; enterprise onboarding and some invitation email delivery remain manual/link-based.

### 4.2 Tenancy, organizations, branches, and active context

- **Who / purpose:** multi-location restaurant groups, supplier organizations, regional managers, branch managers, and users switching operational contexts.
- **Workflow:** a parent organization owns full branch-account tenants; users receive org roles and branch access; active branch is selected through a cookie/header context; billing resolves to the main branch where the organization shares a subscription.
- **Rules and states:** main branch cannot be deactivated. Deactivation/unlink is soft and guarded against open orders, invoices, staff, warehouse reservations, or purchasing drafts. History is preserved. A restaurant `branch` operational location is distinct from a restaurant branch-account tenant.
- **Data / dependencies:** `restaurant_organizations`, `supplier_organizations`, `restaurant`/`supplier` child tenants, `branch`, org role/access tables, `tenant_account_link`, `branch_account_link_invitations`, branch delivery coordinates.
- **Notifications / side effects:** permission-cache fan-out, branch context changes, invitation acceptance, audit events.
- **Edge cases / completeness:** organization-level supplier ordering does not let one sibling tenant’s warehouse fulfill another tenant’s product. Restaurant central purchasing has drafts and per-branch submit only; it does not yet provide a true organization-owned procurement engine. Branch logic is implemented but concept density is high.

### 4.3 RBAC and permission enforcement

- **Who / purpose:** every internal user, to ensure the right employee sees and changes only the right data.
- **Workflow:** request authentication -> tenant resolution -> org/branch context -> permission resolution -> feature/limit gate -> route/service action.
- **Rules and states:** permissions cover orders, invoices, inventory, reservations, staff, settings, chat, subscriptions, catalog, warehouses, admin, receiving, payments, fulfillment, promotions, growth, drivers, and recipes. Owner roles have broad access; custom roles require advanced roles. No user may self-escalate or remove the last owner.
- **Data / dependencies:** `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles`, legacy role tables, org roles, branch access, Redis permission cache, `permission-keys.js`, `role-matrix.js`.
- **Notifications / side effects:** role assignment can send role-changed email; cache invalidation is required for security correctness.
- **Edge cases / completeness:** the technical catalog identifies some routes where permission enforcement is weaker than the product label—for example order creation and chat send historically rely on view/usage gates rather than the conceptual create/send key. This is a governance and audit issue, not merely a UI issue.

### 4.4 Plans, subscriptions, billing access, and feature flags

- **Who / purpose:** tenants choose a paid operating level; Supplify controls access, scale, and monetization; admins manage exceptions.
- **Workflow:** select plan -> checkout or trial activation -> subscription entitlement -> usage metering -> near-limit warning or feature block -> upgrade, admin override, or lock.
- **Rules and states:** current public pricing is Restaurant Growth $49/$490 annual, Restaurant Scale $149/$1,490, Supplier Growth $149/$1,490, Supplier Scale $349/$3,490. Public trial is 30 days by default and configurable 7–90 days. Restaurant scale is primarily branches; supplier scale is active ordering customer locations/month. Add-ons cover extra restaurant branch, supplier customer locations, supplier branch, and warehouse.
- **Data / dependencies:** `subscription_plan`, `subscription`, `usage_meter`, `feature_flag`, overrides, billing invoices/payments/events, platform settings, Stripe/stub gateway abstraction.
- **Notifications / side effects:** trial started/ending/expired, billing activated/renewed/failed, plan changed, account locked; UI records conversion events and displays upgrade nudges at 80% usage or after repeated blocks.
- **Edge cases / completeness:** internal codes remain legacy-compatible (`silver`, `gold`, `platinum`, `free`) while public names are tenant-specific. Account lock allows reads after trial expiry but blocks writes; background jobs respect lock state. Manual/stub billing is supported; live automated recurring PSP subscriptions/webhooks are not yet production-complete.

### 4.5 Supplier discovery, catalog, search, favorites, and public mini-store

- **Who / purpose:** restaurants find suppliers and products; suppliers publish and maintain what they sell.
- **Workflow:** search supplier/product -> inspect profile/catalog/reviews -> follow or connect -> view enriched price/availability -> add to cart or RFQ. Suppliers import, edit, price, image, and organize products; their public mini-store can expose products without prices to anonymous users and prices to eligible logged-in restaurants.
- **Rules and states:** full-text search uses product name, Arabic name, SKU, description, brand, and tags; search history is per user/tenant. Follow is unique and plan-metered; block is separate and prevents new relationship/order behavior. Supplier product creation is SKU/plan-limit constrained. Imports support CSV/XLSX and partial-row error handling; image ZIP imports are asynchronous.
- **Data / dependencies:** `product`, `catalog`, `price`, search vector/history, files/S3, follows/blocklist, reviews, supplier profile/settings, product image jobs.
- **Notifications / side effects:** new deal fan-out to followers/targets; import progress/failure; audit on product changes.
- **Edge cases / completeness:** product identity is tenant-specific when catalog entries differ; there is no fuzzy cross-supplier canonical product merge. Supplier profile, catalog quality, availability, and substitute information are not yet a unified quality score.

### 4.6 Contract pricing and price resolution

- **Who / purpose:** supplier sales teams offer restaurant-specific pricing; restaurants see the price they are entitled to.
- **Workflow:** supplier creates or bulk-upserts a restaurant/product price -> restaurant catalog/cart displays “Your price” -> checkout re-resolves price server-side -> order line stores immutable price metadata.
- **Rules and states:** active, date-valid, quantity-qualified contract price overrides default catalog price; quote lock overrides contract for an agreed RFQ line; promotions apply after the base price. Delivery date is used as the as-of date when supplied. Explicit price wins over calculated discount percentage. MOQ and order multiple are enforced at checkout.
- **Data / dependencies:** `restaurant_pricing`, `price`, RFQ quote response items, order-item pricing snapshots, central resolver `resolve-product-price.service.js`.
- **Notifications / side effects:** price changes feed recipe-cost impact/recalculation; order audit contains pricing source.
- **Edge cases / completeness:** the API repairs historical “pricing tier” assumptions and uses one unique contract row per supplier/restaurant/product. There is no full CSV price-list import/copy-between-restaurants tool; contract pricing has no dedicated product-level feature gate today.

### 4.7 RFQ, quote comparison, and quote locks

- **Who / purpose:** purchasers needing a better, confirmed, or non-catalog price; supplier sales teams responding to demand.
- **Workflow:** restaurant creates RFQ for one/more suppliers -> supplier responds per line or declines -> restaurant compares responses -> adds selected response to cart -> checkout includes quote locks.
- **Rules and states:** request `open -> closed/cancelled`; supplier row `pending -> responded/declined`; quote locks must match an open request, responding supplier, restaurant, product, and line quantity. A quote cannot silently fall back to catalog pricing when a client claims a lock. Supplier response rechecks request state under lock.
- **Data / dependencies:** `quote_requests`, items, supplier rows, responses, response items, price resolver, cart/order create.
- **Notifications / side effects:** deduplicated in-app quote received notifications to each side; viewed timestamps clear unread state.
- **Edge cases / completeness:** comparison and manual checkout are implemented; automatic quote awarding, negotiation threads, supplier response SLAs, and quote-to-contract conversion are not. RFQ is a strong commercial primitive but remains a human decision workflow.

### 4.8 Deals, promotions, boosts, and loyalty incentives

- **Who / purpose:** suppliers acquire demand and reward restaurant buyers; restaurants discover savings and redeem eligible offers.
- **Workflow:** supplier drafts and submits a deal -> admin approves/rejects -> supplier pays or receives a not-required outcome for a boost -> deal is active/scheduled/paused/expired -> eligible restaurant sees it -> promotion is applied at order creation.
- **Rules and states:** promotion states include draft, pending approval, rejected, approved-pending-payment, active, scheduled, paused, expired, and cancelled. Percentage/fixed/buy-X-get-Y/free-shipping calculations are capped and line-eligible. Contract/quote pricing is resolved before promotion. Boost packages are separate paid visibility products; current service requires a paid/not-required boost window for sponsored discovery.
- **Data / dependencies:** `promotions`, targets/usages, `deal_promotions`, interaction/views, payment/billing metadata, promotion pricing config, expiry cron.
- **Notifications / side effects:** submission to supplier/admin, approval to targets/followers, rejection with reason, expiry to supplier, usage records, billing/ad records.
- **Edge cases / completeness:** the current code and older docs differ on whether organic follower deals can be discovered without a boost; the current service behavior should be treated as authoritative until product wording is reconciled. Campaign ROI and customer-level incrementality are not yet strong enough to automate budget decisions.

### 4.9 Cart, checkout, and B2B order creation

- **Who / purpose:** restaurant purchasers and supplier staff creating phone/chat orders.
- **Workflow:** build cart -> select branch/delivery method/date -> resolve prices -> validate MOQ/order multiples/currency/supplier relationship -> split by supplier -> reserve stock -> apply promotion/coupon/loyalty -> write order/items -> notify and invalidate caches.
- **Rules and states:** restaurant creation requires restaurant context and order-create permission in the business intent, although the technical catalog notes the route’s direct permission check is weaker than the key suggests. Orders support draft or placed paths, delivery location snapshots, notes, quote locks, promotions, loyalty redemption, and idempotency keys. A multi-supplier cart creates one order per supplier. Same supplier organization across incompatible branch tenants is rejected; a new basket must resolve to one compatible tenant and one warehouse for the complete basket.
- **Data / dependencies:** `customer_order`, `order_item`, product/price/catalog, stock/inventory, warehouse assignment, branch, delivery snapshot, promotion, loyalty, audit, idempotency record, notifications.
- **Notifications / side effects:** supplier gets placed order; cache invalidation; audit event; downstream fulfillment and calendar visibility.
- **Edge cases / completeness:** identical idempotent retries replay; mismatched payloads return conflict; failed transaction rolls back order and reservation. Blocked suppliers or unestablished relationships cannot receive new orders. Manual supplier orders reuse most pricing/reservation/idempotency logic, which is valuable for offline sales capture.

### 4.10 Order lifecycle, amendments, and cancellation

- **Who / purpose:** restaurant, supplier, fulfillment staff, receiving, and support need one authoritative record of what was agreed and what happened.
- **Workflow:** restaurant places -> supplier acknowledges -> processes -> ships -> driver delivers -> restaurant receives -> invoice/status/dispute/payment. Restaurant can cancel in permitted pre-delivery states; supplier can decline/cancel with a reason. Amendments request a quantity, removal, substitution, delivery-date, or other change and require counterparty approval.
- **Rules and states:** core supplier transitions are `PLACED -> ACKNOWLEDGED -> PROCESSING -> SHIPPED -> DELIVERED`; cancellation is permissioned and reasoned. Amendments are allowed only through `PROCESSING` and one pending amendment per order. Rows and orders are locked during transition; concurrent updates return conflict.
- **Data / dependencies:** `customer_order.status`, `delivery_status`, amendment tables, cancellation fields, order timeline, route/assignment state, receiving reports, disputes, invoices.
- **Notifications / side effects:** status changes, cancellation/decline reason, amendment request/response, cache invalidation, release of planned route or stock on cancellation.
- **Edge cases / completeness:** legacy `COMPLETED` remains accepted, and receiving adds `RECEIVED_PARTIAL`, `RECEIVED_FULL`, `RECEIVED_WITH_DISPUTE`, and `INVOICED`. This makes the lifecycle operationally rich but conceptually fragmented; a future canonical timeline should present these as milestones rather than forcing shareholders to understand every stored status.

### 4.11 Supplier inventory, warehouses, routing, picking, and transfers

- **Who / purpose:** suppliers and warehouse staff control the physical source of fulfillment.
- **Workflow:** configure warehouse/zones -> maintain inventory -> order placement chooses a compatible tenant/warehouse -> reserve stock -> pick/pack/dispatch -> consume reservation -> transfer or reassign when necessary.
- **Rules and states:** warehouse mode and legacy inventory mode are mutually selected for reservation behavior. New organization-routed baskets cannot split across incompatible locations. Warehouse routing checks organization/tenant, catalog capability, stock, zones, MOQ, and operational constraints; distance is a tie-breaker only when coordinates are reliable. Transfer locks order/assignment, releases old reservation, reserves target, and preserves financial snapshots.
- **Data / dependencies:** `warehouse`, `warehouse_inventory`, `inventory_adjustment`, product settings, delivery zones, routing rules, order warehouse assignments, pick lists, waves, routes, transfer audit.
- **Notifications / side effects:** fulfillment board updates, transfer notifications, stock adjustments/audits, failed route or exception records.
- **Edge cases / completeness:** old line-level assignments remain readable while new flow prefers one warehouse for a complete basket. A missing single location fails closed rather than creating an unfulfillable split. The supplier still makes many assignment and exception decisions manually.

### 4.12 Driver delivery, routes, GPS, ETA, and POD

- **Who / purpose:** supplier dispatchers and drivers deliver; restaurants track only their own delivery.
- **Workflow:** plan route or driver assignment -> driver picks up -> goes out for delivery -> sends valid GPS points -> route/stop advances -> driver submits POD -> marks delivered or failed -> retry/reassign if needed.
- **Rules and states:** assignment is `assigned -> picked_up -> out_for_delivery -> delivered/failed/rescheduled/reassigned`. Restaurant live map begins only after pickup/out-for-delivery. ETA requires an active status, fresh GPS, and destination coordinates. ETA is a straight-line city estimate with route stop service-time additions, not turn-by-turn routing. POD is one row per order; when supplier policy requires POD, proof must exist before delivered status.
- **Data / dependencies:** drivers, assignments, delivery routes/stops, GPS pings/latest location, POD, exception/retry records, branch/restaurant destination coordinates, map provider settings.
- **Notifications / side effects:** in-app driver milestones, stale GPS alerts, route rollover, delivery failure/reschedule, delivered status, dispatch-cache invalidation. GPS pings do not email/WhatsApp the restaurant.
- **Edge cases / completeness:** failed retries retain superseded history and do not pretend consumed stock was never dispatched. A missing text-to-coordinate location still allows delivery but not ETA. Route optimization is nearest-neighbor, not a full capacity/traffic/road-network optimizer. Delivery visibility is strong but proactive customer communication remains limited.

### 4.13 Restaurant receiving and quality reconciliation

- **Who / purpose:** receiving staff compare what was ordered, what arrived, and what can be billed.
- **Workflow:** open delivered order -> enter accepted/rejected quantities and quality -> optionally capture lot/expiry -> system computes discrepancies -> writes report/inventory movement -> auto-opens or extends dispute if needed -> creates invoice for accepted billable lines -> earns supplier loyalty -> prompts review.
- **Rules and states:** every order line must be represented once; received quantity cannot exceed ordered. Report is accepted, partial, or rejected. Short/non-accepted items create one active dispute. Order then becomes received partial/full/with dispute; invoice creation from accepted receipt can move the stored order to `INVOICED`.
- **Data / dependencies:** receiving reports/lines, order items, restaurant inventory, movement log, lots, forecast dirty queue, disputes, invoice service, supplier tax/payment terms, loyalty, recipe costing.
- **Notifications / side effects:** supplier/restaurant receiving and dispute messages, invoice issued, review prompt, recipe cost recalculation.
- **Edge cases / completeness:** receiving history is report-based and there is no separate “unreconciled queue” concept. A key state nuance is that receiving computes a `RECEIVED_*` notification state before invoice creation may persist `INVOICED`; this should be presented as one business milestone, not two contradictory facts. Receiving is implemented but still relies on a person to enter the actuals.

### 4.14 Restaurant inventory, lots, expiry, waste, reorder, and quick lists

- **Who / purpose:** restaurant managers, purchasers, kitchen/receiving staff, and accountants manage stock availability and cost.
- **Workflow:** receive/add/adjust stock -> record movement or waste -> track lots/expiry -> calculate low stock/cadence/expiry suggestions -> review/suppress -> place order manually or execute a quick list/scheduled order.
- **Rules and states:** aggregate inventory stores on-hand and thresholds; movement logs provide usage. Expiry is computed as safe/expiring soon/expired, with deduplicated reminders. Reorder quantity uses consumption, lead time, a safety window, MOQ, pack size, and on-hand. Suggestions are deterministic on the list path; LLM explanations/recommendations are gated, quota-metered, cached, and labeled honestly. Quick lists save product/supplier/quantity templates and may remind or auto-create.
- **Data / dependencies:** restaurant inventory/settings, movements, lots, waste analytics, order history, cadence, forecasts, reorder suppression/feedback, quick lists, supplier pricing/catalog, scheduled-order job.
- **Notifications / side effects:** low stock, expiry, cadence reminders, scheduled-order reminder/creation, forecast dirty/recalc, usage meters.
- **Edge cases / completeness:** inventory is still largely one aggregate per product while forecasts can be branch-keyed; branch attribution is a partial foundation. Snooze data exists without a complete UI. Forecasts and suggestions do not yet automatically choose the best supplier/warehouse/price and place an approved purchase order as one closed loop.

### 4.15 Disputes, returns, credit notes, refunds, and replacements

- **Who / purpose:** restaurants report shortages/damage/quality/billing issues; suppliers investigate and resolve.
- **Workflow:** restaurant opens dispute -> supplier reviews -> resolves with credit, refund record, replacement, or no action, or rejects -> linked credit/replacement effect is recorded -> restaurant sees result.
- **Rules and states:** only one active dispute per order. Eligible order states are delivered/received/invoiced/completed. Receiving can automatically create a dispute. Resolution uses an immutable idempotent effect: repeating the same request returns the existing effect; a different effect conflicts. Replacement creates a zero-priced linked follow-up order for disputed quantities.
- **Data / dependencies:** disputes/items/attachments, receiving, invoice/credit note, replacement order/source fields, `dispute_resolution_effects`, audit.
- **Notifications / side effects:** supplier dispute opened, restaurant resolved/rejected, invoice credit application attempt, reservation/stock for replacement, recipe alerts on financial changes.
- **Edge cases / completeness:** “refund” is an auditable internal adjustment/reference, not proof that an external PSP refund occurred. Substitution suggestions become amendments awaiting restaurant approval; shortage acceptance and quantity adjustment are not fully formalized.

### 4.16 Invoices, payments, payables, receivables, and statements

- **Who / purpose:** suppliers bill and collect; restaurants review, record, and pay; accountants export and reconcile.
- **Workflow:** accepted receiving creates invoice -> invoice is issued with tax/payment terms/due date -> supplier monitors receivables and sends reminders -> restaurant records cash/credit/HQ payment -> trigger recalculates paid/balance/status -> overdue job marks and notifies.
- **Rules and states:** invoice statuses include draft, issued, partially paid, paid, void, overdue; payment records include pending, processing, completed, failed, refunded. Payments are locked and cannot exceed remaining balance. Aging is current, 0–7, 8–30, 31–60, and 60+ days.
- **Data / dependencies:** invoice/line items, payment, statement, dunning/reminder logs, tax config, invoice sequences, credit notes, billing invoices/payments for platform billing.
- **Notifications / side effects:** invoice issued, due-soon/due-today/overdue/30-day reminders, payment status, exports, receivables dashboard.
- **Edge cases / completeness:** this is operational finance/AR/AP, not full general ledger, bank reconciliation, or embedded payment collection. The current source of truth invoices from receiving, while an older document claims auto-invoicing at delivery; current code should be explained as receiving-based. QuickBooks-style CSV is available; live accounting integrations are not.

### 4.17 Chat, notifications, email, WhatsApp, push, and webhooks

- **Who / purpose:** restaurant and supplier teams communicate and receive workflow signals without repeatedly checking every page.
- **Workflow:** chat conversation/message -> in-app notification/realtime event -> optional email, WhatsApp, web push, native push, or Platinum webhook according to feature, preference, channel, and credentials.
- **Rules and states:** chat has conversation participants, messages, attachments, quick replies, unread counts, and read endpoints. Notifications are tenant-wide to team members linked through roles and primary contact. Category preferences can suppress all channels. Delivery milestones are intentionally in-app only. Email/webhook/push send is post-transaction and should not roll back the business action.
- **Data / dependencies:** conversation/message tables, notification logs/preferences, push subscriptions, email/WhatsApp/webhook delivery logs, Socket.IO, SMTP/Meta/VAPID/FCM/APNs credentials.
- **Notifications / side effects:** this feature is itself the side-effect layer for orders, invoices, disputes, reservations, growth, billing, staff, reorder, and deals.
- **Edge cases / completeness:** deduplication and retries exist, but the user can still experience alert overload because many modules fan out tenant-wide. A unified action inbox, escalation policy, and notification health dashboard are missing.

### 4.18 Read-only AI assistant and reorder AI

- **Who / purpose:** operators ask live-data questions; restaurants get explanations or recommendations around reorder need.
- **Workflow:** assistant message -> permission-aware read-only tools -> up to four tool rounds -> answer with sources/live data. Reorder `explain`, `ask`, and `ai-recommend` use feature/quota/provider gates and deterministic fallback.
- **Rules and states:** assistant cannot place orders, change stock, or assign drivers. One AI quota unit is reserved per user turn; tool hops do not multiply meter usage. Failed/heuristic responses are labeled honestly. Reorder model output is constrained around a deterministic baseline and MOQ/pack rules.
- **Data / dependencies:** assistant conversations/messages, inventory, orders, deliveries, invoices, recipes, waste, reports, fulfillment, warehouse stock, AI provider config, usage meters.
- **Notifications / side effects:** conversation history and quota events; no mutation side effects.
- **Edge cases / completeness:** this is useful decision support, not an action agent. The most valuable next step is permissioned action execution with previews, approvals, and rollback—not simply a more conversational model.

### 4.19 Reservations, waitlist, guest CRM-lite, and reviews

- **Who / purpose:** FOH teams manage tables and reservations; guests book and manage visits; restaurants learn from reviews.
- **Workflow:** guest or staff creates reservation -> availability/table assignment -> confirmation/reminders -> arrive/seated/completed/no-show/cancelled -> guest can cancel/reschedule/review. Cancellation can promote the next matching waitlist guest.
- **Rules and states:** party size, slot capacity, blackout dates, cancellation window, deposit acknowledgement, tables, occasions, allergies, guest history, and booking source are used. Gold+ waitlist auto-promotion gives a two-hour offer; decline/expiry rolls to the next guest. Reservation reviews and consumer-order reviews are separate unique records.
- **Data / dependencies:** reservations, tables, waitlist, guests, blackouts, review tables, reservation guest comms job, email/WhatsApp.
- **Notifications / side effects:** confirmation, waitlist, cancellation, reschedule, reminders at T–24h/T–2h, review invitations, staff alerts.
- **Edge cases / completeness:** restaurant timezone handling is explicit. Deposit collection is acknowledgement/policy rather than a demonstrated external payment flow. Reservations are operationally separate from procurement and staffing demand forecasts.

### 4.20 Staff portal and labour control center

- **Who / purpose:** restaurant managers plan labour; operational staff self-serve their shifts and time.
- **Workflow:** manager creates staff/shifts -> staff receives portal access -> clock in/out -> requests PTO or shift swap -> manager approves/declines -> labour summary and payroll preview/export.
- **Rules and states:** portal users cannot access the main ERP; self routes are scoped to linked staff. Swaps can reassign a shift after approval. Labour summary reports late, missed clock-out, pending PTO/swap, expiring documents, hours, and estimated hourly cost.
- **Data / dependencies:** staff members, shifts, time entries, PTO, availability, swaps, announcements/acknowledgments, documents/incidents/performance notes, payroll exports, Keycloak staff role or magic-link session.
- **Notifications / side effects:** invite/reset/disable access, PTO decision, swap decision, announcements, summary alerts.
- **Edge cases / completeness:** no legal payroll, tax, accrual, or jurisdiction-specific overtime engine. Salary staff and unassigned shifts make some metrics unavailable. This is a useful operational labour layer, not a full HRMS.

### 4.21 Recipes, food costing, and price impact

- **Who / purpose:** restaurant owners, managers, purchasers, accountants, and kitchen teams understand dish cost and supplier price impact.
- **Workflow:** create recipe -> add supplier/manual/inventory ingredients -> convert units -> apply yield/waste -> calculate portion cost, food-cost percentage, margin, and suggested selling price -> receive or change price -> queue recalculation/impact alert.
- **Rules and states:** ingredient price precedence is invoice -> last received -> contract -> catalog -> manual/override. Missing conversion or price is flagged as missing data, never silently zero. Costs require a separate permission from recipe viewing.
- **Data / dependencies:** recipes, branches, ingredients, conversions, ingredient costs, cost snapshots, supplier price events, price impacts, alerts, receiving/invoice/credit notes, three-minute recalc job.
- **Notifications / side effects:** recalculation, recipe alerts, price-impact awareness, dirty queues after receiving/catalog/contract/credit changes.
- **Edge cases / completeness:** no POS sales popularity, sub-recipes, weighted-average costing, or direct B2C menu-item linkage. This is a good cost-control foundation whose commercial impact increases when connected to demand and menu pricing.

### 4.22 Consumer menu, B2C ordering, tracking, reviews, and loyalty

- **Who / purpose:** restaurants gain a direct customer ordering channel; diners order without Keycloak; restaurant teams operate a small kitchen board.
- **Workflow:** public menu/storefront -> modifiers/cart -> delivery/takeaway/dine-in selection -> COD checkout -> receipt token tracking -> kitchen advances `RECEIVED -> PREPARING -> SHIPPED -> DELIVERED` or cancelled -> optional member earns/redeems loyalty and leaves review.
- **Rules and states:** diners use restaurant-scoped consumer accounts, not ERP accounts. Loyalty applies only to signed-up members, with configured welcome bonus, earn rate, fulfillment multipliers, and redemption cap. Menu can include allergens/dietary tags and 86 unavailable items from open tickets.
- **Data / dependencies:** menu categories/items/modifiers, fulfillment config/zones/hours, consumer members/orders/status history, loyalty ledgers/program, consumer reviews.
- **Notifications / side effects:** receipt polling/tracking; loyalty earn on delivered; review eligibility; no ETA, driver map, push, or mobile consumer parity in the current v1.
- **Edge cases / completeness:** B2C orders do not currently flow through the B2B supplier procurement/inventory/recipe model. That is a deliberate separation for v1, but it limits a restaurant’s ability to learn demand from consumer sales.

### 4.23 Supplier customer growth, referrals, and sponsorship

- **Who / purpose:** suppliers import their customer base, reconnect existing restaurants, invite prospects, sponsor onboarding, and measure conversion.
- **Workflow:** CSV import -> exact/fuzzy match -> connection request or invite -> referred signup/trial -> optional supplier-paid sponsored month -> restaurant becomes payer -> supplier reward/discount attribution.
- **Rules and states:** match by email, phone, then name+area. Existing tenants accept a connection before follow is created. Sponsorship states include offered, accepted, payment pending, payment failed/retry, scheduled, active, completed, expired, cancelled, refunded, reversed. Pricing is snapshotted; monthly only; yearly sponsorship is rejected; idempotent payment is required.
- **Data / dependencies:** prospect/import batch, connection requests, referral attribution, sponsorship, billing invoice/payment, referral program config, supplier plan/location limit.
- **Notifications / side effects:** connection, referral, sponsorship, expiry, reward, payment, and maintenance-job events.
- **Edge cases / completeness:** growth workflows are commercially meaningful but partly web-first. Supplier active-customer-location caps block new activation flows at limit; they do not silently reject ordinary restaurant orders. Sponsorship is manual/stub-gateway ready, not fully live-PSP automated.

### 4.24 Supplier loyalty, B2B reviews, and restaurant/consumer reputation

- **Who / purpose:** suppliers reward repeat restaurant spend; restaurants review supplier performance; diners review restaurants.
- **Workflow:** restaurant receives supplier order -> B2B loyalty points earned -> future checkout may redeem. After eligible B2B delivery/receiving, restaurant may review supplier. After consumer order/reservation completion, diner may review restaurant.
- **Rules and states:** B2B loyalty is supplier-specific and receiving-triggered; B2C loyalty is restaurant-specific and delivered-triggered. Reviews are one per relevant order/reservation and editable for seven days by the author.
- **Data / dependencies:** supplier loyalty program/balance/ledger, consumer loyalty program/ledger, supplier/restaurant reviews and rating summaries, receiving and consumer completion.
- **Notifications / side effects:** post-receiving review prompt; summaries enrich catalog/storefront.
- **Edge cases / completeness:** loyalty programs are separate, so Supplify does not yet model a unified value/retention score across supplier and restaurant relationships. Review averages are descriptive; they do not yet feed supplier selection, routing, pricing, or dispute priority.

### 4.25 Reports, dashboards, command center, and run sheet

- **Who / purpose:** operators need an overview of work today; owners need trends; admins need platform economics and health.
- **Workflow:** services aggregate orders, deliveries, receivables, reorder risk, low stock, disputes, deals, growth, revenue, customer, and plan data -> dashboards rank or display it.
- **Rules and states:** restaurant reports include spend by supplier/category, order volume, COGS trend, top products, receiving quality, waste, and invoice aging. Supplier reports include revenue, top restaurants/products, fulfillment performance, order volume, and collections. Command center shows top eight priorities and today previews; run sheet is a daily supplier brief.
- **Data / dependencies:** all major transaction tables, report services, supplier command/run-sheet services, subscription/admin data.
- **Notifications / side effects:** dashboards primarily read; priority views guide humans to underlying screens.
- **Edge cases / completeness:** “advanced/custom reports” is not materially differentiated from basic reports in all code paths. Dashboards are useful summaries, but most recommendations still stop at a preview or link rather than an approved action.

### 4.26 Files, audit, localization, integrations, and platform infrastructure

- **Who / purpose:** every tenant benefits from secure evidence, traceability, localization, external communication, and reliable deployment.
- **Workflow:** presign/upload -> attach to product, dispute, POD, or document; mutation -> audit log; event -> realtime/cache/notification; web UI can use English/Arabic and RTL; platform runs PostgreSQL/Redis/S3/Keycloak/Socket.IO/SMTP/WhatsApp/web push.
- **Rules and states:** file quotas and signed URLs protect storage; audit is tenant-scoped and masks IP; admin impersonation is short-lived and blocks billing/payment mutations; webhook sends are signed/deduplicated; Redis caches calendars/permissions/dispatch data.
- **Data / dependencies:** S3/MinIO, `audit_logs`, `admin_audit_log`, conversion/system events, Redis, sockets, platform settings, deployment environments.
- **Notifications / side effects:** audit and observability are cross-cutting side effects; failures should be visible without corrupting primary transactions.
- **Edge cases / completeness:** full developer API/order/invoice webhooks, advanced custom reports, and some integration claims remain catalog-only or external. Arabic localization is web-first. Infrastructure is broad, but operational reliability depends on deployment configuration, credentials, migrations, and job process discipline.

---

## 5. Restaurant End-to-End Journey

### Journey map

| Stage        | What the restaurant does                                     | Supplify logic                                                              | Current maturity                                     |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1. Sign up   | Choose restaurant, create business, activate trial/plan      | Tenant, org, roles, catalog context, subscription lock/unlock               | Implemented                                          |
| 2. Configure | Add branches, staff, delivery location, settings, suppliers  | Branch limits, role scope, delivery snapshot inputs, supplier relationships | Implemented; multi-branch depth varies               |
| 3. Discover  | Search suppliers/products, follow, review, inspect deals     | FTS, relationship rules, price enrichment, reviews, promotion visibility    | Implemented                                          |
| 4. Source    | Use catalog, contract price, RFQ, or deal                    | Price resolver and quote locks prevent silent price substitution            | Implemented; negotiation is manual                   |
| 5. Purchase  | Cart, branch, delivery date/method, checkout                 | MOQ, pack multiple, currency, stock, warehouse, supplier split, idempotency | Strongly implemented                                 |
| 6. Receive   | Check quantity and quality, add lots/expiry                  | Server validates lines, updates inventory, opens dispute, creates invoice   | Implemented; human data entry required               |
| 7. Reconcile | Accept, dispute, request replacement/credit, review supplier | Dispute effect is idempotent; credits/replacements linked                   | Implemented; refund/payment effect is internal       |
| 8. Operate   | Consume, waste, expire, cost recipes, reorder                | Movement logs, waste, forecasting, recipe costing, quick lists              | Implemented in separate modules; connections partial |
| 9. Pay       | Review invoice, record cash/credit/HQ payment, export        | Balance trigger, aging, reminders, statements                               | Implemented as operational finance                   |
| 10. Grow     | Run reservations, staff, consumer menu, loyalty              | Separate restaurant operating and B2C modules                               | Implemented; not fully connected to procurement      |

### Restaurant value proposition

The restaurant gets one place to answer:

- What do we buy?
- From whom?
- At what agreed price?
- When will it arrive?
- What was actually received?
- What was missing or damaged?
- What do we owe?
- What is in stock and expiring?
- What should we reorder?
- How are food cost, waste, reservations, and labour behaving?

### Restaurant weaknesses today

The restaurant still has to make and coordinate several decisions manually: choose supplier, approve RFQ, approve substitution, select quantity, approve scheduled order, enter receiving actuals, decide dispute outcome, record payment, and act on recipe/expiry alerts. Supplify records the evidence, but does not yet consistently orchestrate the decision.

---

## 6. Supplier End-to-End Journey

### Journey map

| Stage               | What the supplier does                                  | Supplify logic                                             | Current maturity                                             |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Onboard          | Create supplier, catalog, warehouse, delivery settings  | Tenant, org, roles, trial, catalog/default warehouse       | Implemented                                                  |
| 2. Acquire          | Import customers, connect, invite, sponsor              | Matching, referral, sponsorship lifecycle, metrics         | Implemented; web-first                                       |
| 3. Merchandize      | Create products, prices, images, deals, contract prices | Catalog, imports, price resolver, deal approval/boost      | Implemented; data quality manual                             |
| 4. Receive demand   | View orders/RFQs, respond, accept/decline               | Order transitions, quote response, reasoned decline        | Implemented                                                  |
| 5. Plan fulfillment | Select warehouse, wave, pick list, route, driver        | Stock reservations, warehouse routing, routes, assignments | Implemented; operational choices manual                      |
| 6. Deliver          | Pick up, GPS, route stops, POD, failed retry            | Assignment state, ETA, POD policy, retries                 | Implemented; road optimization limited                       |
| 7. Reconcile        | Handle shortage, substitution, dispute, replacement     | Amendments, disputes, credit/replacement effects           | Implemented; exceptions need human judgment                  |
| 8. Bill             | Generate invoice, monitor AR, remind, export            | Receiving-based invoice, aging, reminders, payment records | Implemented; collections mostly manual                       |
| 9. Retain/grow      | Review customer risk, deals, loyalty, reorder reminders | Command center, growth, reorder intelligence, campaigns    | Implemented as separate views; closed-loop retention partial |

### Supplier value proposition

The supplier gains a digital sales and operations layer: a catalog is not only published but connected to customer-specific pricing, orders, warehouse reservations, delivery evidence, invoices, collections, customer growth, and reorder risk.

### Supplier weaknesses today

The supplier command center gathers many useful previews, but operators still decide which order to prioritize, whether to move stock, how to substitute, whether to offer a deal, when to call an overdue restaurant, and which customer is at churn risk. The opportunity is to move from “dashboard with links” to “ranked, explainable action queue.”

---

## 7. Purchasing Journey

### Standard purchasing flow

1. Restaurant identifies a need through a stock count, a low-stock suggestion, cadence reminder, expiry risk, recipe cost change, or a human request.
2. Purchaser searches suppliers/products or uses a quick list.
3. Restaurant sees default, contract, quote, promotion, or loyalty-adjusted economics.
4. Purchaser chooses quantity, branch, delivery method/date, and optional promotion/quote lock.
5. Supplify checks relationship, blocklist, supplier organization compatibility, currency, MOQ/order multiple, minimum order value, warehouse stock, and idempotency.
6. Platform creates one order per supplier, reserves stock, snapshots commercial terms, and notifies supplier.
7. Supplier acknowledges, processes, ships, and delivers.
8. Restaurant receives actual quantities/quality; disputes and invoices follow.

### Scheduled purchasing

Quick lists can be reminders or auto-create scheduled orders. Locked tenants are skipped. This is useful for recurring staples, but the system does not yet offer a mature approval policy such as “auto-create only when price is within tolerance and forecast confidence is high.”

### Central purchasing reality

Restaurant Scale includes a `central_purchasing` feature string, but the current implementation is a foundation:

- one draft per destination branch account and user;
- API can update JSON line items;
- submit creates separate pending orders per branch;
- no organization-owned order;
- no full supplier catalog browsing and line-editing experience;
- no centralized price/volume negotiation or approval workflow;
- current service accepts draft line prices and does not replace the full normal checkout/reservation process.

The shareholder answer is: **“We have the branch-account and permission foundation for central purchasing, but not the finished centralized procurement product yet.”**

---

## 8. Inventory Journey

### Inventory logic

| Input                            | Current use                               | Business meaning                        |
| -------------------------------- | ----------------------------------------- | --------------------------------------- |
| Receiving accepted quantity      | Adds stock and movement                   | What physically arrived and can be used |
| Manual adjustment                | Adds/subtracts stock                      | Correction, count, or operational event |
| Waste/spoilage                   | Subtracts stock and records category/cost | Lost gross margin and process signal    |
| Lot/expiry                       | Read-time safe/soon/expired status        | Risk of future waste or service failure |
| Order usage / subtract movements | Average daily usage                       | Demand signal for reorder               |
| Supplier price events/invoices   | Ingredient cost                           | Margin and menu price impact            |
| Quick list                       | Reorder template                          | Repeat purchasing intent                |
| Cadence history                  | Reminder                                  | Expected buying rhythm                  |
| Forecast                         | Coverage and reorder-by date              | Projected stockout risk                 |

### Current inventory strengths

- transactional receiving and inventory updates are linked;
- movement history supports waste and usage analytics;
- MOQ, order multiple, lead time, safety buffer, and on-hand are included in suggested quantity;
- lots and expiry support operational risk;
- warehouse inventory can reserve stock before delivery;
- forecasts have confidence, backtesting, dirty queues, and branch attribution inputs;
- recipe costing consumes received/catalog/contract prices.

### Current inventory limitations

- aggregate restaurant inventory is not fully branch-native while forecasts can be branch-keyed;
- no weighted-average cost method;
- no POS or sales depletion feed;
- no automatic consumption from recipes/B2C sales;
- no supplier-aware, warehouse-aware, price-aware reorder recommendation as one decision;
- suggestions do not automatically create a reviewed purchase order;
- expiry alert snooze is not a complete user experience;
- staff still must count and enter actual receiving/waste data.

### Shareholder answer

> “We already collect the data needed for inventory intelligence. The next product layer is to connect usage, recipe demand, expiry, price, supplier reliability, lead time, warehouse stock, and cash constraints into one explainable replenishment decision.”

---

## 9. Delivery Journey

### Delivery lifecycle

```text
Order accepted
   -> processing / shipped
   -> warehouse reservation and pick
   -> planned or active route
   -> assigned
   -> picked up
   -> out for delivery + GPS
   -> POD
   -> delivered
   -> restaurant receiving
```

Failure branch:

```text
failed delivery -> reason + retry/reassign decision -> new linked attempt
                 -> rescheduled / delivered / failed again
```

### What is implemented

- planned routes separate from active dispatch;
- manual stop ordering and nearest-neighbor optimization;
- one board row per active delivery leg where multi-warehouse legs exist;
- GPS validation for accuracy, speed, time skew, duplicates, and impossible movement;
- ETA with freshness gating, destination coordinate rules, stop count, and confidence;
- restaurant-safe tracking payload that hides internal route and destination coordinates;
- proof-first delivery confirmation and required-POD policy;
- failed delivery retry with linked superseded history;
- dispatch cache invalidation after assignment/status/POD/route mutations.

### What remains manual or limited

- route planning is not a full road-network, traffic, vehicle-capacity, or temperature-aware optimizer;
- supplier chooses warehouse transfer/reassignment;
- delivery exception resolution is human;
- GPS pings do not drive automated ETA exception communication to diners/restaurants;
- consumer B2C order tracking does not yet share the B2B driver/ETA stack;
- missing destination coordinates do not block ordering, so delivery can be operationally possible but ETA-unavailable.

### Shareholder answer

> “We support real supplier-operated delivery operations, not just an order status. The remaining step is proactive exception management and route optimization with real road, capacity, and service-time data.”

---

## 10. Financial Journey

### Operational finance flow

```text
Accepted receiving
   -> invoice with received billable lines
   -> due date from supplier terms
   -> restaurant payable / supplier receivable
   -> payment record or credit
   -> balance/status trigger
   -> aging, reminder, dispute, credit, statement, export
```

### What Supplify knows

- order total and line pricing source;
- contract/default/quote price snapshot;
- expected versus received quantities;
- accepted billable quantity;
- supplier tax configuration and payment terms;
- invoice line amounts, due dates, balances, and status;
- payments, references, bank/notes, and completion state;
- credit notes, invoice application, dispute effects;
- account statement movements and aging buckets;
- supplier collection reminders and overdue notifications;
- platform subscription billing and sponsorship billing as separate ledgers.

### Current finance boundary

Supplify is an operational AR/AP layer. It can record a cash, credit, HQ, or adjustment payment and export CSV/QuickBooks-style data. It does not yet demonstrate:

- live restaurant-to-supplier payment collection as a standard B2B checkout;
- bank-feed matching;
- full accounting journal/general-ledger integration;
- automated external refund proof;
- live recurring subscription PSP webhooks and automated reconciliation.

### Important lifecycle answer

Delivery does not mean financial completion. A driver can mark an order delivered, but the restaurant still must receive it. The current invoice source of truth is accepted receiving, not merely delivery. Disputes, partial receipts, credits, and replacements can alter the financial result after delivery.

### High-value future connection

The strongest finance opportunity is a three-way match:

```text
Purchase order / order terms
        + delivery proof
        + receiving actuals
        + invoice lines
        + payment / credit
        = reconciled payable and supplier receivable
```

---

## 11. Data the Platform Already Has

Supplify has a valuable data asset because the tables capture both commercial intent and physical execution. The table below shows what exists and how it can be used more fully.

| Data asset                    | Existing source                                                        | Current use                    | Underused future value                                                        |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| Tenant and organization graph | Restaurants, suppliers, orgs, branches, memberships                    | Access, switching, billing     | Network density, branch benchmarks, account hierarchy, expansion intelligence |
| Restaurant demand             | Orders, order items, requested delivery dates, quick lists, cadence    | Checkout, reminders, forecast  | Demand forecast, supplier share, seasonality, auto-replenishment              |
| Supplier commercial terms     | Catalog prices, contract prices, RFQs, deals, loyalty                  | Checkout pricing               | Landed-cost comparison, price-change alerts, negotiation guidance             |
| Product identity              | SKU, category, unit, brand, tags, Arabic fields                        | Search/catalog                 | Canonical ingredient graph, substitutions, category benchmarks                |
| Stock position                | Restaurant inventory, warehouse inventory, movements, reservations     | Availability and reorder       | Network stock balancing, days of cover, stockout probability                  |
| Receiving truth               | Receiving reports/lines, accepted quantities, quality, lots            | Inventory, disputes, invoice   | Supplier fill-rate/reliability score, automated invoice match                 |
| Waste                         | Wastage/spoilage adjustments, categories, cost                         | Analytics                      | Root-cause coaching, prep planning, supplier packaging insight                |
| Expiry                        | Lots, expiry dates, reminder log                                       | Alerts                         | FEFO suggestions, transfer/markdown/recipe rescue actions                     |
| Delivery execution            | Assignments, routes, stops, GPS, ETA, POD, failures                    | Tracking and dispatch          | On-time score, route learning, customer ETA confidence, service-level pricing |
| Exceptions                    | Fulfillment issues, amendments, disputes, delivery exceptions, retries | Human resolution               | Exception prediction, supplier reliability, automated escalation              |
| Financial behavior            | Invoices, payments, balances, due dates, aging, credits                | AR/AP dashboards               | Credit risk, cash forecasting, payment propensity, working-capital tools      |
| Recipe economics              | Recipe ingredients, costs, price events, snapshots, impacts            | Food-cost analysis             | Procurement-to-menu margin optimization, price recommendations                |
| Reservations                  | Slots, party size, tables, cancellations, no-shows, occasions          | FOH board and guest comms      | Demand forecast, staffing and purchasing forecast, no-show risk               |
| Labour                        | Shifts, time entries, PTO, swaps, wages                                | Labour summary/payroll preview | Labour-to-demand planning, schedule optimization, compliance prompts          |
| Supplier relationship         | Follows, blocks, reviews, RFQs, orders, growth prospects               | Discovery and CRM              | Churn risk, customer lifetime value, share-of-wallet                          |
| Promotion behavior            | Targets, views, interactions, usages, boost payments                   | Deal visibility                | Campaign ROI, incremental demand, budget recommendations                      |
| Loyalty behavior              | B2B and B2C earn/redeem ledgers                                        | Rewards                        | Retention, frequency, margin-safe reward design                               |
| Consumer demand               | Menu views/orders, modifiers, fulfillment method, loyalty              | B2C ordering                   | Sales-informed procurement and recipe depletion                               |
| Communication                 | Chat, quick replies, notifications, delivery logs                      | Human coordination             | Intent extraction, issue classification, SLA/escalation analytics             |
| Platform usage                | Feature flags, usage meters, blocks, conversion events                 | Monetization                   | Product-led growth, churn prediction, plan-fit recommendations                |

### Strategic data conclusion

The data moat is not any one table. It is the relationship between **ordered**, **promised**, **reserved**, **delivered**, **received**, **invoiced**, **paid**, **consumed**, and **reordered**. The current product often exposes those as separate screens. The next advantage comes from joining them.

---

## 12. Manual Work Found

| Manual work                          | Current location            | Why it remains manual                                  | Product opportunity                                         |
| ------------------------------------ | --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Supplier/customer matching review    | Growth import               | Fuzzy matching needs human confirmation                | Confidence-ranked match queue and merge policy              |
| Supplier relationship creation       | Follow/connection request   | Counterparty consent is intentional                    | Guided onboarding and bulk relationship actions             |
| Quote comparison and award           | RFQ                         | Price/availability/trust trade-offs need judgment      | Explainable quote recommendation with approval              |
| Contract price entry                 | Contract pricing            | Supplier-specific commercial negotiation               | Import, copy, effective-date rules, price-change workflow   |
| Deal targeting and campaign creation | Promotions                  | Commercial strategy is manual                          | Suggested audiences/products and ROI feedback               |
| Catalog cleanup                      | Product/import screens      | SKU/category/unit data varies by supplier              | Catalog quality score and correction suggestions            |
| Warehouse selection/transfer         | Fulfillment                 | Stock, route, zone, and operational trade-offs         | Auto-route/transfer proposal with approval                  |
| Pick/pack/dispatch prioritization    | Fulfillment board/run sheet | Human sees board and chooses next action               | Exception-weighted queue and wave suggestion                |
| Route stop order                     | Routes                      | Manual order or nearest-neighbor preview               | Capacity/traffic/road-network optimizer                     |
| Delivery exception resolution        | Failed/retry/issues         | Requires supplier/restaurant conversation              | Playbooks and recommended resolution                        |
| GPS/ETA follow-up                    | Tracking                    | Stale or missing coordinates require operator action   | Proactive stale-GPS and ETA breach workflow                 |
| Receiving data entry                 | Receiving                   | Physical quantity/quality is not automatically known   | Scanner/receipt/OCR/mobile capture and discrepancy defaults |
| Shortage/substitution approval       | Amendments/issues           | Restaurant must decide acceptable replacement          | Policy-based auto-approval thresholds                       |
| Dispute resolution                   | Disputes                    | Credit/refund/replacement is a commercial judgment     | Resolution suggestions and approval matrix                  |
| Payment recording                    | Finance                     | Cash/bank/HQ events originate outside platform         | Payment links, bank feeds, matching, reminders              |
| Collections prioritization           | Receivables                 | Supplier decides whom to contact                       | Risk/propensity-ranked collections queue                    |
| Inventory counting                   | Restaurant inventory        | Stock is physically observed                           | Mobile count sessions, variance detection, scan support     |
| Waste categorization                 | Waste                       | Kitchen staff records category/reason                  | Fast capture and root-cause coaching                        |
| Expiry action                        | Inventory/lots              | Alert informs but does not act                         | FEFO recommendations, recipe rescue, transfer/markdown      |
| Reorder approval                     | Reorder assistance          | Suggestion does not equal permission to spend          | Budget-aware approval and auto-order guardrails             |
| Recipe maintenance                   | Recipes                     | Recipes do not follow menu/order changes automatically | Menu-recipe link, versioning, yield learning                |
| Staff scheduling                     | Staff                       | Managers manually create shifts                        | Demand-linked staffing suggestion                           |
| Reservation capacity decisions       | Reservations                | Staff configures tables/blackouts/slots                | Demand and procurement forecast bridge                      |
| Customer growth follow-up            | Supplier CRM                | Import/prospect data does not become a sales sequence  | Next-best-action CRM                                        |
| Report interpretation                | Reports/dashboard           | Metrics show facts but not outcomes                    | Role-based recommendations and outcome tracking             |
| Notification triage                  | Notifications/chat          | Many signals arrive independently                      | Unified attention inbox and escalation                      |

---

## 13. Decisions Users Still Make Manually

These are not necessarily product failures. Many are valuable human controls. They are the decisions where Supplify can progressively provide better recommendations without removing approval.

| Decision                                 | Primary owner              | Evidence already available                                        | Current decision mode                                    |
| ---------------------------------------- | -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| Which supplier to buy from               | Purchaser                  | Price, quote, deal, contract, review, fill history, delivery data | Human comparison                                         |
| How much to order                        | Purchaser/manager          | On-hand, usage, lead time, MOQ, forecast, recipe use              | Rule-based suggestion plus human approval                |
| Whether to accept a quote                | Purchaser                  | Quote lines, quantity, price, delivery date                       | Manual                                                   |
| Whether a supplier can fulfill           | Supplier manager           | Stock, warehouse, route, zone, order terms                        | System blocks impossible cases; human handles edge cases |
| Which warehouse should fulfill           | Supplier/warehouse manager | Stock, zones, catalog, distance, operational constraints          | Rule-assisted, human transfer/reassignment               |
| Which delivery gets priority             | Dispatch manager           | Requested dates, route, customer importance, exceptions, GPS      | Manual board judgment                                    |
| Whether to substitute an item            | Supplier and restaurant    | Product substitute, shortage, order stage, customer history       | Manual counterparty approval                             |
| Whether a discrepancy merits credit      | Supplier                   | Receiving, photos, dispute items, invoice                         | Manual resolution                                        |
| Whether to retry delivery                | Supplier                   | Failure reason, route, driver, stock state, customer availability | Manual                                                   |
| Who to contact for payment               | Supplier accountant        | Balance, due date, history, reminders, customer activity          | Manual reminders with automated milestones               |
| Whether to pay an invoice                | Restaurant accountant      | Invoice, receiving, disputes, credits, cash position              | Manual payment recording/approval                        |
| Which product is expiring                | Kitchen/manager            | Lots, expiry, current stock, recipes                              | Alert then manual action                                 |
| Which waste problem to solve             | Manager                    | Waste category, product, cost, trend, recipe                      | Human interpretation                                     |
| Whether to auto-create a scheduled order | Purchaser                  | Quick list, cadence, forecast, price, budget                      | Manual configuration/approval                            |
| Whether a deal is profitable             | Supplier                   | Views, interactions, usage, boost spend, revenue                  | Manual interpretation                                    |
| Which customer is at churn risk          | Supplier sales             | Order cadence, last order, balance, dispute, messages             | Dashboard preview, manual follow-up                      |
| How to staff a shift                     | Restaurant manager         | Reservations, shifts, time entries, perhaps consumer demand       | Manual schedule creation                                 |
| Whether to change menu price             | Restaurant owner/manager   | Recipe cost, supplier price events, food-cost target              | Manual decision                                          |
| Whether to expand a branch/customer base | Owner/admin                | Usage, orders, active locations, revenue, capacity                | Manual planning                                          |

### Product principle

The product should recommend, explain, request approval, execute within limits, and record the result. It should not silently make high-impact financial or relationship decisions.

---

## 14. Product Silos

| Silo                                           | What is disconnected                                                                               | Business consequence                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| B2B orders vs restaurant consumption           | Orders and inventory movements exist, but POS/recipe consumption is not linked                     | Reorder and food-cost intelligence is less precise than it could be               |
| Receiving vs invoice vs dispute                | All modules link to the order, but the user experiences separate states and screens                | Reconciliation is harder; “delivered,” “received,” and “invoiced” can be confused |
| Delivery vs customer communication             | GPS/ETA exists, but milestone alerts are mainly in-app and B2C is separate                         | Customers may not receive the right proactive exception message                   |
| Supplier warehouse vs restaurant replenishment | Each side knows stock in its own domain                                                            | No network-level availability promise or allocation suggestion                    |
| Contract pricing vs margin                     | Restaurant sees price; supplier does not get a margin/elasticity decision layer                    | Negotiation and profitability remain spreadsheet work                             |
| RFQ vs contract pricing                        | Quote can be locked into an order, but winning quote does not naturally become a reusable contract | Repeat buying requires repeated manual effort                                     |
| Deals vs procurement planning                  | Promotions drive discovery but do not automatically inform restaurant reorder or supplier capacity | Campaigns may create demand surprises or missed opportunities                     |
| Recipe costing vs B2C menu                     | Internal recipes and public menu items are separate                                                | Menu price and procurement cost can drift                                         |
| Consumer orders vs inventory/recipes           | Consumer demand does not deplete or forecast internal ingredient inventory                         | B2C channel does not improve B2B planning enough                                  |
| Reservations vs purchasing/labour              | Reservations know future covers; procurement and staff planning do not consume it                  | Restaurant cannot plan food/labour from one demand picture                        |
| Staff labour vs revenue/demand                 | Labour summary is separate from consumer/B2B sales and reservation forecast                        | Managers cannot optimize labour cost against demand                               |
| Supplier CRM vs transaction history            | Growth prospects, follow, orders, disputes, payment, and cadence are separate views                | Customer health and next-best-action are manual                                   |
| Reviews vs operational score                   | Ratings are descriptive and not joined to fill rate, on-time, dispute, or payment data             | Trust signal can be incomplete or gamed                                           |
| Notifications vs actions                       | Notifications point to screens but do not form one prioritized work queue                          | Important exceptions compete with low-value alerts                                |
| AI vs execution                                | Assistant reads and explains but cannot prepare or execute an approved action                      | AI value stops before the highest ROI step                                        |
| Plans vs product capability                    | Entitlements contain feature strings, but some advanced promises remain catalog-only               | Sales trust and upgrade value risk                                                |
| Legacy and current models                      | Legacy status `COMPLETED`, old plan codes, legacy branch/location concepts remain                  | Product language and reporting become harder to standardize                       |

---

## 15. Missing Connections

### Highest-value missing connections

1. **Order -> receiving -> invoice -> payment -> dispute** as one reconciled financial/operational timeline.
2. **Inventory -> forecast -> supplier/warehouse/price selection -> approved order** as a closed replenishment loop.
3. **Recipe -> B2C menu -> consumer sales -> ingredient depletion -> reorder** as one demand and margin loop.
4. **Reservation covers -> menu demand -> purchasing and labour plan** as a restaurant demand forecast.
5. **Supplier order history -> cadence -> customer health -> next-best sales action** as a supplier CRM loop.
6. **Delivery GPS/ETA -> SLA breach -> proactive restaurant communication -> exception resolution** as a service-recovery loop.
7. **Supplier price events -> contract prices -> recipe cost -> menu price recommendation** as a margin-protection loop.
8. **Warehouse stock across branches -> demand and delivery promise** as a supplier network allocation loop.
9. **Review -> actual fill/on-time/quality/dispute metrics** as a trusted supplier score.
10. **Notifications -> attention priority -> action -> outcome** as measurable workflow automation.
11. **Plan usage/block events -> feature adoption -> conversion/churn** as a product-led growth loop.
12. **Assistant question -> prepared draft action -> permissioned approval -> audit** as an operator copilot loop.

### Why these connections matter

The individual tables already make Supplify useful. The connections create compounding value: every completed order improves supplier reliability, restaurant forecast accuracy, price intelligence, dispute handling, cash forecasting, and future recommendations. That is the path from “software that records work” to “software that improves the business.”

---

## 16. Automation Opportunities

These are workflow automations that can be implemented from existing data with comparatively clear business rules.

| Priority | Automation                          | Trigger                                                                   | Human control                                                                      |
| -------: | ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
|        1 | Receiving-to-invoice reconciliation | Receiving report submitted                                                | Flag mismatch; auto-create invoice only when policy passes                         |
|        2 | Exception inbox                     | Short receipt, quality issue, failed delivery, stale GPS, overdue invoice | Assign owner and SLA; human resolves                                               |
|        3 | Approval-based reorder              | Forecast reaches reorder-by threshold                                     | Approve, edit, or suppress before order creation                                   |
|        4 | Price change alert                  | Supplier price event changes recipe cost or contract economics            | Acknowledge, renegotiate, or adjust menu price                                     |
|        5 | Expiry action plan                  | Lot enters expiring-soon window                                           | Suggest FEFO recipe use, transfer, markdown, or waste record                       |
|        6 | Substitution policy                 | Supplier reports configured substitute                                    | Auto-approve only within quantity/price/allergen rules; otherwise request approval |
|        7 | Delivery recovery                   | ETA breach, stale GPS, failed attempt                                     | Notify, reschedule, reassign, or create customer message draft                     |
|        8 | Collections queue                   | Invoice enters due/overdue bucket                                         | Prioritize accounts and prepare reminder; accountant sends/records                 |
|        9 | Quote-to-contract                   | Accepted RFQ response repeats over threshold                              | Propose contract price/effective date for approval                                 |
|       10 | Scheduled-order guardrails          | Quick-list execution time arrives                                         | Check price variance, stock, cash/plan lock, and confidence                        |
|       11 | Warehouse transfer proposal         | Target warehouse can fulfill more efficiently                             | Approve/reject transfer, preserve snapshot                                         |
|       12 | Catalog quality repair              | Missing unit/category/image/substitute or inconsistent SKU                | Suggest corrections, supplier confirms                                             |
|       13 | Customer growth sequence            | Existing customer cadence is overdue                                      | Draft reminder, connection, deal, or call task                                     |
|       14 | Reservation guest follow-up         | No-show, cancellation, or review eligibility                              | Queue staff action and guest message                                               |
|       15 | Labour alert routing                | Late, missed clock-out, expiring document                                 | Assign manager task and acknowledgement                                            |
|       16 | Deal expiry/campaign follow-up      | Promotion ends or underperforms                                           | Suggest renewal, pause, audience/product change                                    |
|       17 | Payment matching                    | Payment reference or bank import arrives                                  | Match to invoice and request confirmation for ambiguity                            |
|       18 | Branch ordering consolidation       | Same organization creates repeated branch demand                          | Prepare central draft with per-branch allocations and approvals                    |

### Automation guardrails

Every financial, quantity, relationship, and customer-facing automation should have:

- a preview of the proposed effect;
- a reason and source data;
- a permission check;
- an approval threshold;
- idempotency and retry behavior;
- an audit record;
- a way to suppress or undo;
- a fallback when data is missing or stale.

---

## 17. Proactive Intelligence Opportunities

Proactive intelligence is different from a report: it identifies a future risk or opportunity, explains why, and proposes the next action.

| Intelligence              | Inputs already available                                                   | Suggested output                                                                    |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stockout risk             | On-hand, usage, lead time, MOQ, open orders, forecast                      | “Tomatoes likely stock out in 4 days; buy 35 kg from Supplier A by Tuesday.”        |
| Best replenishment source | Contract/default/quote price, warehouse stock, delivery performance, zones | “Supplier B is $18 cheaper landed and can deliver before stockout.”                 |
| Expiry rescue             | Lot expiry, stock, recipe ingredients, reservations, menu demand           | “Use 12 kg of lettuce in tomorrow’s catering prep; otherwise expected waste is $X.” |
| Supplier fill reliability | Ordered/received, quality, disputes, on-time, retries                      | “Supplier C has 82% fill rate over 90 days; avoid for critical produce.”            |
| Delivery breach           | GPS freshness, ETA, route position, requested date, failure history        | “Order 104 is 25 minutes outside normal ETA; notify restaurant and dispatcher.”     |
| Cash pressure             | Open invoices, due dates, balance, payment history, order pipeline         | “Three invoices total $X due within seven days; cash-risk scenario is high.”        |
| Restaurant churn risk     | Cadence, last order, spend, disputes, payment, chat, deals                 | “Restaurant D is 11 days late to reorder and has two unresolved issues.”            |
| Supplier share-of-wallet  | Restaurant category spend and supplier mix                                 | “Restaurant E buys 70% of produce elsewhere; propose contract on five items.”       |
| Recipe margin erosion     | Price events, received costs, waste/yield, selling price                   | “Dish F food cost rose from 29% to 36%; renegotiate chicken or reprice.”            |
| Reservation-driven demand | Reservations, covers, menu/recipe, stock, lead time                        | “Saturday covers imply a 40% seafood demand increase; order by Thursday.”           |
| Labour-to-demand mismatch | Reservations, consumer orders, shifts, time entries                        | “Saturday dinner is under-staffed for forecast covers.”                             |
| Campaign profitability    | Boost cost, views, interactions, usage, revenue, margin                    | “Deal G generated traffic but negative margin; pause or retarget.”                  |
| Dispute prevention        | Product, supplier, warehouse, delivery, receiving issue history            | “Supplier H’s fragile-item disputes justify extra packing or alternate source.”     |
| Plan-fit intelligence     | Usage meters, feature blocks, active branches/customers, growth            | “Restaurant is approaching branch cap; Scale is the correct next plan.”             |

### Intelligence design principle

Supplify should use AI where language, summarization, and prioritization help, but core quantities, prices, permissions, and financial effects must remain deterministic and auditable. The current architecture already follows that principle in reorder and assistant fallbacks.

---

## 18. Product Intelligence Opportunities by User Type

### Restaurant owner / organization owner

- cash and margin outlook across branches;
- supplier concentration and dependency risk;
- branch benchmark and variance view;
- unresolved operational exceptions by financial impact;
- plan/usage and expansion recommendation;
- central purchasing approval and negotiated volume savings.

### Restaurant manager

- today’s critical stock, expiry, receiving, delivery, and staffing actions;
- service-risk view for reservations and incoming deliveries;
- labour cost versus covers/orders;
- “what should I do first?” command center;
- automatic task assignment to purchaser, receiving, or FOH.

### Purchaser

- best supplier/price/lead-time recommendation;
- quote comparison and award draft;
- reorder cart generated from inventory and recipes;
- contract-price expiry and price-change alerts;
- supplier fill-rate and substitution history beside the catalog.

### Receiving staff

- prefilled expected lines and fast discrepancy capture;
- photo/OCR/scanner-assisted receiving;
- “this discrepancy normally becomes a credit” guidance;
- lot/expiry capture with FEFO recommendation;
- one-click dispute evidence package.

### Restaurant accountant

- three-way match exceptions;
- invoice/payment/credit reconciliation;
- cash requirement forecast;
- duplicate invoice and unusual price detection;
- approval queue for disputed or adjusted invoices.

### FOH / reservation manager

- no-show and cancellation risk;
- table/cover forecast;
- guest preference/VIP context;
- reservation-driven menu, stock, and labour alerts;
- review and service-recovery tasks.

### Supplier owner

- margin by customer/product/warehouse;
- customer churn and share-of-wallet;
- route and fill-rate economics;
- cash collection risk;
- campaign ROI and plan utilization;
- organization-level branch performance.

### Supplier manager / sales rep

- next-best customer action;
- overdue reorder call list;
- quote response recommendation;
- contract price opportunity;
- customer-specific deal and sponsorship recommendation;
- relationship health timeline.

### Catalog manager

- missing data and search-quality queue;
- products with repeated substitution/shortage;
- price changes with recipe/customer impact;
- image/category/unit correction suggestions;
- duplicate SKU detection.

### Warehouse manager

- pick-wave priority by promised date and exception risk;
- stock transfer recommendation;
- basket completeness and stockout risk;
- warehouse productivity and shrinkage;
- failed-delivery inventory handling.

### Driver

- route-aware next stop with service notes;
- destination confidence and customer availability;
- safe proof-of-delivery checklist;
- failure reason playbook;
- stale GPS/offline recovery status.

### Operational staff

- schedule reminders and shift coverage;
- missed clock-out correction;
- announcement/PTO/swap status;
- privacy-safe personal action list.

### Platform admin

- tenant health and activation risk;
- plan-feature integrity monitoring;
- support queue from impersonation/audit/failed jobs;
- conversion and churn by feature adoption;
- background job and notification delivery health;
- migration and data-quality conflict queue.

---

## 19. Business Logic Risks / Inconsistencies

These are the most important issues to explain or resolve before making strong product claims.

| Risk                                               | Evidence / current behavior                                                                                                         | Why it matters                                                                             | Recommended treatment                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Parallel order state machines                      | Order status, delivery status, assignment status, route-stop status, receiving status, dispute status, and invoice status all exist | Users may not know whether an order is truly complete                                      | Create a canonical customer-facing timeline and map internal states to milestones                           |
| Delivered versus received versus invoiced          | Driver marks `DELIVERED`; restaurant must still receive; invoice is current receiving-based                                         | Sales/support may promise an invoice or completion too early                               | Use explicit language: delivered physically, received operationally, invoiced financially                   |
| Receiving notification versus persisted `INVOICED` | Receiving computes `RECEIVED_*`, then invoice service may update order to `INVOICED`                                                | Notification and list can briefly describe different states                                | Emit one reconciliation event with sub-statuses, or make ordering explicit                                  |
| Legacy `COMPLETED`                                 | Legacy paths still accepted and mapped to delivered                                                                                 | Reports and integrations may count the same event differently                              | Deprecate externally, preserve read compatibility, normalize reporting                                      |
| Warehouse model migration                          | Old line-level assignments remain while new ordering requires one complete basket warehouse                                         | Board counts and customer expectations can vary                                            | Show order-level fulfillment summary plus leg detail; document migration policy                             |
| Supplier organization versus supplier tenant       | Org is a customer-facing consolidation, but product/stock remains tenant-owned                                                      | Users may assume a sibling branch can fulfill all products                                 | Keep ownership visible and add capability explanations in UI                                                |
| Restaurant branch versus branch account            | `branch` operational location and full `restaurant` child tenant are distinct                                                       | Wrong delivery, inventory, or billing scope is possible                                    | Rename concepts in UI and provide scope badges everywhere                                                   |
| Central purchasing claim                           | Feature string exists; service explicitly says foundation only; line prices can originate in draft JSON                             | Premium sales promise may exceed behavior; financial controls may be bypassed              | Do not market as finished until normal checkout, pricing, reservation, approval, and audit paths are reused |
| Plan strings versus enforcement                    | Technical catalog identifies catalog-only advanced reports/API/central purchasing and some direct permission gaps                   | Trust, upgrade conversion, and contract risk                                               | Maintain a plan capability truth table tested against routes and UI                                         |
| Permission key mismatch                            | Order create/chat send have conceptual create/send keys but route enforcement has been weaker                                       | Least-privilege expectations may fail                                                      | Enforce intended permissions at route/service boundary and test each actor                                  |
| Contract price versus quote/promotion order        | Multiple commercial layers apply in sequence                                                                                        | Price disputes are likely if UI and snapshot differ                                        | Show full price waterfall and persist explanation on order                                                  |
| Quote-to-contract gap                              | RFQ response can lock one order but does not naturally become a reusable agreement                                                  | Repeat negotiations waste sales/purchaser time                                             | Add approved quote conversion workflow                                                                      |
| Restaurant inventory branch granularity            | Forecasts and movements can carry branch, aggregate inventory is not always branch-native                                           | Reorder recommendations can be scoped incorrectly                                          | Make inventory ledger and on-hand branch-aware or clearly scope forecasts                                   |
| No POS/recipe depletion                            | Recipe costing exists but no sales-based consumption                                                                                | Food cost and reorder are less accurate                                                    | Integrate POS or consume B2C/menu events where appropriate                                                  |
| B2C/B2B separation                                 | Consumer order statuses/menu/loyalty are separate from B2B inventory/recipes                                                        | Restaurant does not get a full demand picture                                              | Add optional bridge with clear source-of-truth rules                                                        |
| Manual finance records                             | Payments are recorded in Supplify; external settlement is not proven                                                                | “Paid” may mean recorded, not bank-confirmed                                               | Label payment source/status and build reconciliation before claiming embedded payments                      |
| Refund wording                                     | Dispute refund effect is internal/auditable, not necessarily PSP refund                                                             | Financial or legal misunderstanding                                                        | Use “refund adjustment/reference” until external refund is confirmed                                        |
| Notification overload                              | Tenant-wide fan-out across many categories and channels                                                                             | Important actions can be buried                                                            | Unified attention inbox, dedup, urgency, owner, and SLA                                                     |
| Notification failure isolation                     | Side effects are often post-commit/fire-and-forget                                                                                  | Business action succeeds while user misses alert                                           | Delivery health, retry, escalation, and audit of undelivered critical events                                |
| ETA limitations                                    | Haversine/average-speed estimate; stale/missing coordinates withhold ETA                                                            | Users may overinterpret a precise range                                                    | Label as estimate, expose freshness/confidence, add real routing later                                      |
| GPS privacy                                        | Restaurant receives only sanitized order-scoped location; supplier receives more detail                                             | Privacy is a trust requirement                                                             | Preserve minimum necessary visibility and retention policy                                                  |
| Supplier deal visibility contradiction             | Current boost service and older product docs differ on organic follower visibility                                                  | Marketing/support answers could conflict                                                   | Decide and test one visibility policy                                                                       |
| Scheduled order risk                               | Auto-create can spend money based on old quantity/price unless guarded                                                              | Unexpected orders and disputes                                                             | Add price variance, budget, stock, and approval policies                                                    |
| Substitution/shortage incompleteness               | Issue can suggest replacement, but acceptance/quantity adjustment remains manual                                                    | Order/invoice quantity can remain ambiguous                                                | Formalize shortage acceptance and amendment linkage                                                         |
| Review signal not operationalized                  | Reviews are separate from fill rate/on-time/dispute metrics                                                                         | Reputation may not reflect actual service reliability                                      | Build composite verified supplier score with transparent factors                                            |
| Jobs are in-process                                | Cron registration is inside API process                                                                                             | Multi-replica or restart behavior can duplicate/skip work without strong runner discipline | Use durable scheduler/locks/observability for critical jobs                                                 |
| Timezone complexity                                | Reservation uses restaurant local day; some cadence rules use UTC weekday concepts                                                  | Reminders and scheduled orders can occur on wrong local day                                | Establish tenant timezone as a first-class rule in every job                                                |
| Data import quality                                | Supplier/customer/product imports allow partial rows and fuzzy matching                                                             | Bad master data compounds downstream intelligence                                          | Add data-quality score, review queue, and merge/audit policy                                                |
| Mobile/web scope differences                       | Mobile is strong for operations but web-first for admin, imports, branch management, and some growth                                | Shareholders may assume every capability is everywhere                                     | Publish role/device capability matrix and keep API contracts additive                                       |

### Overall risk rating

The main risk is **product truth drift**, not absence of technical effort. Supplify contains many implemented capabilities and strong defensive fixes. Its commercial narrative, UI labels, docs, legacy compatibility, and stored states need a single current truth.

---

## 20. Top 30 Product Opportunities

### Ranking method

The ranking favors opportunities that use existing data, improve a core paid workflow, reduce manual work, create measurable ROI, and strengthen the product’s defensibility. Complexity is relative: **S** small, **M** medium, **L** large, **XL** multi-system/platform.

### 1. Unified Operations and Exception Inbox

- **Problem/current:** Alerts and dashboard previews are spread across orders, receiving, delivery, disputes, invoices, inventory, staff, and growth.
- **Proposed:** One role-aware inbox with owner, urgency, due time, reason, source data, deep link, status, snooze, escalation, and outcome.
- **Who/why:** Managers, owners, dispatchers, accountants; directly reduces missed exceptions and daily search time.
- **Existing data:** Notification logs, command-center priorities, disputes, failed delivery, stale GPS, overdue invoices, reorder/expiry, labour alerts.
- **Impact/complexity:** Very high operational adoption and retention; **M/L**.

### 2. Closed-Loop Replenishment Copilot

- **Problem/current:** Reorder assistance suggests quantities but does not fully choose supplier, warehouse, price, budget policy, and order action.
- **Proposed:** Explainable reorder cart with days of cover, stockout date, supplier/warehouse options, price waterfall, forecast confidence, approval, and one-click draft/order.
- **Who/why:** Purchasers and restaurant managers; turns intelligence into measurable purchasing savings and fewer stockouts.
- **Existing data:** Inventory, movements, forecasts, MOQ, pack size, lead time, catalog/contract/quote prices, supplier follow/order history, warehouse stock.
- **Impact/complexity:** Very high core value; **L/XL**.

### 3. Three-Way Receiving-to-Invoice Match

- **Problem/current:** Receiving, invoice, dispute, credit, and payment are linked but experienced as separate workflows.
- **Proposed:** Reconciliation screen showing ordered, shipped, delivered, received, accepted, invoiced, credited, and paid quantities/amounts with mismatch action.
- **Who/why:** Receiving staff, accountants, supplier finance; reduces leakage, overbilling, and dispute cycle time.
- **Existing data:** Order snapshots, POD, receiving lines, invoice lines, disputes, credit notes, payments.
- **Impact/complexity:** Very high financial trust; **M/L**.

### 4. Canonical Order Timeline and Status Model

- **Problem/current:** Multiple parallel state machines create confusion around delivered, received, invoiced, disputed, and paid.
- **Proposed:** One human-readable milestone timeline backed by mapped internal sub-states and clear party ownership.
- **Who/why:** Every user plus support; lowers training and prevents false completion promises.
- **Existing data:** Order status, delivery assignments/routes/stops, receiving reports, invoice, dispute, payment, amendments, audit.
- **Impact/complexity:** High trust and support impact; **M/L**.

### 5. Supplier Reliability and Fill-Rate Score

- **Problem/current:** Reviews exist, but operational performance is not a single selection signal.
- **Proposed:** Verified score for fill rate, on-time delivery, quality acceptance, substitutions, disputes, response time, and delivery failures, with transparent calculation.
- **Who/why:** Restaurants choose suppliers; suppliers improve service; platform improves marketplace liquidity.
- **Existing data:** Receiving, order statuses, routes, GPS/ETA, POD, disputes, amendments, reviews.
- **Impact/complexity:** High trust and network effect; **M**.

### 6. Branch-Aware Central Purchasing

- **Problem/current:** Central purchasing is only drafts plus separate pending orders.
- **Proposed:** Organization buying workspace with shared catalog, branch demand aggregation, approval rules, negotiated volume pricing, per-branch allocation, and normal checkout/reservation/audit reuse.
- **Who/why:** Restaurant groups and chains; strongest Scale differentiation and enterprise wedge.
- **Existing data:** Branch accounts, org roles, regional access, central drafts, catalog, contract pricing, orders, billing ownership.
- **Impact/complexity:** Very high enterprise value; **XL**.

### 7. Price Intelligence and Margin Protection

- **Problem/current:** Price events feed recipe impacts, but users must interpret and react manually.
- **Proposed:** Price waterfall, supplier comparison, price-change alerts, contract expiry alerts, margin impact, and renegotiation or menu-price draft.
- **Who/why:** Purchasers, supplier sales, owners, accountants; protects gross margin and improves negotiation.
- **Existing data:** Catalog prices, contract prices, RFQ responses, invoices, supplier price events, recipes, menu prices.
- **Impact/complexity:** High margin impact; **M**.

### 8. Quote-to-Contract Conversion

- **Problem/current:** A winning RFQ locks one order but repeat terms remain manual.
- **Proposed:** Convert accepted quote to dated customer/product contract pricing with supplier approval and restaurant visibility.
- **Who/why:** Supplier sales and restaurant purchasers; reduces repeat negotiation and increases retention.
- **Existing data:** RFQ responses, quote locks, contract pricing, order snapshots, effective dates/MOQ.
- **Impact/complexity:** High efficiency; **S/M**.

### 9. Shortage and Substitution Control Center

- **Problem/current:** Supplier issues and amendments are separate; quantity acceptance remains awkward.
- **Proposed:** One line-level workflow for shortage, substitute, price delta, customer approval, partial shipment, invoice consequence, and replacement.
- **Who/why:** Supplier fulfillment and restaurant receiving; reduces disputes and delivery-cycle delays.
- **Existing data:** Fulfillment issues, substitute products, amendments, receiving, dispute, replacement order, invoice.
- **Impact/complexity:** High service impact; **M**.

### 10. Delivery SLA and Recovery Automation

- **Problem/current:** GPS/ETA and failed retries exist, but action is manual and restaurant communication is limited.
- **Proposed:** Detect ETA breach/stale GPS/failure, assign exception, draft customer update, recommend reassign/reschedule/credit, and track resolution SLA.
- **Who/why:** Dispatchers, drivers, restaurants; turns tracking into service recovery.
- **Existing data:** Assignments, routes/stops, GPS freshness, ETA, POD, failures, requested date, notifications.
- **Impact/complexity:** High retention and trust; **M/L**.

### 11. Collections Risk and Cash Forecast

- **Problem/current:** Aging and reminders exist, but suppliers decide whom to contact and when.
- **Proposed:** Rank receivables by amount, age, payment behavior, disputes, customer health, and expected recovery; forecast cash inflow.
- **Who/why:** Supplier owners/accountants; improves working capital and makes finance a paid reason to stay.
- **Existing data:** Invoices, payments, aging, reminder log, disputes, customer order cadence, sponsorship/growth.
- **Impact/complexity:** High financial value; **M**.

### 12. Payment Links and Reconciliation Hub

- **Problem/current:** Payments are recorded in the platform but external settlement is not a standard closed loop.
- **Proposed:** Payment request/link, provider confirmation, bank/reference matching, partial payment allocation, credits, and reconciliation status.
- **Who/why:** Suppliers and restaurant accountants; reduces cash application work and clarifies “recorded” versus “settled.”
- **Existing data:** Invoice/payment/credit/statement tables, billing gateway abstraction, references and notes.
- **Impact/complexity:** High finance monetization; **L/XL**, provider-dependent.

### 13. Approval-Based Scheduled Orders

- **Problem/current:** Quick lists can remind or auto-create, but price and demand may have changed.
- **Proposed:** Auto-create only when quantity, price variance, supplier, cash, plan lock, and confidence policies pass; otherwise create approval task.
- **Who/why:** Purchasers/managers; lowers risk while preserving automation.
- **Existing data:** Quick lists, schedule, forecast, price resolver, MOQ, inventory, subscriptions, idempotency.
- **Impact/complexity:** High productivity with moderate risk reduction; **M**.

### 14. Branch Benchmark and Spend Control

- **Problem/current:** Consolidated reporting foundation exists, but action-oriented branch variance is limited.
- **Proposed:** Compare branches on spend/unit, supplier price, fill rate, waste, food cost, labour, and late deliveries with explanations.
- **Who/why:** Restaurant org owners/regional managers; supports standardization and cost control.
- **Existing data:** Branch orders, inventory/movements, recipes, receiving, invoices, staff, reservations.
- **Impact/complexity:** High Scale differentiation; **M/L**.

### 15. Supplier Customer Health and Next-Best Action

- **Problem/current:** CRM import/growth metrics and reorder intelligence are separate.
- **Proposed:** Customer health card with cadence risk, spend trend, disputes, overdue balance, last contact, deal response, and recommended action.
- **Who/why:** Supplier owners/sales reps; improves retention, cross-sell, and customer activation.
- **Existing data:** Prospects, follows, orders, cadence, invoices, disputes, chat, deals, sponsorship, reviews.
- **Impact/complexity:** High supplier willingness to pay; **M**.

### 16. Inventory Expiry Rescue and FEFO Planner

- **Problem/current:** Expiry alerts identify risk but do not propose a plan.
- **Proposed:** Recommend first-expire-first-out consumption by recipe/reservation, transfer, markdown, supplier claim, or controlled waste.
- **Who/why:** Kitchen and restaurant managers; reduces waste and improves gross margin.
- **Existing data:** Lots, inventory, expiry, recipes, reservations, menu, waste, supplier/dispute evidence.
- **Impact/complexity:** High measurable savings; **M**.

### 17. Recipe-to-Menu-to-Procurement Bridge

- **Problem/current:** Recipes and B2C menu items are separate; no sales depletion or popularity data.
- **Proposed:** Link menu items to recipes, consume ingredients from sales or configurable production events, and feed demand/reorder/price recommendations.
- **Who/why:** Restaurant owners, chefs, purchasers; connects food cost to actual revenue.
- **Existing data:** Recipes/costs, menu/modifiers, consumer orders, B2B inventory, supplier prices.
- **Impact/complexity:** Very high restaurant ERP value; **L/XL**.

### 18. Reservation-Driven Procurement and Labour Forecast

- **Problem/current:** Reservations, staff, recipes, and purchasing are separate.
- **Proposed:** Convert confirmed covers, party size, occasion, menu mix, and historical consumption into food and labour planning scenarios.
- **Who/why:** Restaurant managers/FOH/purchasers; reduces understaffing, emergency buying, and waste.
- **Existing data:** Reservations, guests, tables, recipes, inventory, orders, staff shifts/time entries, consumer orders.
- **Impact/complexity:** High integrated ERP value; **L**.

### 19. Campaign ROI and Deal Optimizer

- **Problem/current:** Deals, boosts, interactions, and usages are recorded but not tied to incremental margin.
- **Proposed:** Show campaign cost, new/repeat customer effect, order margin, supplier capacity impact, and recommended audience/budget.
- **Who/why:** Supplier promotions managers and owners; makes paid visibility measurable.
- **Existing data:** Promotions, targets, views, interactions, usages, orders, contract/price, billing boost payments, customer growth.
- **Impact/complexity:** High monetization trust; **M**.

### 20. Catalog Data Quality and Substitute Graph

- **Problem/current:** Product quality and substitution information are inconsistent and tenant-specific.
- **Proposed:** Score missing unit/category/image/SKU/allergen/pack data and build supplier-confirmed substitute relationships with price/allergen/availability context.
- **Who/why:** Catalog managers, purchasers, receiving; improves search, reorder, and shortage resolution.
- **Existing data:** Products, imports, image jobs, substitute products, amendments, allergens/dietary tags, order/issue history.
- **Impact/complexity:** High platform quality; **M**.

### 21. Unified Notification-to-Action Workflow

- **Problem/current:** Notifications deliver information but lack ownership and outcome tracking.
- **Proposed:** Convert critical notifications into tasks with acknowledge/assign/snooze/escalate/resolve states.
- **Who/why:** All operator roles; reduces alert fatigue and gives management measurable execution visibility.
- **Existing data:** Notification logs/preferences, audit, role/team data, domain references, job retries.
- **Impact/complexity:** High productivity; **M**.

### 22. Action-Taking Assistant with Approvals

- **Problem/current:** AI assistant is read-only and cannot create a draft or execute work.
- **Proposed:** Let users ask for a draft reorder, reminder, dispute response, route update, or report, then preview/approve under permission and policy.
- **Who/why:** Managers, purchasers, supplier operators; reduces screen navigation while preserving governance.
- **Existing data:** Assistant tools, service commands, RBAC, audit, idempotency, drafts/notifications.
- **Impact/complexity:** High differentiation but high safety requirement; **L/XL**.

### 23. Verified Supplier Service Score

- **Problem/current:** Public ratings are separate from verified operational results.
- **Proposed:** Explainable composite score with fill, on-time, quality, dispute, response, and review dimensions.
- **Who/why:** Restaurants and suppliers; improves marketplace trust and supplier coaching.
- **Existing data:** Reviews, receiving, delivery, disputes, RFQ response, chat/notifications.
- **Impact/complexity:** High marketplace value; **M**.

### 24. Supplier Network Stock Allocation

- **Problem/current:** Supplier branches/warehouses manage stock, but restaurant order promises do not fully use network inventory.
- **Proposed:** See available stock by warehouse/branch, reserve intelligently, recommend transfer/replenishment, and expose reliable promise date.
- **Who/why:** Supplier organizations and restaurant purchasers; increases fill rate and warehouse utilization.
- **Existing data:** Org/branch/warehouse, warehouse inventory, routing, zones, orders, delivery dates, transfers.
- **Impact/complexity:** High supplier Scale value; **L/XL**.

### 25. Customer Self-Service Delivery and Dispute Portal

- **Problem/current:** Restaurant needs internal access for tracking, receiving, dispute, and payment interactions.
- **Proposed:** Secure order portal for status, ETA, POD, receiving confirmation, discrepancy, invoice, payment request, and resolution.
- **Who/why:** Restaurant operators and supplier support; reduces calls and shortens resolution cycle.
- **Existing data:** Tracking payload, POD, receiving, disputes, invoice, payment, secure tokens/session model.
- **Impact/complexity:** High experience value; **M/L**.

### 26. Branch and Organization Data Governance

- **Problem/current:** Branch account, operational branch, supplier tenant, organization, and warehouse scopes are easy to confuse.
- **Proposed:** Scope labels, cross-branch data dictionary, migration warnings, ownership badges, and safe actions in every relevant page.
- **Who/why:** Multi-location owners, admins, support, developers; reduces costly scope mistakes.
- **Existing data:** Org/branch tables, active context, billing tenant resolution, order branch/delivery snapshot.
- **Impact/complexity:** High risk reduction; **S/M**.

### 27. Real-Time Accounting and Integration Hub

- **Problem/current:** CSV and QuickBooks-style exports exist; developer/API and order/invoice webhooks remain incomplete or catalog-only.
- **Proposed:** Stable public API, event subscriptions, accounting connectors, retry/dead-letter monitoring, and tenant-controlled field mapping.
- **Who/why:** Larger restaurants, suppliers, accountants, enterprise buyers; unlocks expansion and lowers integration friction.
- **Existing data:** Route/service contracts, exports, notification webhook signing, audit/event tables.
- **Impact/complexity:** Very high enterprise value; **XL**.

### 28. Mobile Receiving and Inventory Count Sessions

- **Problem/current:** Mobile has operational flows, but some branch-aware receiving/count/import workflows remain web-first.
- **Proposed:** Guided count/receive session with offline queue, barcode/photo support, branch/warehouse scope, discrepancy review, and sync status.
- **Who/why:** Receiving staff, kitchen, warehouse staff; captures better source data where work happens.
- **Existing data:** Mobile API contracts, receiving, inventory movement, lots, POD/file upload, offline UI patterns.
- **Impact/complexity:** High data-quality impact; **M/L**.

### 29. Plan and Feature Truth Monitor

- **Problem/current:** Plan catalog, legacy codes, UI claims, route gates, and catalog-only strings can drift.
- **Proposed:** Automated matrix test that checks every marketed feature against API route, entitlement, UI visibility, mobile parity, and docs status.
- **Who/why:** Product, sales, admin, engineering; protects trust and makes pricing defensible.
- **Existing data:** Feature keys, role matrix, plan catalog, technical feature catalog, parity log, route inventory, conversion events.
- **Impact/complexity:** High risk reduction and sales enablement; **S/M**.

### 30. Product-Led Growth and Retention Intelligence

- **Problem/current:** Usage meters and blocked/conversion events exist, but the platform does not fully explain which workflows drive activation and retention.
- **Proposed:** Cohort dashboard linking onboarding, first order, first receiving, first invoice/payment, supplier activation, feature adoption, support events, and churn signals to plan conversion.
- **Who/why:** Platform leadership and growth teams; improves pricing, onboarding, and investment decisions.
- **Existing data:** Conversion events, usage meters, subscriptions, orders, receiving, invoices, growth sponsorship, feature flags, audit.
- **Impact/complexity:** High strategic value; **M**.

### Recommended sequencing

| Horizon     | Focus                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–90 days   | Canonical timeline, exception inbox, plan-truth monitor, quote-to-contract, shortage/substitution control, scheduled-order guardrails, collections queue.                        |
| 3–9 months  | Closed-loop replenishment, receiving-to-invoice match, supplier reliability score, price intelligence, expiry rescue, customer health, delivery recovery.                        |
| 9–18 months | Central purchasing, recipe/menu/procurement bridge, payment reconciliation, branch benchmarks, supplier network allocation, action-taking assistant, public API/integration hub. |

### Final shareholder conclusion

Supplify has already assembled the difficult operational primitives: multi-tenant access, supplier/restaurant relationships, commercial pricing, transactional orders, inventory reservation, delivery execution, receiving, disputes, invoicing, payments, staff, reservations, growth, and AI-assisted readouts. The next phase should not be defined by adding disconnected screens. It should be defined by making the existing record act as a reliable operating loop.

The clearest strategic position is:

> **Supplify is the control plane for restaurant supply: it turns fragmented supplier interactions into a traceable, increasingly intelligent cycle of buy, fulfill, receive, reconcile, pay, and replenish.**

The strongest proof of that position will be measurable outcomes: fewer stockouts, less waste, higher supplier fill rate, faster dispute resolution, lower overdue balances, more predictable delivery, better gross margin, higher branch purchasing leverage, and more successful restaurant/supplier conversions.

---

## Source index used for this study

- API composition: `apps/api/src/server.js`
- Permission keys: `apps/api/src/lib/permission-keys.js`
- Role matrix: `apps/api/src/lib/role-matrix.js`
- Order transitions: `apps/api/src/lib/order-status-transitions.js`
- Price resolution: `apps/api/src/services/resolve-product-price.service.js`
- Restaurant order creation: `apps/api/src/services/restaurant-order-create.service.js`
- Receiving: `apps/api/src/routes/receiving.routes.js`, `apps/api/src/services/receiving.service.js`
- Invoice creation/payment: `apps/api/src/services/invoice.service.js`, `apps/api/src/routes/payments.routes.js`
- Warehouse and delivery: `apps/api/src/services/warehouse-routing.service.js`, `apps/api/src/services/driver-fulfillment.service.js`, `apps/api/src/services/driver-location.service.js`, `apps/api/src/services/delivery-retry.service.js`
- Reorder/AI: `apps/api/src/services/reorder-assistance.service.js`, `apps/api/src/services/reorder-forecast.service.js`, `apps/api/src/services/reorder-ai.service.js`, `apps/api/src/routes/assistant.routes.js`
- Jobs: `apps/api/src/lib/register-cron-jobs.js`, `apps/api/src/jobs/`
- Web routes: `apps/web/src/App.tsx`
- Product catalog: `docs/product/feature-catalog-full.md`, `docs/product/feature-catalog-technical.md`
- Current pricing: `docs/product/four-plan-pricing-model.md`, `docs/product/plans-and-limits.md`
- Feature evidence: `docs/features/`
- Mobile parity: `docs/mobile/MOBILE_FEATURE_PARITY.md`, `C:\myProjects\supplify-mobile`, `C:\myProjects\supplify-mobile-ios`

**Bottom line:** The repository supports a substantial B2B restaurant-supply operating product. Its greatest unrealized value is the connection layer that converts recorded facts into explainable, approved, and measurable actions.
