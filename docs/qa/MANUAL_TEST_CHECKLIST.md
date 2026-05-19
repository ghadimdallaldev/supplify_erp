# Supplify ERP — Full application manual QA checklist

Use this document for **end-to-end manual testing** across **Public**, **Restaurant**, **Supplier**, and **Platform Admin** personas.

---

## How to use this checklist

1. **Environment:** API + web running (`pnpm run dev`), database migrated (`pnpm run db:migrate`).
2. **Recommended seed (local):**
   - `pnpm run seed:demo-users` — Keycloak users
   - `pnpm run db:seed` or `pnpm run seed:demo-tenants` — golden demo tenants
   - `pnpm run seed:plan-tiers` — Free/Bronze/Gold/Platinum demo accounts (legacy slugs)
   - `pnpm run seed:tier-catalog` — **recommended:** wipe + Free/Silver/Gold restaurant & supplier + team users + audit backfill
   - `pnpm run seed:features` — disputes, deals, reports (after tier-catalog or Gold tenants)
   - `pnpm run seed:audit-backfill` — activity log rows from seeded orders/products (if log empty)
   - `pnpm run seed:full` or `pnpm run seed:prodlike` — richer data (orders, inventory, chats)
   - `pnpm run seed:billing` — billing states (past due, locked) after tenants exist
3. **Record results:** Pass / Fail / Blocked / N/A in **Pass?**; add tester name, date, build/branch, and notes.
4. **Test matrix:** Run each section for the persona it applies to. Re-run **Cross-cutting** after major releases.
5. **Deep links:** Many routes work when typed in the address bar even if not in the sidebar — test those once per persona.

---

## Demo credentials (local)

| Account                                                           | Password               | Role / notes                                               |
| ----------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `admin@supplify.com`                                              | `SupplifyAdmin1!`      | Platform admin                                             |
| `restaurant@supplify.com`                                         | `SupplifyRestaurant1!` | Golden Fork (demo restaurant)                              |
| `supplier@supplify.com`                                           | `SupplifySupplier1!`   | Fresh Foods Co. (demo supplier)                            |
| `restaurant-free@supplify.com`                                    | `Supplify1!`           | Free plan — calendar gated                                 |
| `restaurant-gold@supplify.com`                                    | `Supplify1!`           | Gold — full features; may be past due after `seed:billing` |
| `restaurant-bronze@supplify.com`                                  | `Supplify1!`           | Bronze tier                                                |
| `restaurant-platinum@supplify.com`                                | `Supplify1!`           | Platinum tier                                              |
| `supplier-free@supplify.com`                                      | `Supplify1!`           | Supplier free tier                                         |
| `supplier-gold@supplify.com`                                      | `Supplify1!`           | Supplier Gold                                              |
| `restaurant-gold-manager@supplify.com`                            | `Supplify1!`           | Gold restaurant — Manager (`seed:tier-catalog`)            |
| `restaurant-gold-purchaser@supplify.com`                          | `Supplify1!`           | Gold restaurant — Purchaser (own login, not owner)         |
| `restaurant-silver@supplify.com` / `supplier-silver@supplify.com` | `Supplify1!`           | Silver tier (`tier-restaurant-silver` slugs)               |
| `restaurant-1@test.com` … `restaurant-10@test.com`                | (Keycloak)             | Prod-like seed (`seed:prodlike`)                           |

**Billing stub card:** `4242424242424242` (any future expiry/CVC) when `BILLING_GATEWAY=stub`.

---

## Route map (quick reference)

