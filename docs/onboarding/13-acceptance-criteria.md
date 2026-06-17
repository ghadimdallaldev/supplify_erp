# 13 — Acceptance Criteria

**Audience:** QA, product owners, implementation engineers, release managers.  
**Purpose:** Pass/fail definitions for every major Supplify capability.  
**Evidence base:** `apps/api/src/routes/`, `apps/web/src/pages/`, `apps/api/src/lib/permission-keys.js`, `apps/api/src/lib/feature-keys.js`, `tests/e2e/suites/`, `docs/audits/route-inventory.json` (554 routes).

**Status legend:** `Shipped` = production-intent in main branch; `Partial` = known gaps documented; `Planned` = not in codebase.

---

## 1. Authentication & session (OIDC)

| Field             | Criteria                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **Feature**       | Keycloak OIDC login, session cookies, logout                                                                   |
| **Preconditions** | Keycloak reachable; `KEYCLOAK_*` env aligned; realm `Supplify`                                                 |
| **Role**          | Any platform role                                                                                              |
| **Plan**          | Any                                                                                                            |
| **Success path**  | `GET /auth/login` → Keycloak → `GET /auth/callback` → cookies set → `GET /auth/me` 200 with user + permissions |
| **Alternatives**  | Bearer token (mobile); `POST /auth/refresh` on expired access token                                            |
| **Validation**    | Browser lands `/app/*`; `access_token` httpOnly cookie; logout clears cookies + Keycloak end-session           |
| **Permissions**   | N/A (pre-auth)                                                                                                 |
| **API**           | `auth.routes.js`: login, callback, logout, me, refresh, session                                                |
| **UI**            | `/login`, `AuthGuard`, redirect `?expired=true`                                                                |
| **DB**            | `app_user` upsert on first `/auth/me` via `upsertUser()`                                                       |
| **Notifications** | N/A                                                                                                            |
| **Error cases**   | Invalid state → redirect `/login?error=callback_failed`; expired JWT → refresh or redirect expired             |
| **Security**      | OAuth state in session; CSRF on mutations; JWT verified via JWKS                                               |
| **Mobile**        | PKCE public client; Bearer auth skips CSRF (`csrf.test.js`)                                                    |
| **Test coverage** | `tests/e2e/suites/critical_e2e/auth.spec.ts`; `apps/api/src/lib/mobile-auth.integration.test.js`               |
| **Status**        | Shipped                                                                                                        |

---

## 2. Tenant registration & activation

| Field             | Criteria                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Feature**       | Self-serve org registration and account activation                                                         |
| **Preconditions** | Keycloak registration enabled; legal policies seeded                                                       |
| **Role**          | `PENDING` → `RESTAURANT` or `SUPPLIER`                                                                     |
| **Plan**          | Free Trial default; `lock_reason = pending_activation` until activation                                    |
| **Success path**  | `/register/complete` → tenant + subscription + system roles → Free checkout or paid billing → lock cleared |
| **Alternatives**  | Admin-created tenant; referral `?ref=` token                                                               |
| **Validation**    | `GET /api/subscriptions/current` shows active; writes allowed (not 402)                                    |
| **Permissions**   | Owner role auto-assigned                                                                                   |
| **API**           | `register.routes.js`, `billing.routes.js`                                                                  |
| **UI**            | `RegisterCompletePage`, `AccountActivationPage`                                                            |
| **DB**            | `restaurant`/`supplier`, `subscription`, `tenant_roles`, `tenant_user_roles`                               |
| **Notifications** | Welcome email (SMTP configured)                                                                            |
| **Error cases**   | Duplicate slug; billing failure leaves lock; 402 on writes when locked                                     |
| **Security**      | CSRF; rate limits on public routes                                                                         |
| **Mobile**        | Registration via web; mobile uses existing accounts                                                        |
| **Test coverage** | `register-account` tests; e2e partial                                                                      |
| **Status**        | Shipped                                                                                                    |

---

## 3. RBAC — restaurant workspace roles

| Field             | Criteria                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| **Feature**       | Seven system roles with permission keys                                           |
| **Preconditions** | Tenant roles synced via `ensureTenantSystemRoles()`                               |
| **Role**          | Owner, Manager, Purchaser, Receiving, Accountant, Viewer, FOH                     |
| **Plan**          | `advanced_roles` for custom roles (Gold+)                                         |
| **Success path**  | User invited → role assigned → sidebar/API match matrix                           |
| **Alternatives**  | Custom tenant role with permission subset                                         |
| **Validation**    | Purchaser: `ORDERS_CREATE` yes, `INVOICES_MANAGE` no; API returns 403 when denied |
| **Permissions**   | 52 keys in `permission-keys.js`; `_MANAGE` implies `_VIEW`                        |
| **API**           | `requirePermission` on all mutating routes                                        |
| **UI**            | `RequirePermission`, `Sidebar` filtered by `navItemAllowed`                       |
| **DB**            | `tenant_role_permissions`, `tenant_user_roles`                                    |
| **Notifications** | Invite email on team add                                                          |
| **Error cases**   | Last owner demotion edge case (documented gap)                                    |
| **Security**      | Server-side enforcement mandatory; UI mirrors only                                |
| **Mobile**        | Same permission payload in `/auth/me`                                             |
| **Test coverage** | `rbac-full-app.test.js`; `tests/e2e/suites/critical_e2e/rbac.spec.ts`             |
| **Status**        | Shipped                                                                           |

