# Restaurant onboarding guide

End-to-end onboarding for a **restaurant** tenant: registration, profile, procurement, receiving, and ongoing operations. Routes and APIs are sourced from `apps/web/src/App.tsx` and live API handlers.

**Primary persona:** Restaurant owner or purchasing manager unless noted.

---

## Step 1 — Create login and restaurant tenant

| Field                    | Detail                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Register identity and provision restaurant organization.                                                                                           |
| **Who**                  | New restaurant owner (`PENDING` → `RESTAURANT`).                                                                                                   |
| **Navigation path**      | `/login` → Register (`/auth/register`) → `/register/complete`                                                                                      |
| **Required data**        | Account type **Restaurant**, business name, phone (optional), legal acceptance. Optional `referralToken` from supplier invite (`/register?ref=…`). |
| **Expected result**      | `POST /api/register/complete` with `accountType: "RESTAURANT"` creates `restaurant`, org, roles, pending subscription; redirect `/app/activate`.   |
| **Possible errors**      | Duplicate tenant email; user already in workspace; validation errors on business name.                                                             |
| **Validation checklist** | [ ] `GET /api/auth/me` → `role: "RESTAURANT"`. [ ] `/register/complete` not shown again after success. [ ] Activation gate appears.                |

**API:** `GET /api/register/status`, `POST /api/register/complete`.

---

## Step 2 — Activate subscription (free or paid)

| Field                    | Detail                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Unlock ordering, inventory, and settings writes.                                                         |
| **Who**                  | Restaurant owner.                                                                                        |
| **Navigation path**      | `/app/activate`                                                                                          |
| **Required data**        | Free activation (`POST /api/billing/checkout` without card) or paid checkout (stub: `4242424242424242`). |
| **Expected result**      | `pending_activation` cleared; full sidebar available per entitlements.                                   |
| **Possible errors**      | Billing middleware blocks routes until unlocked; checkout failure.                                       |
| **Validation checklist** | [ ] Navigate to `/app/orders` without redirect to activate. [ ] `GET /api/billing/status` → not locked.  |

**API:** `GET /api/billing/status`, `POST /api/billing/checkout`, `GET /api/subscriptions/entitlements`.

---

## Step 3 — Complete restaurant profile (Settings hub)

| Field                    | Detail                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Set legal identity, branding, and operational metadata suppliers see.                                                   |
| **Who**                  | Owner or `SETTINGS_MANAGE`.                                                                                             |
| **Navigation path**      | Sidebar **Settings** → `/app/settings` (restaurant renders `RestaurantOnboardingPage`) or `/app/onboarding?tab=profile` |
| **Required data**        | Restaurant name, logo, contact email/phone, business type, address.                                                     |
| **Expected result**      | `GET /api/restaurants/me` returns updated profile; suppliers see name on orders.                                        |
| **Possible errors**      | Permission denied; invalid phone/email format.                                                                          |
| **Validation checklist** | [ ] Profile tab saves. [ ] Summary KPIs on settings header populate after orders exist. [ ] Refresh retains values.     |

**API:** `GET /api/restaurants/me`, `PATCH /api/restaurants/me`.

---

## Step 4 — Delivery location coordinates (GPS / ETA)

| Field                    | Detail                                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Enable accurate delivery ETA and map destination for supplier drivers (supplier sees pin; restaurant map is driver-only for privacy).                                                               |
| **Who**                  | Owner or branch manager.                                                                                                                                                                            |
| **Navigation path**      | `/app/onboarding?tab=profile` → **Delivery location** section (or branch settings)                                                                                                                  |
| **Required data**        | Latitude, longitude, label, notes; per-branch via branch detail.                                                                                                                                    |
| **Expected result**      | `PATCH /api/restaurants/me/delivery-location` or `PATCH /api/restaurants/branches/:branchId/delivery-location` stored; tracking shows `destinationCoordinatesAvailable` and ETA when driver active. |
| **Possible errors**      | Invalid coordinates; branch permission denied.                                                                                                                                                      |
| **Validation checklist** | [ ] Coordinates saved on main tenant. [ ] Active delivery shows ETA on order detail tracking panel. [ ] Text address alone does not substitute (coords required).                                   |