| Path                                                                            | Persona                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/login`                                                                        | Public                                                |
| `/register/complete`                                                            | Pending / needs setup                                 |
| `/reserve`, `/reserve/:slug`, `/reserve/confirmation`, `/reserve/manage/:token` | Guest                                                 |
| `/staff`, `/staff/dashboard`                                                    | Staff portal (not tenant login)                       |
| `/app/dashboard`, `/`                                                           | Restaurant / Supplier / Admin (impersonating)         |
| `/app/activate`                                                                 | Locked tenant billing activation                      |
| `/app/orders`, `/app/orders/:id`                                                | Restaurant & Supplier                                 |
| `/app/products`, `/app/products/:id`                                            | Both (supplier edits catalog)                         |
| `/app/cart`, `/app/quick-lists`                                                 | Restaurant                                            |
| `/app/restaurant-inventory`                                                     | Restaurant (`INVENTORY_VIEW`)                         |
| `/app/receiving`                                                                | Restaurant                                            |
| `/app/reservations`                                                             | Restaurant (`RESERVATIONS_VIEW`)                      |
| `/app/staff`                                                                    | Restaurant (`STAFF_VIEW`)                             |
| `/app/suppliers`, `/app/suppliers/:id`                                          | Restaurant                                            |
| `/app/restaurants`, `/app/restaurants/:id`                                      | Supplier                                              |
| `/app/fulfillment`                                                              | Supplier                                              |
| `/app/inventory`                                                                | Supplier (not in sidebar — deep link)                 |
| `/app/invoices`                                                                 | Both (`INVOICES_VIEW`)                                |
| `/app/chat`                                                                     | Both                                                  |
| `/app/settings`, `/app/onboarding`                                              | Restaurant → onboarding; Supplier → supplier settings |
| `/app/supplier-settings`                                                        | Supplier (duplicate of settings — deep link)          |
| `/app/admin`, `/app/admin/suppliers`, `/app/admin/restaurants`                  | Platform admin                                        |

---

# Part 0 — Cross-cutting (all authenticated tenants)

## 0.1 Authentication & session

| ID      | Steps                                | Expected                                            | Pass? |
| ------- | ------------------------------------ | --------------------------------------------------- | ----- |
| AUTH-01 | Open `/login`, sign in as restaurant | Redirect to app shell; sidebar shows restaurant nav |       |
| AUTH-02 | Sign in as supplier                  | Supplier nav; no restaurant-only items              |       |
| AUTH-03 | Sign in as admin                     | Redirect to `/app/admin` (not tenant dashboard)     |       |
| AUTH-04 | Refresh page while logged in         | Session persists; no login loop                     |       |
| AUTH-05 | Log out (header avatar / logout)     | Returns to login; protected routes blocked          |       |
| AUTH-06 | Open `/app/orders` while logged out  | Redirect to login                                   |       |

## 0.2 Registration & first-time setup

| ID      | Steps                                                        | Expected                                                   | Pass? |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------- | ----- |
| AUTH-07 | New Keycloak user with `PENDING` role → `/register/complete` | Form loads; complete profile/tenant type                   |       |
| AUTH-08 | Finish registration as **Restaurant**                        | Lands in app or `/app/activate` if activation lock enabled |       |
| AUTH-09 | Finish registration as **Supplier**                          | Same; supplier settings reachable when unlocked            |       |
| AUTH-10 | User with `needsSetup` from `/api/register/status`           | Forced to `/register/complete` until done                  |       |

## 0.3 Account activation lock (new tenants)

| ID     | Steps                                                 | Expected                                                                  | Pass? |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------- | ----- |
| BIL-01 | New restaurant after register — no payment            | `/app/activate`; pending activation banner                                |       |
| BIL-02 | On activate page → **Compare plans & pay**            | Upgrade/payment modal; `/api/billing/*` works (no 402)                    |       |
| BIL-03 | Navigate to Orders/Dashboard while locked             | Redirect to `/app/activate` or 402 `ACCOUNT_LOCKED` + `pendingActivation` |       |
| BIL-04 | Paid checkout (stub card) for Bronze/Gold             | Unlock; full app access                                                   |       |
| BIL-05 | Admin → Subscriptions → **Activate** on locked tenant | Unlocked without payment                                                  |       |

## 0.4 Billing, subscriptions & overdue

| ID     | Steps                                              | Expected                                              | Pass? |
| ------ | -------------------------------------------------- | ----------------------------------------------------- | ----- |
| BIL-06 | Paid tenant → Settings → Plan / subscription tab   | Current plan, usage meters, **Manage billing**        |       |
| BIL-07 | Payment modal → add card → checkout monthly/yearly | Success; subscription ACTIVE                          |       |
| BIL-08 | After `seed:billing` on past-due Gold restaurant   | Grace banner; **Pay now**                             |       |
| BIL-09 | Locked overdue tenant (post-grace)                 | Red lock banner; most APIs 402; billing still works   |       |
| BIL-10 | Pay overdue balance                                | Lock cleared; app usable                              |       |
| BIL-11 | Toggle auto-renew in billing UI                    | Persists; reflected on reload                         |       |
| BIL-12 | Free plan tenant                                   | No payment required; upgrade prompts where applicable |       |

## 0.5 Plan limits & upgrade UX

| ID      | Steps                                          | Expected                                               | Pass? |
| ------- | ---------------------------------------------- | ------------------------------------------------------ | ----- |
| PLN-01  | Free restaurant → Dashboard **Order calendar** | Paywall + upgrade CTA; no broken URL / “Try again”     |       |
| PLN-02  | Gold restaurant → Order calendar               | Calendar loads; filters work                           |       |
| PLN-03  | Hit daily order limit (or seed at limit)       | Block message; upgrade modal with limit label          |       |
| PLN-04  | Hit chat limit                                 | Send blocked; upgrade nudge                            |       |
| PLN-05  | Add branch over plan limit                     | Gate message references `multi_branch` / branch limit  |       |
| PLN-06  | Supplier add warehouse over limit              | Warehouse gate from plan                               |       |
| PLN-06a | Bronze supplier → add 2nd warehouse            | Blocked or upgrade CTA (`warehouses` limit)            |       |
| PLN-06b | Gold supplier → enable multi-warehouse         | Settings toggle; routing rules API; split order badges |       |
| PLN-06c | Supplier org → add branch over plan limit      | `multi_branch` / branch limit message                  |       |
| PLN-07  | Gold/Platinum → custom branding in settings    | Logo/colors upload (Gold); white-label if Platinum     |       |
| PLN-08  | Header **Plans** button                        | Upgrade/browse modal; plan comparison table            |       |

## 0.6 Shell UI (Layout, Header, Sidebar)

| ID     | Steps                                     | Expected                                             | Pass? |
| ------ | ----------------------------------------- | ---------------------------------------------------- | ----- |
| UX-01  | Sidebar: each visible nav item            | Correct route; active state highlight                |       |
| UX-02  | Orders nav badge                          | Shows pending count when pending orders exist        |       |
| UX-03  | Header notifications bell                 | Panel opens; mark read / mark all read               |       |
| UX-04  | Header search (⌘K)                        | Opens search UX if implemented                       |       |
| UX-05  | Header settings icon                      | Navigates to settings                                |       |
| UX-06  | Header avatar → logout                    | Session ends                                         |       |
| UX-07  | **Branch switcher** (multi-branch tenant) | Lists linked accounts; switch updates context        |       |
| UX-07a | Supplier with org → **All branches** link | Navigates to `/app/org` when `multi_branch` on       |       |
| UX-07b | Org Owner → add branch on `/app/org`      | Two-step modal: branch details → invite link copy    |       |
| UX-07c | Branch settings → Invitations tab       | List/revoke/resend; copy link works                    |       |
| UX-07d | Open `/invite/branch?token=…` (valid)   | Signup or accept while logged in; lands on dashboard |       |
| UX-07e | Expired / revoked invite link           | Correct error state; no account created              |       |
| UX-08  | Plan badge in sidebar footer              | Shows plan name for non-free paid tiers              |       |
| UX-09  | Mobile/narrow viewport                    | Sidebar/layout usable; tabs wrap (supplier settings) |       |

## 0.7 Notifications preferences

| ID    | Steps                                                | Expected                                          | Pass? |
| ----- | ---------------------------------------------------- | ------------------------------------------------- | ----- |
| UX-10 | Settings → notifications (restaurant/supplier/admin) | Toggles: email, WhatsApp, in-app, per-event types |       |
| UX-11 | Save preferences → reload                            | Values persisted                                  |       |
| UX-12 | Trigger event (e.g. new order) with in-app on        | Notification appears in header                    |       |

## 0.8 Realtime & impersonation

| ID         | Steps                                          | Expected                                           | Pass? |
| ---------- | ---------------------------------------------- | -------------------------------------------------- | ----- |
| ADM-IMP-01 | Admin starts impersonation on restaurant       | Banner shows impersonation; restaurant nav         |       |
| ADM-IMP-02 | While impersonating, open `/app/admin`         | Redirect to tenant dashboard                       |       |
| ADM-IMP-03 | Stop impersonation                             | Returns to admin context                           |       |
| ADM-IMP-04 | Plan change while logged in (admin or billing) | `entitlements_refresh` toast or refetch updates UI |       |

---

# Part 1 — Public & guest (no tenant login)

## 1.1 Guest reservation portal

| ID     | Steps                                           | Expected                                        | Pass? |
| ------ | ----------------------------------------------- | ----------------------------------------------- | ----- |
| PUB-01 | Open `/reserve` or `/reserve/{restaurant-slug}` | Booking UI loads; restaurant name shown         |       |
| PUB-02 | Complete booking (party size, date, time)       | Confirmation page `/reserve/confirmation`       |       |
| PUB-03 | Copy manage link from confirmation email/UI     | `/reserve/manage/:token` loads reservation      |       |
| PUB-04 | Cancel reservation via manage link              | Status cancelled; reflected on restaurant board |       |
| PUB-05 | Reschedule via manage link                      | New slot saved                                  |       |
| PUB-06 | Invalid/expired token                           | Friendly error; no crash                        |       |

## 1.2 Staff self-service portal

| ID     | Steps                                      | Expected                                            | Pass? |
| ------ | ------------------------------------------ | --------------------------------------------------- | ----- |
| PUB-07 | Open `/staff`                              | Staff login / magic-link request UI                 |       |
| PUB-08 | Request link with staff email              | Email sent (or dev log); no tenant auth required    |       |
| PUB-09 | Open `/staff/dashboard` with valid session | Clock in/out, schedule, PTO, swaps per portal scope |       |
| PUB-10 | PIN / session expiry                       | Prompt re-auth                                      |       |

---

# Part 2 — Restaurant tenant

**Primary accounts:** `restaurant@supplify.com`, `restaurant-gold@supplify.com`, `restaurant-free@supplify.com`

**Sidebar:** Dashboard, Orders, Products, Quick Lists, Cart, Reservations*, Receiving, Suppliers, Invoices*, Chat, Staff*, Inventory*, Settings  
\*Hidden without RBAC permission.

## 2.1 Dashboard (`/app/dashboard`)

| ID     | Steps                      | Expected                                                | Pass? |
| ------ | -------------------------- | ------------------------------------------------------- | ----- |
| RST-01 | Load dashboard             | KPI cards load (orders, spend, etc.)                    |       |
| RST-02 | **Recent orders** list     | Links to order detail                                   |       |
| RST-03 | **Spend trend** (30 days)  | Chart matches invoice/order data or empty-state message |       |
| RST-04 | **Reorder alerts**         | Suggestions; add to quick list works                    |       |
| RST-05 | **Order calendar** (Gold+) | Calendar events; filters                                |       |
| RST-06 | **Order calendar** (Free)  | Upgrade paywall only                                    |       |

## 2.2 Orders (`/app/orders`, `/app/orders/:id`)

| ID     | Steps                                                      | Expected                             | Pass? |
| ------ | ---------------------------------------------------------- | ------------------------------------ | ----- |
| RST-07 | Orders list tabs: All, New, Processing, Shipped, Completed | Correct filtering                    |       |
| RST-08 | Open order detail                                          | Details, Items tabs load             |       |
| RST-09 | Place order from cart (see 2.4)                            | New order appears in list            |       |
| RST-10 | Cancel or update order (if permitted)                      | Status updates; supplier sees change |       |
| RST-11 | Order reminders / notifications                            | Trigger where applicable             |       |

## 2.3 Products & catalog (`/app/products`, `/app/products/:id`)

| ID     | Steps                    | Expected                           | Pass? |
| ------ | ------------------------ | ---------------------------------- | ----- |
| RST-12 | Browse supplier products | List, search, filters              |       |
| RST-13 | Product detail           | SKU, price, pack size, add to cart |       |
| RST-14 | Categories/tags if shown | Navigation works                   |       |

## 2.4 Cart (`/app/cart`)

| ID     | Steps                            | Expected                                  | Pass? |
| ------ | -------------------------------- | ----------------------------------------- | ----- |
| RST-15 | Add items from products          | Cart persists after navigation            |       |
| RST-16 | Update quantities / remove lines | Totals recalculate                        |       |
| RST-17 | Submit order                     | Success; redirects to orders; cart clears |       |
| RST-18 | Empty cart checkout              | Validation prevents submit                |       |

## 2.5 Quick lists (`/app/quick-lists`)

| ID     | Steps                               | Expected                       | Pass? |
| ------ | ----------------------------------- | ------------------------------ | ----- |
| RST-19 | Create quick list                   | Saved with name                |       |
| RST-20 | Add/remove SKUs                     | Persists                       |       |
| RST-21 | Order from quick list               | Creates order with lines       |       |
| RST-22 | Scheduled quick list (if UI filter) | Scheduled vs unscheduled views |       |

## 2.6 Restaurant inventory (`/app/restaurant-inventory`)

| ID     | Steps                         | Expected                              | Pass? |
| ------ | ----------------------------- | ------------------------------------- | ----- |
| RST-23 | Tab: Current inventory        | SKU levels, par levels                |       |
| RST-24 | Tab: Movement history         | Events listed                         |       |
| RST-25 | Tab: Totals & sources         | Aggregates correct                    |       |
| RST-26 | Adjust stock (if UI)          | Quantity updates; audit in history    |       |
| RST-27 | User without `INVENTORY_VIEW` | Nav hidden; direct URL blocked or 403 |       |

## 2.7 Receiving (`/app/receiving`)

| ID     | Steps                           | Expected                           | Pass? |
| ------ | ------------------------------- | ---------------------------------- | ----- |
| RST-28 | Tab: Pending deliveries         | Expected shipments listed          |       |
| RST-29 | Receive shipment — full receive | Status updated; inventory reflects |       |
| RST-30 | Partial receive / discrepancies | Recorded correctly                 |       |
| RST-31 | Tab: History                    | Past receivings searchable         |       |

## 2.8 Reservations (`/app/reservations`)

| ID     | Steps                               | Expected                                 | Pass? |
| ------ | ----------------------------------- | ---------------------------------------- | ----- |
| RST-32 | Reservation board for selected date | Tables + reservations + waitlist         |       |
| RST-33 | Create reservation (drawer)         | Appears on board                         |       |
| RST-34 | Seat / confirm / cancel from board  | Status transitions                       |       |
| RST-35 | **Table builder**                   | Add/edit floor plan tables               |       |
| RST-36 | Analytics panel (day/week/month)    | Metrics load                             |       |
| RST-37 | Guest intelligence panel            | Guest stats load                         |       |
| RST-38 | Copy public **booking link**        | Link works in incognito (`/reserve/...`) |       |
| RST-39 | User without `RESERVATIONS_VIEW`    | Nav hidden                               |       |

## 2.9 Staff HR (`/app/staff`)

| ID     | Steps                      | Expected                           | Pass? |
| ------ | -------------------------- | ---------------------------------- | ----- |
| RST-40 | Tab: Team — list members   | Roles shown                        |       |
| RST-41 | Invite/add staff member    | Invitation or record created       |       |
| RST-42 | Tab: Schedule & time       | Shifts; clock events               |       |
| RST-43 | Tab: PTO & availability    | Request/approve PTO                |       |
| RST-44 | Tab: Announcements & swaps | Post announcement; shift swap flow |       |
| RST-45 | Tab: Docs & incidents      | Upload/view document; log incident |       |
| RST-46 | Tab: Payroll & insights    | Reports load                       |       |
| RST-47 | User without `STAFF_VIEW`  | Nav hidden                         |       |

## 2.10 Suppliers directory (`/app/suppliers`, `/app/suppliers/:id`)

| ID     | Steps                    | Expected                                   | Pass? |
| ------ | ------------------------ | ------------------------------------------ | ----- |
| RST-48 | List suppliers           | Search/filter                              |       |
| RST-49 | Supplier detail          | Catalog preview, follow/block if available |       |
| RST-50 | Start chat from supplier | Opens conversation                         |       |

## 2.11 Invoices (`/app/invoices`)

| ID     | Steps                        | Expected              | Pass? |
| ------ | ---------------------------- | --------------------- | ----- |
| RST-51 | Invoice list                 | Filter by status/date |       |
| RST-52 | Open invoice → Details tab   | Line items, totals    |       |
| RST-53 | Payments tab                 | Payment history       |       |
| RST-54 | Related order tab            | Links to order        |       |
| RST-55 | Download PDF (if offered)    | PDF opens             |       |
| RST-56 | User without `INVOICES_VIEW` | Nav hidden            |       |

## 2.12 Chat (`/app/chat`)

| ID     | Steps                                 | Expected                           | Pass? |
| ------ | ------------------------------------- | ---------------------------------- | ----- |
| RST-57 | Conversation list                     | Suppliers/restaurants shown        |       |
| RST-58 | Send message                          | Delivered; appears in thread       |       |
| RST-59 | Receive message (second browser/user) | Real-time or refresh shows message |       |
| RST-60 | Unread state / read receipts          | Updates correctly                  |       |

## 2.13 Settings & onboarding (`/app/settings`, `/app/onboarding`)

| ID      | Steps                                         | Expected                                                                | Pass? |
| ------- | --------------------------------------------- | ----------------------------------------------------------------------- | ----- |
| RST-61  | Tab: Profile — edit name, address, logo       | Saves via API                                                           |       |
| RST-62  | Tab: Team — invite users, assign tenant roles | RBAC roles applied                                                      |       |
| RST-63  | Tab: Branches — add/switch linked accounts    | Respects plan branch limit                                              |       |
| RST-64  | Tab: Subscription — plan, usage, billing CTA  | Matches entitlements                                                    |       |
| RST-65  | Tab: Notifications                            | Same as UX-10                                                           |       |
| RST-65a | Tab: Activity — no date filters, Refresh      | Rows show (e.g. Order placed) after `seed:audit-backfill` or live order |       |
| RST-65b | Tab: Activity — Action / Resource dropdowns   | Human-readable labels; filter narrows list                              |       |
| RST-65c | Tab: Activity — Clear filters / date range    | Full day included on **To** date                                        |       |
| RST-66  | Custom branding (Gold+)                       | Logo/colors; preview                                                    |       |
| RST-67  | `/app/onboarding`                             | Same flows as settings (duplicate entry)                                |       |

## 2.14 Restaurant RBAC spot checks

| ID      | Steps                                       | Expected                                     | Pass? |
| ------- | ------------------------------------------- | -------------------------------------------- | ----- |
| RBAC-R1 | Log in as `RESTAURANT_STAFF` (limited role) | Only permitted nav items; APIs 403 otherwise |       |
| RBAC-R2 | `RESTAURANT_MANAGER`                        | Broader access than staff; less than owner   |       |
| RBAC-R3 | `RESTAURANT_OWNER`                          | Full restaurant permissions                  |       |

---

# Part 3 — Supplier tenant

**Primary accounts:** `supplier@supplify.com`, `supplier-gold@supplify.com`, `supplier-free@supplify.com`

**Sidebar:** Dashboard, Orders, Products, Fulfillment, Restaurants, Invoices\*, Chat, Settings  
**Deep links:** `/app/inventory`, `/app/supplier-settings`

## 3.1 Dashboard (`/app/dashboard`)

| ID     | Steps                                       | Expected                                      | Pass? |
| ------ | ------------------------------------------- | --------------------------------------------- | ----- |
| SUP-01 | Load dashboard                              | Supplier KPIs                                 |       |
| SUP-02 | **Low stock** column (not “Reorder alerts”) | Lists SKUs below threshold; link to inventory |       |
| SUP-03 | Recent orders                               | Links work                                    |       |
| SUP-04 | Order calendar (if plan feature)            | Same gating as restaurant                     |       |

## 3.2 Orders (`/app/orders`, `/app/orders/:id`)

| ID     | Steps                                         | Expected                                   | Pass? |
| ------ | --------------------------------------------- | ------------------------------------------ | ----- |
| SUP-05 | List tabs                                     | Filter by status                           |       |
| SUP-06 | Accept/processing workflow                    | Status moves New → Processing              |       |
| SUP-07 | Mark shipped / completed                      | Restaurant sees updates                    |       |
| SUP-08 | **Manual order** creation (if UI/API exposed) | Order created for restaurant               |       |
| SUP-09 | Order detail — supplier tabs                  | Picking notes, Delivery info, Packing slip |       |
| SUP-10 | Invoice tab on order (if present)             | Linked invoice                             |       |

## 3.3 Products & pricing (`/app/products`, `/app/products/:id`)

| ID     | Steps                                    | Expected                            | Pass? |
| ------ | ---------------------------------------- | ----------------------------------- | ----- |
| SUP-11 | Create product                           | Appears in list                     |       |
| SUP-12 | Edit product (name, SKU, category, tags) | Saves                               |       |
| SUP-13 | Deactivate/delete (if supported)         | Removed from catalog                |       |
| SUP-14 | Manage **prices** per SKU                | Price rows CRUD                     |       |
| SUP-15 | Product images/upload (files API)        | Image displays                      |       |
| SUP-16 | Plan SKU limit                           | Block at limit with upgrade message |       |

## 3.4 Fulfillment (`/app/fulfillment`)

| ID     | Steps                     | Expected                       | Pass? |
| ------ | ------------------------- | ------------------------------ | ----- |
| SUP-17 | Tab: Driver dispatch      | Assign driver / dispatch list  |       |
| SUP-18 | Tab: Waves                | Create/schedule wave           |       |
| SUP-19 | Tab: Pick lists           | Generate pick list from orders |       |
| SUP-20 | Tab: Routes               | Route planning UI              |       |
| SUP-21 | Tab: Delivery tracking    | Status updates                 |       |
| SUP-22 | Tab: Exceptions           | Log/resolve exception          |       |
| SUP-23 | Proof of delivery capture | Notes/signature fields save    |       |

## 3.5 Supplier inventory (`/app/inventory`)

| ID     | Steps                             | Expected              | Pass? |
| ------ | --------------------------------- | --------------------- | ----- |
| SUP-24 | Open `/app/inventory` (deep link) | Stock by warehouse    |       |
| SUP-25 | Low-stock alerts                  | Aligns with dashboard |       |
| SUP-26 | Stock adjustment                  | Quantity changes      |       |

## 3.6 Restaurants (customers) (`/app/restaurants`, `/app/restaurants/:id`)

| ID     | Steps                               | Expected                                       | Pass? |
| ------ | ----------------------------------- | ---------------------------------------------- | ----- |
| SUP-27 | Restaurant list                     | Stats render; **no currency format crash**     |       |
| SUP-28 | Restaurant detail                   | Order history, negotiated pricing if shown     |       |
| SUP-29 | **Restaurant pricing** / menu tiers | Create/edit tier; restaurant sees “my pricing” |       |

## 3.7 Invoices & payments (`/app/invoices`)

| ID     | Steps                                  | Expected                  | Pass? |
| ------ | -------------------------------------- | ------------------------- | ----- |
| SUP-30 | Issue invoice from order (if workflow) | Invoice created           |       |
| SUP-31 | Record **full payment**                | Balance zero              |       |
| SUP-32 | Record **partial payment**             | Remaining balance correct |       |
| SUP-33 | Apply **credit**                       | Balance adjusted          |       |
| SUP-34 | Payment history tab                    | All payments listed       |       |

## 3.8 Receiving (supplier view)

| ID     | Steps                                                   | Expected                     | Pass? |
| ------ | ------------------------------------------------------- | ---------------------------- | ----- |
| SUP-35 | Supplier receiving endpoints (if UI linked from orders) | Can confirm shipment context |       |

## 3.9 Chat (`/app/chat`)

| ID     | Steps                               | Expected          | Pass? |
| ------ | ----------------------------------- | ----------------- | ----- |
| SUP-36 | List conversations with restaurants | Loads             |       |
| SUP-37 | **Quick replies** (if enabled)      | Insert template   |       |
| SUP-38 | Send/receive messages               | Same as RST-58–60 |       |

## 3.10 Supplier settings (`/app/settings` — 9 tabs)

| ID      | Steps                            | Expected                                            | Pass? |
| ------- | -------------------------------- | --------------------------------------------------- | ----- |
| SUP-39  | Tab: Profile                     | Company info saves                                  |       |
| SUP-40  | Tab: Contacts                    | Contact persons CRUD                                |       |
| SUP-41  | Tab: Business                    | Tax, terms, policies                                |       |
| SUP-42  | Tab: Warehouses                  | Add/edit warehouse; plan limit gate                 |       |
| SUP-43  | Tab: Delivery                    | Zones, lead times, fees                             |       |
| SUP-44  | Tab: Branches                    | Multi-account linking                               |       |
| SUP-45  | Tab: Notifications               | Preferences save                                    |       |
| SUP-46  | Tab: Plan & billing              | Subscription + payment modal                        |       |
| SUP-46a | Tab: Activity — filters & list   | Same as RST-65a–65c (product.created for suppliers) |       |
| SUP-47  | All tabs visible without overlap | Tabs wrap on narrow screens                         |       |
| SUP-48  | `/app/supplier-settings`         | Same as `/app/settings`                             |       |

## 3.11 Supplier RBAC spot checks

| ID      | Steps              | Expected                                 | Pass? |
| ------- | ------------------ | ---------------------------------------- | ----- |
| RBAC-S1 | `SUPPLIER_STAFF`   | Fulfillment-focused; restricted settings |       |
| RBAC-S2 | `SUPPLIER_MANAGER` | Catalog + orders                         |       |
| RBAC-S3 | `SUPPLIER_OWNER`   | Full supplier access                     |       |

---

# Part 4 — Platform admin

**Primary account:** `admin@supplify.com`

**Sidebar:** Admin Dashboard, Supplier Admin, Restaurant Admin, Settings

## 4.1 Admin dashboard — main (`/app/admin`)

### Overview tab

| ID     | Steps                            | Expected                        | Pass? |
| ------ | -------------------------------- | ------------------------------- | ----- |
| ADM-01 | Open `/app/admin`                | Overview KPIs load              |       |
| ADM-02 | Past-due / trial alerts banner   | Shows when seed data has issues |       |
| ADM-03 | Charts: orders, revenue, signups | Render or empty state           |       |

### Activity tab

| ID     | Steps         | Expected               | Pass? |
| ------ | ------------- | ---------------------- | ----- |
| ADM-04 | Activity feed | Recent platform events |       |

### Tenants tab

| ID     | Steps                            | Expected                      | Pass? |
| ------ | -------------------------------- | ----------------------------- | ----- |
| ADM-05 | List all tenants                 | Restaurants + suppliers       |       |
| ADM-06 | Search/filter tenants            | Results update                |       |
| ADM-07 | Create new **restaurant** tenant | Tenant + locked subscription  |       |
| ADM-08 | Create new **supplier** tenant   | Same                          |       |
| ADM-09 | Open tenant detail               | Profile, subscription summary |       |

### Subscriptions tab

| ID     | Steps                               | Expected                 | Pass? |
| ------ | ----------------------------------- | ------------------------ | ----- |
| ADM-10 | List subscriptions                  | Status, plan, lock state |       |
| ADM-11 | Change plan (upgrade/downgrade)     | Preview + apply          |       |
| ADM-12 | **Activate** pending-activation sub | Tenant unlocked          |       |
| ADM-13 | **Unlock** past-due locked sub      | Lock cleared             |       |
| ADM-14 | Cancel / extend trial (if UI)       | Status updated           |       |

### Plans tab

| ID     | Steps                              | Expected                          | Pass? |
| ------ | ---------------------------------- | --------------------------------- | ----- |
| ADM-15 | List plans by tenant type          | Free, Bronze, Gold, Platinum      |       |
| ADM-16 | Edit plan limits/features          | Saves; tenants reflect on refresh |       |
| ADM-17 | Create plan version (if supported) | Appears in catalog                |       |

### Finance tab

| ID     | Steps                 | Expected           | Pass? |
| ------ | --------------------- | ------------------ | ----- |
| ADM-18 | MRR / revenue metrics | Load               |       |
| ADM-19 | Past-due amounts      | Match billing seed |       |

### Usage tab

| ID     | Steps                          | Expected                      | Pass? |
| ------ | ------------------------------ | ----------------------------- | ----- |
| ADM-20 | Tenant usage meters            | Orders/day, SKUs, chats, etc. |       |
| ADM-21 | **Limit overrides** per tenant | Override applies over plan    |       |

### Features tab

| ID     | Steps                           | Expected                                        | Pass? |
| ------ | ------------------------------- | ----------------------------------------------- | ----- |
| ADM-22 | Global feature flags list       | Toggles for chat, reports, calendar, etc.       |       |
| ADM-23 | Disable feature globally        | Tenants lose feature (with override exceptions) |       |
| ADM-24 | Per-tenant **feature override** | Force enable/disable single tenant              |       |

### Health tab

| ID     | Steps                    | Expected                     | Pass? |
| ------ | ------------------------ | ---------------------------- | ----- |
| ADM-25 | System health indicators | API/DB/redis status or stubs |       |

### Audit tab

| ID     | Steps                       | Expected               | Pass? |
| ------ | --------------------------- | ---------------------- | ----- |
| ADM-26 | Audit log entries           | Admin actions recorded |       |
| ADM-27 | Filter by actor/action/date | Works                  |       |

## 4.2 Supplier admin (`/app/admin/suppliers`)

| ID     | Steps                              | Expected               | Pass? |
| ------ | ---------------------------------- | ---------------------- | ----- |
| ADM-28 | Directory tab — supplier-only list | Suppliers only         |       |
| ADM-29 | Usage & quotas tab                 | Per-supplier meters    |       |
| ADM-30 | Audit logs tab                     | Supplier-scoped events |       |

## 4.3 Restaurant admin (`/app/admin/restaurants`)

| ID     | Steps                                | Expected                 | Pass? |
| ------ | ------------------------------------ | ------------------------ | ----- |
| ADM-31 | Directory tab — restaurant-only list | Restaurants only         |       |
| ADM-32 | Usage & quotas tab                   | Per-restaurant meters    |       |
| ADM-33 | Audit logs tab                       | Restaurant-scoped events |       |

## 4.4 Admin support tools

| ID     | Steps                            | Expected                          | Pass? |
| ------ | -------------------------------- | --------------------------------- | ----- |
| ADM-34 | **Impersonate** restaurant       | Tenant app as restaurant          |       |
| ADM-35 | **Impersonate** supplier         | Tenant app as supplier            |       |
| ADM-36 | Join chat as admin (if exposed)  | Moderation/support view           |       |
| ADM-37 | Admin settings (`/app/settings`) | Profile + notification prefs only |       |

## 4.5 Admin RBAC (if multiple admin users)

| ID      | Steps           | Expected                            | Pass? |
| ------- | --------------- | ----------------------------------- | ----- |
| RBAC-A1 | `SUPPORT_ADMIN` | Tenants + impersonation; no finance |       |
| RBAC-A2 | `FINANCE_ADMIN` | Finance + subscriptions             |       |
| RBAC-A3 | `GROWTH_ADMIN`  | Analytics-focused tools             |       |
| RBAC-A4 | `SUPER_ADMIN`   | All admin tabs                      |       |

---

# Part 5 — End-to-end business flows (multi-persona)

| ID     | Steps                                                                    | Expected                                 | Pass? |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------- | ----- |
| E2E-01 | Restaurant places order → Supplier accepts → Ships → Restaurant receives | Happy path all statuses                  |       |
| E2E-02 | Order → Invoice issued → Payment recorded                                | Invoice paid; balances correct           |       |
| E2E-03 | Restaurant chats supplier about order                                    | Message thread linked contextually       |       |
| E2E-04 | Guest books table → Restaurant board updates → Guest cancels via link    | Public + internal sync                   |       |
| E2E-05 | Staff clocks in on `/staff` → Manager sees on `/app/staff`               | Time event recorded                      |       |
| E2E-06 | Restaurant quick list scheduled order → Appears on supplier orders       | Scheduled metadata preserved             |       |
| E2E-07 | Supplier low stock → Dashboard alert → Adjust inventory                  | Stock corrected                          |       |
| E2E-08 | Free restaurant blocked on calendar → Upgrades → Calendar works          | Feature gate lifted                      |       |
| E2E-09 | Admin impersonates → places test order → stops impersonation             | Audit trail; no data leak across tenants |       |

---

# Part 6 — API & integration smoke (optional for QA leads)

| ID     | Steps                                         | Expected                      | Pass? |
| ------ | --------------------------------------------- | ----------------------------- | ----- |
| API-01 | `GET /api/auth/me` with session               | User + tenant + permissions   |       |
| API-02 | `GET /api/subscriptions/entitlements/current` | Plan, limits, usage, features |       |
| API-03 | `GET /api/orders/calendar` (Gold)             | 200 + events                  |       |
| API-04 | `GET /api/orders/calendar` (Free)             | 403/feature error             |       |
| API-05 | `POST /api/billing/checkout` (stub)           | Success URL or active sub     |       |
| API-06 | `GET /api/public/reservations/...`            | No auth required              |       |
| API-07 | Locked tenant `POST /api/orders`              | 402 ACCOUNT_LOCKED            |       |
| API-08 | File upload presign `POST /api/files`         | URL returned; upload succeeds |       |

---

# Part 7 — Automated tests (CI parity)

| ID    | Command                                   | Expected                | Pass? |
| ----- | ----------------------------------------- | ----------------------- | ----- |
| CI-01 | `pnpm --filter @supplify/api test:run`    | All API unit tests pass |       |
| CI-02 | `pnpm --filter @supplify/web test:run`    | All web unit tests pass |       |
| CI-03 | `pnpm test:ci` (root)                     | Both packages green     |       |
| CI-04 | `pnpm run e2e:playwright` (if configured) | E2E suite pass          |       |

---

# Part 8 — Non-functional & browser matrix

| ID     | Area           | Steps                         | Expected                              | Pass? |
| ------ | -------------- | ----------------------------- | ------------------------------------- | ----- |
| NFR-01 | Browser        | Chrome latest                 | Full pass on critical paths           |       |
| NFR-02 | Browser        | Firefox / Safari              | Layout acceptable                     |       |
| NFR-03 | Responsive     | Tablet width                  | Sidebar usable                        |       |
| NFR-04 | Performance    | Dashboard with prod-like data | Loads &lt; 5s                         |       |
| NFR-05 | Error handling | Stop API mid-request          | Toast/error boundary; no white screen |       |
| NFR-06 | Security       | Access other tenant ID in URL | 403/404                               |       |

---

## Sign-off

| Role             | Tester | Date | Build/branch | Open defects |
| ---------------- | ------ | ---- | ------------ | ------------ |
| Restaurant flows |        |      |              |              |
| Supplier flows   |        |      |              |              |
| Admin flows      |        |      |              |              |
| Public flows     |        |      |              |              |
| Billing / plans  |        |      |              |              |

---

_Full-application checklist for Supplify ERP. Billing-only scenarios are included in Part 0 (sections 0.3–0.4) and Part 5 (E2E-08)._