---

## 4. RBAC — supplier workspace roles

| Field             | Criteria                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| **Feature**       | Nine supplier system roles including Driver isolation                     |
| **Preconditions** | Driver user linked in team/drivers                                        |
| **Role**          | Driver sees only `DRIVER_DELIVERIES_*`                                    |
| **Plan**          | `driver_management`, `fulfillment`                                        |
| **Success path**  | Driver login → `/app/driver-deliveries` only; status updates allowed enum |
| **Alternatives**  | Warehouse Manager sees fulfillment board                                  |
| **Validation**    | Driver cannot access `/app/products` (403 or hidden nav)                  |
| **Permissions**   | `driver-rbac.js` `DRIVER_ALLOWED_STATUS_UPDATES`                          |
| **API**           | `fulfillment.routes.js`, `drivers.routes.js`                              |
| **UI**            | Driver sidebar single item (`sidebarNavConfig.ts`)                        |
| **DB**            | `tenant_user_roles`, driver assignment tables                             |
| **Notifications** | Assignment notifications to driver                                        |
| **Error cases**   | Invalid status transition rejected                                        |
| **Security**      | Driver scoped to assigned routes only                                     |
| **Mobile**        | Driver flows in `supplify-mobile`                                         |
| **Test coverage** | `driver-rbac` tests; `drivers.routes.test.js`                             |
| **Status**        | Shipped                                                                   |

---

## 5. Subscriptions & plan enforcement

| Field             | Criteria                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| **Feature**       | Plan features and limits enforced at runtime                                  |
| **Preconditions** | `subscription` + `subscription_plan` rows                                     |
| **Role**          | Tenant member                                                                 |
| **Plan**          | free, silver, gold, platinum per `plan-codes.js`                              |
| **Success path**  | Action within limit → 200; feature on → UI visible                            |
| **Alternatives**  | Admin limit override (increase-only); branch addons                           |
| **Validation**    | `GET /api/subscriptions/usage/:meterType`; 402 when billing locked            |
| **Permissions**   | `SUBSCRIPTIONS_VIEW` / `SUBSCRIPTIONS_MANAGE` for billing UI                  |
| **API**           | `requireFeature()`, `checkPlanLimit()`, `billingAccessMiddleware`             |
| **UI**            | `FeatureLockedCard`, `UpgradeModal`, usage banners                            |
| **DB**            | `subscription`, `plan_limit_override`, `tenant_limit_override`                |
| **Notifications** | Trial ending emails (`trial-ending-soon.job`)                                 |
| **Error cases**   | Free sandbox expired → read-only; past due grace → banner                     |
| **Security**      | Impersonation does not bypass billing lock                                    |
| **Mobile**        | Plan gates in mobile guards                                                   |
| **Test coverage** | `subscription-limits.spec.ts`; `plan-enforcement` tests; `verify-tier-matrix` |
| **Status**        | Shipped                                                                       |

---

## 6. Supplier catalog & products

| Field             | Criteria                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| **Feature**       | Product CRUD, CSV import, image ZIP import                                     |
| **Preconditions** | Supplier tenant; `supplier_products_skus` headroom                             |
| **Role**          | Catalog Manager or Owner                                                       |
| **Plan**          | Catalog always; storage `storage_mb` for images                                |
| **Success path**  | Create/edit product → visible in `GET /api/products` for connected restaurants |
| **Alternatives**  | CSV bulk; async ZIP import job (`0168`)                                        |
| **Validation**    | SKU unique per supplier; image thumb URL populated                             |
| **Permissions**   | `CATALOG_VIEW`, `CATALOG_EDIT`, `CATALOG_MANAGE`                               |
| **API**           | `products.routes.js`                                                           |
| **UI**            | `ProductsPage`, `ProductImageImportDialog`                                     |
| **DB**            | `product`, `catalog`, `catalog_image_import_job`                               |
| **Notifications** | Import job completion (in-app)                                                 |
| **Error cases**   | Limit exceeded → 402/403 with upgrade CTA; bad CSV row errors                  |
| **Security**      | Supplier-scoped queries only                                                   |
| **Mobile**        | Product browse parity                                                          |
| **Test coverage** | `products.routes.test.js`; e2e `catalog.spec.ts`                               |
| **Status**        | Shipped                                                                        |

---

## 7. Contract pricing