**API:** `GET/PATCH /api/restaurants/me/delivery-location`, branch variant on `branches/:branchId`.

---

## Step 5 — Invite team and assign roles

| Field                    | Detail                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Add purchasers, receivers, FOH staff with least-privilege roles.                                                                     |
| **Who**                  | Owner (`SETTINGS_MANAGE` / team permissions).                                                                                        |
| **Navigation path**      | `/app/onboarding?tab=team`                                                                                                           |
| **Required data**        | Email, role (e.g. receiver, ordering, admin), optional name.                                                                         |
| **Expected result**      | Invite link `/invite?token=…&type=rm` (restaurant member) or branch invite `/invite/branch`; accept binds workspace.                 |
| **Possible errors**      | Email mismatch on accept; `advanced_roles` plan gate; seat limits.                                                                   |
| **Validation checklist** | [ ] Invitee completes `/invite` flow. [ ] Sidebar matches role (e.g. receiver sees **Receiving**). [ ] Owner can revoke/adjust role. |

**API:** Invite validate `GET`, accept `POST /api/invites/accept`.

---

## Step 6 — Branches and operational locations

| Field                    | Detail                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Model multi-site restaurants with branch-scoped orders and inventory.                                                |
| **Who**                  | Owner or org admin.                                                                                                  |
| **Navigation path**      | `/app/onboarding?tab=branches`; branch detail → `/app/org/branches/:supplierId` (org overview `/app/org`)            |
| **Required data**        | Branch name, code, address, delivery location per branch.                                                            |
| **Expected result**      | Orders and quick lists can scope to branch; branch switcher in header when entitled.                                 |
| **Possible errors**      | Plan branch limit (e.g. Silver: 1 branch); slug conflicts.                                                           |
| **Validation checklist** | [ ] Branch appears in list. [ ] Branch invite flow works (`/invite/branch`). [ ] Orders attribute to correct branch. |

**API:** Restaurant branch CRUD under `/api/restaurants/branches/*`.

---

## Step 7 — Discover and follow suppliers

| Field                    | Detail                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Build a supplier portfolio for catalog browsing and ordering.                                                                      |
| **Who**                  | User with `CATALOG_VIEW`.                                                                                                          |
| **Navigation path**      | Sidebar **Suppliers** → `/app/suppliers`; detail → `/app/suppliers/:id`; public mini-store `/supplier/:idOrSlug`                   |
| **Required data**        | None to browse; follow action to add relationship.                                                                                 |
| **Expected result**      | `GET /api/suppliers` lists marketplace; follow creates `restaurant_supplier_follow`; `is_followed` true on detail.                 |
| **Possible errors**      | `suppliers_per_restaurant` plan limit on follow; catalog empty until supplier publishes.                                           |
| **Validation checklist** | [ ] Supplier list loads with ratings/deal badges. [ ] Follow toggles state. [ ] Followed supplier products appear in **Products**. |

**API:** `GET /api/suppliers`, `GET /api/suppliers/:id`, follow endpoints on supplier relationships router.

---

## Step 8 — Browse catalog, contract prices, and deals

| Field                    | Detail                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Find SKUs at list or negotiated prices before ordering.                                                                                                           |
| **Who**                  | Purchaser (`CATALOG_VIEW`, `ORDERS_CREATE`).                                                                                                                      |
| **Navigation path**      | **Products** → `/app/products`; **My Prices** → `/app/my-prices`; **Deals** → `/app/deals`                                                                        |
| **Required data**        | Product filters; supplier relationship for contracted SKUs.                                                                                                       |
| **Expected result**      | Contract prices override list where configured; active deals apply at cart.                                                                                       |
| **Possible errors**      | No supplier follow — empty catalog; SKU limit on plan.                                                                                                            |
| **Validation checklist** | [ ] Product detail `/app/products/:id` shows correct unit price. [ ] **My Prices** lists contract rows. [ ] Deal badge visible on supplier with `has_store_deal`. |