| Field             | Criteria                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| **Feature**       | Per-restaurant negotiated prices                                           |
| **Preconditions** | Restaurant–supplier relationship                                           |
| **Role**          | Supplier sets; Restaurant views                                            |
| **Plan**          | Effectively Gold workflows (contract pricing routes)                       |
| **Success path**  | Supplier sets contract price → restaurant sees "Your price" on browse/cart |
| **Alternatives**  | CSV contract import                                                        |
| **Validation**    | `resolveProductPricesBatch` returns override                               |
| **Permissions**   | `CATALOG_VIEW` / `CATALOG_EDIT`                                            |
| **API**           | `prices.routes.js`, `restaurant-pricing.routes.js`                         |
| **UI**            | `/app/contract-pricing`, `/app/my-prices`                                  |
| **DB**            | `price`, `restaurant_pricing`                                              |
| **Notifications** | N/A                                                                        |
| **Error cases**   | Price for unfollowed restaurant rejected                                   |
| **Security**      | Tenant isolation on both sides                                             |
| **Mobile**        | Price resolution on mobile catalog                                         |
| **Test coverage** | `restaurant-pricing.routes.test.js`                                        |
| **Status**        | Shipped                                                                    |

---

## 8. Restaurant cart & order placement

| Field             | Criteria                                        |
| ----------------- | ----------------------------------------------- |
| **Feature**       | Multi-supplier cart, checkout, order create     |
| **Preconditions** | Followed supplier; items in stock               |
| **Role**          | Purchaser+ with `ORDERS_CREATE`                 |
| **Plan**          | `orders_per_day` meter                          |
| **Success path**  | Cart → place → `customer_order` status `PLACED` |
| **Alternatives**  | Save draft `DRAFT`; quick list order            |
| **Validation**    | Supplier notification; order appears both sides |
| **Permissions**   | `ORDERS_CREATE`                                 |
| **API**           | `POST /api/orders`                              |
| **UI**            | `CartPage`                                      |
| **DB**            | `customer_order`, `order_item`                  |
| **Notifications** | `notifyTenantUsers` to supplier                 |
| **Error cases**   | Daily limit → upgrade CTA; billing lock 402     |
| **Security**      | Restaurant can only order connected suppliers   |
| **Mobile**        | Cart/checkout parity                            |
| **Test coverage** | e2e `orders.spec.ts`; `orders.routes.test.js`   |
| **Status**        | Shipped                                         |

---

## 9. Supplier order inbox & decline

| Field             | Criteria                                             |
| ----------------- | ---------------------------------------------------- |
| **Feature**       | Accept, decline, process orders                      |
| **Preconditions** | Order `PLACED`                                       |
| **Role**          | Supplier Manager+                                    |
| **Plan**          | Core                                                 |
| **Success path**  | Accept → `ACKNOWLEDGED` → fulfillment path           |
| **Alternatives**  | Decline with required `decline_reason` → `CANCELLED` |
| **Validation**    | Restaurant sees status + reason                      |
| **Permissions**   | `ORDERS_MANAGE`                                      |
| **API**           | `PATCH /api/orders/:id/status`                       |
| **UI**            | `OrdersPage`, decline modal                          |
| **DB**            | `cancel_reason`, `cancelled_by` columns              |
| **Notifications** | Status change to restaurant                          |
| **Error cases**   | Invalid transition rejected by `order-statuses.js`   |
| **Security**      | Supplier owns order via `supplier_id`                |
| **Mobile**        | Supplier order actions                               |
| **Test coverage** | Order status tests; e2e orders                       |
| **Status**        | Shipped                                              |

---

## 10. Fulfillment, dispatch & routes

| Field             | Criteria                                                             |
| ----------------- | -------------------------------------------------------------------- |
| **Feature**       | Fulfillment board, driver assignment, route planning                 |
| **Preconditions** | Order in fulfillable status; warehouses optional                     |
| **Role**          | Warehouse Manager, Fulfillment Staff                                 |
| **Plan**          | `fulfillment`, `fulfillment_tools`, `warehouses`                     |
| **Success path**  | Assign driver → route built → statuses through `SHIPPED`/`DELIVERED` |
| **Alternatives**  | Manual status without driver                                         |
| **Validation**    | Board refreshes; assignment on order detail                          |
| **Permissions**   | `FULFILLMENT_VIEW`, `FULFILLMENT_MANAGE`                             |
| **API**           | `/api/fulfillment/*`, `routes/build-from-assignments`                |
| **UI**            | `FulfillmentPage`, `DriverDispatchBoard`                             |
| **DB**            | fulfillment assignments, routes (`0127`)                             |
| **Notifications** | Driver assignment alerts                                             |
| **Error cases**   | Feature off → locked UI                                              |
| **Security**      | Supplier-scoped                                                      |
| **Mobile**        | Driver delivery screen                                               |
| **Test coverage** | `DriverDispatchBoard.test.tsx`; fulfillment route tests              |
| **Status**        | Shipped                                                              |

---

## 11. GPS tracking & delivery ETA

| Field             | Criteria                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| **Feature**       | Driver location pings, restaurant tracking map, stale detection         |
| **Preconditions** | `GPS_TRACKING_ENABLED=true`; assignment in transit                      |
| **Role**          | Driver posts; Restaurant views                                          |
| **Plan**          | Platform env gate (not plan-gated by design)                            |
| **Success path**  | Driver location POST → restaurant order tracking shows map/ETA          |
| **Alternatives**  | Stale badge after `GPS_STALE_AFTER_SECONDS` (300)                       |
| **Validation**    | `delivery-eta.service` payload; privacy flags for name/phone            |
| **Permissions**   | `DRIVER_DELIVERIES_MANAGE`; restaurant `ORDERS_VIEW`                    |
| **API**           | driver location endpoints; tracking on order                            |
| **UI**            | `RestaurantOrderTrackingPanel`, maps components                         |
| **DB**            | driver location history; retention job                                  |
| **Notifications** | Optional push on delivery milestones                                    |
| **Error cases**   | GPS disabled globally → tracking hidden                                 |
| **Security**      | `GPS_RESTAURANT_SHOW_DRIVER_PHONE` default false                        |
| **Mobile**        | Primary GPS capture surface                                             |
| **Test coverage** | `delivery-eta.service.test.js`; `RestaurantOrderTrackingPanel.test.tsx` |
| **Status**        | Shipped                                                                 |

---

## 12. Receiving & quality

| Field             | Criteria                                              |
| ----------------- | ----------------------------------------------------- |
| **Feature**       | Goods-in against delivered orders                     |
| **Preconditions** | Order `DELIVERED`+                                    |
| **Role**          | Receiving Staff (`RECEIVING_MANAGE`)                  |
| **Plan**          | `receiving_quality` for photos/scoring                |
| **Success path**  | Receive lines → `RECEIVED_FULL` or `RECEIVED_PARTIAL` |
| **Alternatives**  | Partial receive                                       |
| **Validation**    | Inventory updated; invoice path unlocked              |
| **Permissions**   | `RECEIVING_VIEW`, `RECEIVING_MANAGE`                  |
| **API**           | `receiving.routes.js`                                 |
| **UI**            | `ReceivingPage`                                       |
| **DB**            | `receiving_report`, `receiving_line_item`             |
| **Notifications** | Supplier notified on receive                          |
| **Error cases**   | Feature locked → `FeatureLockedCard`                  |
| **Security**      | Restaurant-scoped                                     |
| **Mobile**        | Receiving partial parity                              |
| **Test coverage** | `receiving-delivered.spec.ts`                         |
| **Status**        | Shipped                                               |

---

## 13. Disputes & credit notes

| Field             | Criteria                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| **Feature**       | Open dispute, review, resolve, credit/replacement                              |
| **Preconditions** | Received order; `disputes_returns` feature                                     |
| **Role**          | Restaurant opens; Supplier resolves                                            |
| **Plan**          | `disputes_returns`                                                             |
| **Success path**  | Dispute → `RECEIVED_WITH_DISPUTE` → resolve → credit note or replacement order |
| **Alternatives**  | Cancel dispute                                                                 |
| **Validation**    | Credit note applies to invoice                                                 |
| **Permissions**   | `ORDERS_*` / `RECEIVING_*` create; supplier `FULFILLMENT_VIEW` incoming        |
| **API**           | `disputes.routes.js`, `credit-notes.routes.js`                                 |
| **UI**            | `DisputesPage`, `DisputeDetailPage`                                            |
| **DB**            | `disputes`, `dispute_items`, `credit_note`                                     |
| **Notifications** | Dispute opened/resolved                                                        |
| **Error cases**   | Feature off hides nav                                                          |
| **Security**      | Cross-tenant only via order relationship                                       |
| **Mobile**        | Limited                                                                        |
| **Test coverage** | `disputes.routes.test.js`                                                      |
| **Status**        | Shipped                                                                        |

---

## 14. Invoices & payments (AP/AR)

| Field             | Criteria                                                 |
| ----------------- | -------------------------------------------------------- |
| **Feature**       | Invoice lifecycle, record payment, credit notes          |
| **Preconditions** | Order received or manual invoice                         |
| **Role**          | Accountant                                               |
| **Plan**          | `finance_invoices`                                       |
| **Success path**  | `DRAFT` → `ISSUED` → `PAID`                              |
| **Alternatives**  | Partial payment; void                                    |
| **Validation**    | Both tenant invoice lists consistent                     |
| **Permissions**   | `INVOICES_*`, `PAYMENTS_*`                               |
| **API**           | `invoices.routes.js`, `payments.routes.js`               |
| **UI**            | `InvoicesPage`                                           |
| **DB**            | `invoice`, `payment`, `invoice_line`                     |
| **Notifications** | Overdue job emails                                       |
| **Error cases**   | Feature off → locked                                     |
| **Security**      | Tenant-scoped                                            |
| **Mobile**        | Invoice list parity                                      |
| **Test coverage** | `invoices.routes.test.js`; `invoice-overdue.job.test.js` |
| **Status**        | Shipped                                                  |

---

## 15. Restaurant finance & statements