**API:** `GET /api/products`, contract pricing read APIs, `/api/promotions` restaurant-facing routes.

---

## Step 9 — Ordering lists (quick lists) and scheduled reorders

| Field                    | Detail                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Save par lists and recurring order templates (`quick_lists` entitlement).                                                         |
| **Who**                  | Purchaser.                                                                                                                        |
| **Navigation path**      | **Ordering Lists** → `/app/quick-lists`                                                                                           |
| **Required data**        | List name, lines (product, qty), optional schedule/branch scope.                                                                  |
| **Expected result**      | One-click add to cart from list; scheduled orders notify per preferences.                                                         |
| **Possible errors**      | Feature off on plan; product unavailable from supplier.                                                                           |
| **Validation checklist** | [ ] List creates and opens. [ ] Add all to cart populates `/app/cart`. [ ] Scheduled notification preference enabled in settings. |

**API:** Quick list endpoints under restaurant ordering module.

---

## Step 10 — Cart checkout and place orders

| Field                    | Detail                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Submit purchase orders to suppliers.                                                                                                                        |
| **Who**                  | User with `ORDERS_CREATE`.                                                                                                                                  |
| **Navigation path**      | **Cart** → `/app/cart` → submit; confirmation in **Orders**                                                                                                 |
| **Required data**        | Cart lines, delivery branch, requested date, PO notes; supplier MOQ met.                                                                                    |
| **Expected result**      | `POST` order creation → `customer_order` `PLACED`; supplier sees `/app/orders`; notifications sent.                                                         |
| **Possible errors**      | Below supplier MOQ; `402` billing lock; daily order limit on plan; out-of-stock SKU.                                                                        |
| **Validation checklist** | [ ] Order appears in `/app/orders` with pending badge. [ ] Supplier acknowledges order. [ ] Order detail `/app/orders/:id` shows lines and status timeline. |

**API:** Cart and `POST /api/orders` (or checkout flow used by `CartPage`).

---

## Step 11 — Quote requests (RFQ)

| Field                    | Detail                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Request custom pricing when catalog price is insufficient.                                                      |
| **Who**                  | Purchaser.                                                                                                      |
| **Navigation path**      | **Quote requests** → `/app/quote-requests`; new → `/app/quote-requests/new`; detail → `/app/quote-requests/:id` |
| **Required data**        | Supplier(s), line items, quantities, needed-by date, notes.                                                     |
| **Expected result**      | Suppliers respond via quote inbox; restaurant compares offers on detail page.                                   |
| **Possible errors**      | Supplier not accepting quotes; validation on empty lines.                                                       |
| **Validation checklist** | [ ] RFQ creates with status visible. [ ] Supplier response appears. [ ] Convert to order if workflow supported. |

**API:** Quote request CRUD under `/api/quote-requests`.

---

## Step 12 — Track orders and live delivery

| Field                    | Detail                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Monitor fulfillment and see driver location during active delivery (privacy-safe).                                                                                                            |
| **Who**                  | User with `ORDERS_VIEW`.                                                                                                                                                                      |
| **Navigation path**      | `/app/orders/:id` → `RestaurantOrderTrackingPanel`                                                                                                                                            |
| **Required data**        | Order in shipped/dispatch states; delivery location coordinates on file.                                                                                                                      |
| **Expected result**      | `GET /api/orders/:id/tracking` returns sanitized payload — driver pin only (no destination coords on restaurant map); ETA when `picked_up` or `out_for_delivery`; 30s poll in UI.             |
| **Possible errors**      | Tracking hidden until dispatch starts; `GPS_ALLOW_RESTAURANT_LIVE_TRACKING` false; no driver GPS.                                                                                             |
| **Validation checklist** | [ ] No map before dispatch. [ ] Driver marker appears after pickup/out for delivery. [ ] Driver phone hidden by default. [ ] **Receive order** links to receiving (no auto-receive from GPS). |

**API:** `GET /api/orders/:id/tracking` (restaurant-sanitized via `restaurant-tracking-payload.js`).

---

## Step 13 — Receiving deliveries