| Field             | Criteria                                                            |
| ----------------- | ------------------------------------------------------------------- |
| **Feature**       | Per-supplier statements, aging, analytics                           |
| **Preconditions** | Invoices exist                                                      |
| **Role**          | Accountant                                                          |
| **Plan**          | `finance_invoices`, `reports` for analytics widgets                 |
| **Success path**  | Statement shows charges/payments in selected period                 |
| **Alternatives**  | Export                                                              |
| **Validation**    | Closing balance within period correct                               |
| **Permissions**   | `INVOICES_VIEW`                                                     |
| **API**           | `restaurant-finance.routes.js`                                      |
| **UI**            | Finance tabs on invoices/dashboard                                  |
| **DB**            | invoice/payment aggregates                                          |
| **Notifications** | N/A                                                                 |
| **Error cases**   | **Opening balance hardcoded 0** (`openingBalance: 0` TODO line 795) |
| **Security**      | Restaurant-only data                                                |
| **Mobile**        | Partial                                                             |
| **Test coverage** | Sparse on statement rollup                                          |
| **Status**        | Partial                                                             |

---

## 16. Quick lists & scheduled orders

| Field             | Criteria                                                           |
| ----------------- | ------------------------------------------------------------------ |
| **Feature**       | Saved order templates; scheduled placement                         |
| **Preconditions** | `quick_lists` feature                                              |
| **Role**          | Purchaser                                                          |
| **Plan**          | Limits: `quick_lists`, `quick_list_items`, `scheduled_quick_lists` |
| **Success path**  | Create list → order from list → cron places scheduled              |
| **Alternatives**  | Free grace overflow once/day (`scheduled_order_grace_per_day`)     |
| **Validation**    | Order created from template; cron job registered                   |
| **Permissions**   | `ORDERS_VIEW`                                                      |
| **API**           | `quick-lists.routes.js`; `scheduled-orders.service.js`             |
| **UI**            | `QuickListsPage`                                                   |
| **DB**            | `quick_list`, `quick_list_item`                                    |
| **Notifications** | Scheduled order confirmation                                       |
| **Error cases**   | Limit banner at cap                                                |
| **Security**      | Restaurant-scoped                                                  |
| **Mobile**        | Quick lists parity                                                 |
| **Test coverage** | `planLimits.test.ts`; e2e nightly                                  |
| **Status**        | Shipped                                                            |

---

## 17. Smart reorder & AI assistant

| Field             | Criteria                                                            |
| ----------------- | ------------------------------------------------------------------- |
| **Feature**       | Reorder suggestions; AI reorder assistant                           |
| **Preconditions** | Inventory history; `smart_reorder` / `ai_platform`                  |
| **Role**          | Manager                                                             |
| **Plan**          | `smart_reorder`; `ai_requests_per_day` on Gold+                     |
| **Success path**  | Dashboard widget shows suggestions; AI chat returns recommendations |
| **Alternatives**  | Manual quick list                                                   |
| **Validation**    | `GET /api/restaurant-inventory/reorder-suggestions`                 |
| **Permissions**   | `INVENTORY_VIEW`                                                    |
| **API**           | reorder forecast job; AI routes                                     |
| **UI**            | Dashboard widget (no dedicated nav)                                 |
| **DB**            | `restaurant_inventory`, forecast queue                              |
| **Notifications** | N/A                                                                 |
| **Error cases**   | AI limit exceeded                                                   |
| **Security**      | Tenant-scoped; no PII in prompts audit                              |
| **Mobile**        | Partial                                                             |
| **Test coverage** | `ai-platform.test.js`; sparse E2E                                   |
| **Status**        | Partial (UI surfacing limited)                                      |

---

## 18. Restaurant & supplier inventory

| Field             | Criteria                                                      |
| ----------------- | ------------------------------------------------------------- |
| **Feature**       | On-hand stock, expiry, waste, supplier warehouse stock        |
| **Preconditions** | `inventory_management`                                        |
| **Role**          | Manager / Warehouse Manager                                   |
| **Plan**          | SKU limits differ by tenant type                              |
| **Success path**  | CRUD inventory → movements logged → expiry alerts             |
| **Alternatives**  | Waste tab (`waste_tracking`)                                  |
| **Validation**    | Par/low stock badges                                          |
| **Permissions**   | `INVENTORY_VIEW`, `INVENTORY_EDIT`, `INVENTORY_MANAGE`        |
| **API**           | `restaurant-inventory.routes.js`, `inventory.routes.js`       |
| **UI**            | `RestaurantInventoryPage`, supplier `InventoryPage`           |
| **DB**            | `restaurant_inventory`, `inventory`, `inventory_movement_log` |
| **Notifications** | Low stock alerts                                              |
| **Error cases**   | SKU cap on Free                                               |
| **Security**      | Branch-scoped where applicable                                |
| **Mobile**        | Inventory views                                               |
| **Test coverage** | `inventory-expiry.service.test.js`                            |
| **Status**        | Shipped                                                       |

---

## 19. Deals & promotions

| Field             | Criteria                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| **Feature**       | Supplier promotions; admin approval; restaurant redemption               |
| **Preconditions** | `promotions` (supplier); `supplier_deals` (restaurant)                   |
| **Role**          | Promotions Manager; Admin approver                                       |
| **Plan**          | `promotions` limit; `deal_redemptions_per_day`                           |
| **Success path**  | Create deal → admin approve → active → restaurant redeems at cart        |
| **Alternatives**  | Boost placement; coupon codes                                            |
| **Validation**    | Deal status transitions; redemption counter                              |
| **Permissions**   | `PROMOTIONS_*`; admin `ADMIN_GROWTH`                                     |
| **API**           | `promotions.routes.js`, `deal-promotions.service.js`                     |
| **UI**            | `PromotionsPage`, `DealsPage`, admin Deals tab                           |
| **DB**            | `deal_promotion`, redemption tables                                      |
| **Notifications** | Approval/rejection                                                       |
| **Error cases**   | Pending deals invisible to restaurants; locked shows `FeatureLockedCard` |
| **Security**      | Supplier cannot approve own deals                                        |
| **Mobile**        | Deals browse                                                             |
| **Test coverage** | `promotions-deals-gates.spec.ts`; `PromotionsPage.locked.test.tsx`       |
| **Status**        | Shipped                                                                  |

---

## 20. Chat & realtime messaging

| Field             | Criteria                                                 |
| ----------------- | -------------------------------------------------------- |
| **Feature**       | Restaurant–supplier chat with files, typing, order links |
| **Preconditions** | `chat` feature; Socket.IO + Redis adapter in prod        |
| **Role**          | Users with `CHAT_VIEW`/`CHAT_SEND`                       |
| **Plan**          | `chats_per_day`, `open_conversations`                    |
| **Success path**  | Open conversation → send message → realtime delivery     |
| **Alternatives**  | Admin support chat                                       |
| **Validation**    | Message persisted; read receipts per plan tier           |
| **Permissions**   | `CHAT_*`                                                 |
| **API**           | `chat.routes.js`                                         |
| **UI**            | `ChatPage`, `useChatRealtime`                            |
| **DB**            | `conversation`, `message`                                |
| **Notifications** | In-app + optional push                                   |
| **Error cases**   | Daily chat limit; socket disconnect retry                |
| **Security**      | Conversation membership enforced                         |
| **Mobile**        | Chat parity                                              |
| **Test coverage** | `useChatRealtime.test.ts`; chat route tests              |
| **Status**        | Shipped                                                  |

---

## 21. Reservations (FOH)

| Field             | Criteria                                                   |
| ----------------- | ---------------------------------------------------------- |
| **Feature**       | Floor plan, bookings, waitlist, public guest portal        |
| **Preconditions** | Branch hours configured                                    |
| **Role**          | FOH Staff or Manager                                       |
| **Plan**          | No dedicated feature key (core module)                     |
| **Success path**  | Create reservation → guest manages via token URL           |
| **Alternatives**  | Waitlist auto-promo (`waitlist_auto_promo`)                |
| **Validation**    | Table assignment; availability rules                       |
| **Permissions**   | `RESERVATIONS_*`                                           |
| **API**           | `reservations.routes.js`, `public.routes.js`               |
| **UI**            | `ReservationsPage`, `/reserve/*`                           |
| **DB**            | `reservation`, `reservation_table`, waitlist               |
| **Notifications** | Guest SMS/email/WhatsApp                                   |
| **Error cases**   | Double-booking prevented                                   |
| **Security**      | Public tokens unguessable                                  |
| **Mobile**        | Public booking responsive                                  |
| **Test coverage** | `reservations.routes.test.js`; `ReservationsPage.test.tsx` |
| **Status**        | Shipped                                                    |

---

## 22. Staff directory & staff portal

| Field             | Criteria                                                          |
| ----------------- | ----------------------------------------------------------------- |
| **Feature**       | Roster, shifts, staff portal self-service                         |
| **Preconditions** | Staff records; portal account provisioned                         |
| **Role**          | `STAFF_PORTAL` isolated from `/app`                               |
| **Plan**          | Team limits `users`                                               |
| **Success path**  | Manager provisions portal → staff logs `/staff/login` → dashboard |
| **Alternatives**  | PTO / shift swap                                                  |
| **Validation**    | Staff gets 403 on main app APIs                                   |
| **Permissions**   | `STAFF_*`                                                         |
| **API**           | `staff.routes.js`, `staff-portal-auth.js`                         |
| **UI**            | `StaffPage`, `/staff/dashboard`                                   |
| **DB**            | staff tables; `staff_portal` link                                 |
| **Notifications** | Shift reminders                                                   |
| **Error cases**   | Disabled Keycloak user cannot login                               |
| **Security**      | `assertStaffPortalRouteAccess`                                    |
| **Mobile**        | Staff portal web responsive                                       |
| **Test coverage** | `staff.routes.test.js`                                            |
| **Status**        | Shipped                                                           |