| Field                    | Detail                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Confirm quantities received and close the procurement loop (status → `COMPLETED` post-receiving).                            |
| **Who**                  | User with `RECEIVING_VIEW` / receiving manage.                                                                               |
| **Navigation path**      | **Receiving** → `/app/receiving`                                                                                             |
| **Required data**        | Order id, received quantities, variances, optional photos.                                                                   |
| **Expected result**      | Accepts orders in `DELIVERED` or `COMPLETED`; inventory updated when inventory module linked.                                |
| **Possible errors**      | Order not in receivable state; permission denied.                                                                            |
| **Validation checklist** | [ ] Delivered order appears in receiving queue. [ ] Confirm updates order status. [ ] Inventory reflects receipt if enabled. |

**API:** Receiving endpoints under `/api/receiving` (see `receiving.md` feature doc).

---

## Step 14 — Restaurant inventory and expiry

| Field                    | Detail                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Track on-hand stock, lots, and expiry by branch.                                                            |
| **Who**                  | User with `INVENTORY_VIEW`.                                                                                 |
| **Navigation path**      | **Inventory** → `/app/restaurant-inventory`                                                                 |
| **Required data**        | SKU quantities, lot dates, branch, reorder thresholds.                                                      |
| **Expected result**      | Stock levels adjust from receiving; low-stock notifications if enabled.                                     |
| **Possible errors**      | Inventory feature plan-gated; branch scope mismatch.                                                        |
| **Validation checklist** | [ ] On-hand matches post-receiving. [ ] Expiring lots flagged. [ ] Low stock notification preference works. |

**API:** Restaurant inventory routes under `/api/restaurant-inventory` or equivalent module.

---

## Step 14b — Recipe costing (Gold+)

| Field                    | Detail                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Build recipes linked to supplier products; track food cost % and margin from live purchase prices.                                |
| **Who**                  | `RECIPES_EDIT` (Owner, Manager, Purchaser); costs visible with `RECIPES_VIEW_COSTS`.                                              |
| **Navigation path**      | **Recipes** → `/app/recipes`; **Recipe costing** → `/app/recipe-costing`                                                          |
| **Required data**        | Active recipes with ingredients mapped to catalog SKUs; receiving/invoice history for cost resolution.                            |
| **Expected result**      | Costs recalculate after goods-in; missing price shows `MISSING_DATA` (not zero).                                                  |
| **Possible errors**      | Plan gate `recipe_costing` (Silver → 403); unit conversion missing.                                                               |
| **Validation checklist** | [ ] Create recipe with ingredients. [ ] Receive stock → cost updates within ~3 min. [ ] Price-impact page lists affected recipes. |

**API:** `/api/recipes`, `/api/recipe-costing`. See [recipe-costing.md](../features/recipe-costing.md).

---

## Step 15 — Subscription, plan, and notifications

| Field                    | Detail                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Manage billing tier and alert channels.                                                                                          |
| **Who**                  | Owner.                                                                                                                           |
| **Navigation path**      | `/app/onboarding?tab=subscription` and `?tab=notifications`; user-level prefs in `/app/settings` (account section)               |
| **Required data**        | Plan selection for upgrade; notification toggles (email, in-app, WhatsApp).                                                      |
| **Expected result**      | Plan change via checkout; `PATCH` notification preferences persist.                                                              |
| **Possible errors**      | Downgrade blocked by usage over new limits; payment failure.                                                                     |
| **Validation checklist** | [ ] Current plan shown with usage meters. [ ] Upgrade modal opens from plan tab. [ ] Order notification test fires on new order. |

**API:** `GET /api/billing/status`, `POST /api/billing/checkout`, notification preference endpoints.

---

## Step 16 — Invoices and spend tracking

| Field                    | Detail                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| **Goal**                 | Reconcile supplier invoices against orders (`finance_invoices` entitlement).                   |
| **Who**                  | User with `INVOICES_VIEW`.                                                                     |
| **Navigation path**      | **Invoices** → `/app/invoices`                                                                 |
| **Required data**        | Invoice id from supplier; payment status notes.                                                |
| **Expected result**      | Invoice list with totals; settings summary shows `totalSpent` KPI.                             |
| **Possible errors**      | Feature disabled on plan; no invoices until supplier issues.                                   |
| **Validation checklist** | [ ] Invoice list loads. [ ] Totals align with order history. [ ] Export/open PDF if available. |