---

## 23. Consumer B2C ordering

| Field             | Criteria                                            |
| ----------------- | --------------------------------------------------- |
| **Feature**       | Public storefront, guest checkout, consumer loyalty |
| **Preconditions** | Menu configured; branch hours                       |
| **Role**          | Guest / light consumer account                      |
| **Plan**          | Restaurant enables consumer modules                 |
| **Success path**  | `/order/:slug` → menu → checkout → track            |
| **Alternatives**  | Takeaway vs delivery zones on branch                |
| **Validation**    | Order in `consumer_orders`; receipt token works     |
| **Permissions**   | Restaurant admin `consumer-menu`, `consumer-orders` |
| **API**           | `apps/api/src/routes/consumer/*`                    |
| **UI**            | `apps/web/src/pages/consumer/*`                     |
| **DB**            | migrations `0161`–`0164`                            |
| **Notifications** | Guest order status                                  |
| **Error cases**   | Outside hours; zone not serviceable                 |
| **Security**      | Public routes rate-limited                          |
| **Mobile**        | Responsive PWA                                      |
| **Test coverage** | `consumer-ordering.spec.ts` smoke                   |
| **Status**        | Shipped                                             |

---

## 24. Supplier customer growth program

| Field             | Criteria                                               |
| ----------------- | ------------------------------------------------------ |
| **Feature**       | CSV import, invites, referrals, sponsorship            |
| **Preconditions** | `supplier_growth` on Gold+                             |
| **Role**          | Manager with `GROWTH_VIEW`, `CUSTOMERS_IMPORT`         |
| **Plan**          | Sponsorship limits per year                            |
| **Success path**  | Import prospects → invite → connection or registration |
| **Alternatives**  | Referral link `/register?ref=`                         |
| **Validation**    | Growth metrics API                                     |
| **Permissions**   | `GROWTH_VIEW`, `CUSTOMERS_IMPORT`                      |
| **API**           | growth program routes; `0169` tables                   |
| **UI**            | `CustomerGrowthPage`                                   |
| **DB**            | import batches, referrals, sponsorship                 |
| **Notifications** | Invite emails                                          |
| **Error cases**   | Feature off hides nav                                  |
| **Security**      | Import data tenant-scoped                              |
| **Mobile**        | N/A                                                    |
| **Test coverage** | `supplier-growth-program.test.js`                      |
| **Status**        | Shipped                                                |

---

## 25. Quote requests (RFQ)

| Field             | Criteria                                               |
| ----------------- | ------------------------------------------------------ |
| **Feature**       | Multi-supplier RFQ, compare responses, add to cart     |
| **Preconditions** | Connected suppliers                                    |
| **Role**          | Restaurant creates; Supplier responds                  |
| **Plan**          | Core ordering                                          |
| **Success path**  | RFQ sent → supplier quotes lines → restaurant compares |
| **Alternatives**  | Add winning lines to cart (manual checkout)            |
| **Validation**    | Notifications `quote_request_received`                 |
| **Permissions**   | `ORDERS_CREATE`                                        |
| **API**           | `quote-requests.service.js`                            |
| **UI**            | `/app/quote-requests/*`                                |
| **DB**            | `0153` schema                                          |
| **Notifications** | Email/in-app on quote events                           |
| **Error cases**   | Quoted price informational only at order create        |
| **Security**      | Suppliers see only their RFQ lines                     |
| **Mobile**        | Limited                                                |
| **Test coverage** | Service tests                                          |
| **Status**        | Shipped (quote price not auto-applied at checkout)     |

---

## 26. Reports & analytics

| Field             | Criteria                                          |
| ----------------- | ------------------------------------------------- |
| **Feature**       | KPI dashboards, usage, waste, supplier revenue    |
| **Preconditions** | `reports` feature                                 |
| **Role**          | Manager+ with report permissions                  |
| **Plan**          | Tier strings: basic → advanced forecasting        |
| **Success path**  | `/app/reports` loads charts for date range        |
| **Alternatives**  | Dashboard widgets subset                          |
| **Validation**    | `GET /api/reports/*` returns data                 |
| **Permissions**   | `ORDERS_VIEW` / `INVOICES_VIEW` / analytics anyOf |
| **API**           | `reports.routes.js`                               |
| **UI**            | `ReportsPage`                                     |
| **DB**            | analytics indexes `0071`                          |
| **Notifications** | N/A                                               |
| **Error cases**   | Feature off hides nav                             |
| **Security**      | Tenant-scoped aggregates only                     |
| **Mobile**        | Reports limited                                   |
| **Test coverage** | Report route tests                                |
| **Status**        | Shipped                                           |

---

## 27. Admin platform command center

| Field             | Criteria                                                        |
| ----------------- | --------------------------------------------------------------- |
| **Feature**       | Tenant admin, plans, limits, impersonation, ops health          |
| **Preconditions** | `role: ADMIN` + granular `adminPermissions`                     |
| **Role**          | Platform admin                                                  |
| **Plan**          | N/A                                                             |
| **Success path**  | `/app/admin` tabs load with lazy queries + `skip` when inactive |
| **Alternatives**  | Supplier/restaurant scoped admin portals                        |
| **Validation**    | Overview KPIs; audit on impersonation                           |
| **Permissions**   | `ADMIN_*` keys                                                  |
| **API**           | `/api/admin-dashboard/*` (47+ routes)                           |
| **UI**            | `AdminDashboardPage` + tab components                           |
| **DB**            | all tenants                                                     |
| **Notifications** | N/A                                                             |
| **Error cases**   | Tab hidden without permission                                   |
| **Security**      | Impersonation signed cookie; audit logged                       |
| **Mobile**        | Admin usable but desktop-first                                  |
| **Test coverage** | `admin-rbac.spec.ts`; `admin-impersonation.spec.ts`             |
| **Status**        | Shipped                                                         |

---

## 28. Warehouses & multi-branch

| Field             | Criteria                                                          |
| ----------------- | ----------------------------------------------------------------- |
| **Feature**       | Supplier warehouses; restaurant branches; org billing inheritance |
| **Preconditions** | `multi_branch`, `warehouses` features                             |
| **Role**          | Owner / Warehouse Manager                                         |
| **Plan**          | Branch/warehouse limits per tier                                  |
| **Success path**  | Create warehouse → stock → fulfill from location                  |
| **Alternatives**  | Branch switcher cookie `active_tenant`                            |
| **Validation**    | Entitlements resolve at org parent                                |
| **Permissions**   | `WAREHOUSES_*`, branch APIs                                       |
| **API**           | `warehouses.routes.js`, `branches.routes.js`                      |
| **UI**            | `BranchSwitcher`, warehouse tabs                                  |
| **DB**            | `warehouse`, `branch`                                             |
| **Notifications** | N/A                                                               |
| **Error cases**   | Limit exceeded on create                                          |
| **Security**      | Supplier-only warehouse mutations                                 |
| **Mobile**        | Branch context                                                    |
| **Test coverage** | `warehouses.routes.test.js`; branches audit                       |
| **Status**        | Shipped                                                           |

---

## 29. PWA & web push notifications

| Field             | Criteria                                               |
| ----------------- | ------------------------------------------------------ |
| **Feature**       | Installable PWA, service worker, push subscriptions    |
| **Preconditions** | HTTPS; VAPID keys; `push_notifications` feature        |
| **Role**          | Any tenant user                                        |
| **Plan**          | `push_notifications`                                   |
| **Success path**  | Register SW → opt in → `POST /api/push/subscribe`      |
| **Alternatives**  | In-app notifications only                              |
| **Validation**    | `manifest.webmanifest` valid; push received on event   |
| **Permissions**   | Settings notification toggles                          |
| **API**           | `push.routes.js`                                       |
| **UI**            | `usePushNotifications`, onboarding opt-in              |
| **DB**            | push subscription rows                                 |
| **Notifications** | Web Push + bell                                        |
| **Error cases**   | Browser denies permission; SW unsupported              |
| **Security**      | VAPID; subscription bound to user                      |
| **Mobile**        | Native push in mobile app separate                     |
| **Test coverage** | `pwaManifest.test.ts`; `registerServiceWorker.test.ts` |
| **Status**        | Shipped                                                |

---

## 30. Tenant audit log

| Field             | Criteria                                      |
| ----------------- | --------------------------------------------- |
| **Feature**       | Immutable activity log per tenant             |
| **Preconditions** | `tenant_audit_log` on Gold+                   |
| **Role**          | Owner / settings viewers                      |
| **Plan**          | Gold+                                         |
| **Success path**  | Settings → Activity shows entries; export CSV |
| **Alternatives**  | Admin platform audit separate                 |
| **Validation**    | `GET /api/audit/logs` paginated               |
| **Permissions**   | `SETTINGS_VIEW`                               |
| **API**           | `tenant-audit.routes.js`                      |
| **UI**            | Activity tab in settings                      |
| **DB**            | `tenant_audit_log`                            |
| **Notifications** | N/A                                           |
| **Error cases**   | Feature off hides tab                         |
| **Security**      | Tenant-scoped; no cross-tenant leak           |
| **Mobile**        | N/A                                           |
| **Test coverage** | Audit route tests                             |
| **Status**        | Shipped                                       |

---

## Cross-feature release gate

Before marking a release **accepted**:

1. `pnpm typecheck` — pass
2. `pnpm --filter @supplify/api test:run` — pass (~1008 tests)
3. `pnpm --filter @supplify/web test:run` — pass
4. `pnpm e2e:playwright` critical suite — pass on staging
5. `pnpm verify:tier-matrix` — pass against staging DB
6. Manual smoke: auth, place order, accept, invoice, admin overview

---

_Document version: 2026-06-17. Companion: [12-demo-script.md](./12-demo-script.md), [16-implementation-status.md](./16-implementation-status.md)._