**API:** `GET /api/invoices`.

---

## Step 17 — Disputes and returns

| Field                    | Detail                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| **Goal**                 | Open disputes for short ships, damage, or quality issues (`disputes_returns` feature).     |
| **Who**                  | User with dispute permissions (`RESTAURANT_DISPUTES_ANY_OF`).                              |
| **Navigation path**      | **Disputes** → `/app/disputes`; detail → `/app/disputes/:id`                               |
| **Required data**        | Order/line reference, reason, photos/notes.                                                |
| **Expected result**      | Dispute visible to supplier on `/app/disputes`; status updates both sides.                 |
| **Possible errors**      | Feature off; order not eligible window.                                                    |
| **Validation checklist** | [ ] Create dispute from order or list. [ ] Sidebar badge updates. [ ] Resolution recorded. |

**API:** `/api/disputes/*`.

---

## Step 18 — Chat and supplier collaboration

| Field                    | Detail                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Coordinate substitutions, delivery instructions, and account issues in-app.                                                         |
| **Who**                  | User with `CHAT_VIEW`.                                                                                                              |
| **Navigation path**      | **Chat** → `/app/chat`                                                                                                              |
| **Required data**        | Supplier thread selection; message body.                                                                                            |
| **Expected result**      | `GET /api/chat/conversations` lists B2B threads (excludes admin support threads from list per audit); real-time or polled messages. |
| **Possible errors**      | `chats_per_day` limit on Free; supplier not linked.                                                                                 |
| **Validation checklist** | [ ] Open thread with followed supplier. [ ] Message delivers both directions. [ ] Unread badge in header.                           |

**API:** `/api/chat/conversations`, message POST endpoints.

---

## Step 19 — Reports, reviews, hospitality add-ons, and troubleshooting

| Field                    | Detail                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Use analytics and optional modules; resolve common blockers without admin help.                                                                                                                        |
| **Who**                  | Owner, GM, or IT contact.                                                                                                                                                                              |
| **Navigation path**      | **Reports** → `/app/reports` (entitled); `/app/onboarding?tab=reviews`; hospitality: `/app/reservations`, `/app/staff`, `/app/consumer-menu`, `/app/consumer-orders`, `/app/consumer-loyalty`          |
| **Required data**        | Report date range; review responses; guest-facing slug for `/order/:restaurantSlug` consumer storefront.                                                                                               |
| **Expected result**      | Reports export on entitled plans; reviews tab shows supplier ratings you can respond to; reservations and guest ordering modules work when respective permissions enabled.                             |
| **Possible errors**      | Reports feature off; reservations/staff plan gates; consumer routes need published menu.                                                                                                               |
| **Validation checklist** | [ ] Reports page loads or shows upgrade CTA. [ ] Reviews tab lists recent supplier reviews. [ ] Guest menu admin saves (`/app/consumer-menu`). [ ] Public guest order path `/order/{slug}/menu` works. |

### Troubleshooting reference

| Symptom                  | Likely cause            | Action                                              |
| ------------------------ | ----------------------- | --------------------------------------------------- |
| Cannot place order `402` | Trial expired / locked  | `/app/onboarding?tab=subscription` or contact admin |
| Empty **Products**       | No supplier follows     | Follow suppliers on `/app/suppliers`                |
| No live tracking map     | Dispatch not started    | Wait for `picked_up` / `out_for_delivery`           |
| ETA missing              | No delivery coordinates | Set delivery location (Step 4)                      |
| Missing nav item         | Plan entitlement        | `GET /api/subscriptions/entitlements`               |
| Stuck at activation      | `pending_activation`    | `/app/activate` or admin unlock                     |

**Escalation:** Provide restaurant tenant id, order uuid, browser console errors, and API `requestId` from failed responses. Platform admin can impersonate via `/app/admin` → Tenants → **Impersonate**.
