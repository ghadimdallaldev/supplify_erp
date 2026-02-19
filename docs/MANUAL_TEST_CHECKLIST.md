# Supplify – Full manual test checklist

Use this checklist to test **every** feature of the application with a single admin, single restaurant, and single supplier.

---

## Setup (one-time)

- [ ] **Reduce DB to single tenant**  
       From repo root: `pnpm exec node apps/api/scripts/reduce-to-single-tenant.js`  
       Or from `apps/api`: `pnpm run reduce-to-single-tenant`  
       Result: 1 admin, 1 restaurant (Golden Fork), 1 supplier (Fresh Foods Co.).

- [ ] **Keycloak demo users** (if not already created)  
       From repo root: `pnpm run seed:demo-users`  
       Logins:
  - **Admin:** `supplifyadmin@supplify.com` / `Supplify2025!` (or `admin@supplify.com` / `SupplifyAdmin1!`)
  - **Restaurant:** `restaurant@supplify.com` / `SupplifyRestaurant1!`
  - **Supplier:** `supplier@supplify.com` / `SupplifySupplier1!`

- [ ] **API and Web** running (e.g. `pnpm dev` from monorepo or run api + web separately).

- [ ] **Keycloak** running (e.g. port 8080) if using real auth.

---

## 1. Authentication & session

- [ ] **Login page** (`/login`)
  - [ ] Page loads; “Sign in with Keycloak” (or login CTA) visible.
  - [ ] Demo accounts section shows admin / restaurant / supplier hints (if present).
  - [ ] Click login → redirects to Keycloak (or auth provider).
- [ ] **Keycloak login**
  - [ ] Enter restaurant email + password → redirects back to app.
  - [ ] Sidebar and dashboard visible (authenticated).
- [ ] **Session persistence**
  - [ ] Refresh page → still logged in, same role.
  - [ ] Open new tab to `/app/dashboard` → same session.
- [ ] **Logout**
  - [ ] Log out (header/sidebar) → redirect to `/login`; session cleared.
- [ ] **Expired / invalid session**
  - [ ] If app redirects to `/login?expired=true`, message is clear.

---

## 2. Restaurant role – core nav & dashboard

- [ ] **Login as restaurant** (`restaurant@supplify.com`).

- [ ] **Sidebar**
  - [ ] Dashboard, Products, Orders, Chat visible.
  - [ ] Quick Lists, Cart, Suppliers, Reservations, Staff, Inventory, Receiving, Invoices visible (if permissions allow).
  - [ ] Settings visible.
  - [ ] **No** “Admin Dashboard” / “Supplier Admin” / “Restaurant Admin” links.

- [ ] **Dashboard** (`/app/dashboard` or `/`)
  - [ ] Page loads; dashboard content visible (stats cards, charts, or placeholder).
  - [ ] “Open Admin Dashboard” link (if present) only for admin; restaurant does not see admin UI.
  - [ ] Reorder suggestions / recent orders / quick actions (if present) work or display correctly.

---

## 3. Restaurant – Products & catalog

- [ ] **Products list** (`/app/products`)
  - [ ] Products load (from the one supplier).
  - [ ] Search/filter by name, category, or tag works.
  - [ ] Pagination or “load more” (if present) works.
- [ ] **Product detail** (`/app/products/:id`)
  - [ ] Open a product → detail page (name, description, price, unit, supplier).
  - [ ] “Add to cart” (or equivalent) visible and works.
- [ ] **Add to cart**
  - [ ] Add one or more products with quantity → cart count updates (if shown in header).
  - [ ] Add same product again → quantity increases or duplicate line (expected behavior).

---

## 4. Restaurant – Cart & orders

- [ ] **Cart** (`/app/cart`)
  - [ ] Cart page loads; line items match what was added.
  - [ ] Edit quantity or remove line (if supported).
  - [ ] “Place order” (or “Submit order”) visible; click → order created or flow starts.
- [ ] **Orders list** (`/app/orders`)
  - [ ] Orders load (existing seeded orders + any just placed).
  - [ ] Filters (status, date range, supplier) work if present.
  - [ ] Open an order → **Order detail** (`/app/orders/:id`).
- [ ] **Order detail**
  - [ ] Order header (ID, status, dates, totals).
  - [ ] Line items with product, quantity, price.
  - [ ] Actions: cancel, request change, print (if present).

---

## 5. Restaurant – Quick lists

- [ ] **Quick lists** (`/app/quick-lists`)
  - [ ] List of quick lists loads.
  - [ ] Create new quick list (name, optional description).
  - [ ] Open a list → add items (products), set quantities.
  - [ ] “Add to cart” or “Order this list” (if present) → items go to cart or create order.
  - [ ] Edit list name / delete list (if supported).

---

## 6. Restaurant – Suppliers

- [ ] **Suppliers list** (`/app/suppliers`)
  - [ ] At least the one supplier (Fresh Foods Co.) appears.
- [ ] **Supplier detail** (`/app/suppliers/:id`)
  - [ ] Supplier info (name, contact, address).
  - [ ] Link to their products or catalog (if present).
  - [ ] Follow / unfollow or “Request catalog” (if present).

---

## 7. Restaurant – Reservations

- [ ] **Reservations** (`/app/reservations`)
  - [ ] Reservations cockpit loads; board view (day/week/month) or list.
  - [ ] **Date picker** – change date; board updates.
  - [ ] **Create reservation** – open create drawer/modal; fill guest name, phone, party size, time, table; submit → new reservation appears.
  - [ ] **Reservation board** – drag/drop or click to assign table, change status (Pending → Confirmed → Seated → Completed).
  - [ ] **Waitlist** – add to waitlist; move to table when available (if supported).
  - [ ] **Analytics** – summary (covers today, confirmed, waitlisted, seated) and any charts.
  - [ ] **Booking link for guests** – copy booking link; open in incognito → public reservation portal loads.
  - [ ] **Table builder** – add/edit tables (name, capacity, position/layout) if present.

---

## 8. Restaurant – Staff

- [ ] **Staff** (`/app/staff`)
  - [ ] **Team tab**
    - [ ] List of staff members (seeded: Sara, Imran, Layla).
    - [ ] Add staff: fill name, email, phone, role, wage type/rate, hire date; save.
    - [ ] Edit staff (role, contact, wage); deactivate/remove (if supported).
  - [ ] **Schedule & time tab**
    - [ ] Shifts list (by date).
    - [ ] Create shift: assign staff, role, date, start/end time, notes; save.
    - [ ] Time entries: clock-in / clock-out (or “Check in” / “Check out”); open entry shows.
  - [ ] **PTO & availability tab**
    - [ ] PTO requests list; create PTO (type, dates, reason); approve/deny (if manager).
    - [ ] Set availability (weekly blocks); save.
  - [ ] **Announcements & swaps tab**
    - [ ] Announcements list; create announcement (title, body, audience); publish.
    - [ ] Acknowledge announcement (if staff self-service or manager).
    - [ ] Shift swap: request swap (reason, proposed cover); approve/deny.
  - [ ] **Docs & incidents tab**
    - [ ] Documents list; upload document (type, title, expiry); view/download.
    - [ ] Incidents: create incident (category, severity, date, notes); list view.
    - [ ] Performance notes: add kudos or corrective note; list view.
  - [ ] **Payroll & insights tab**
    - [ ] Payroll exports list; create export (period); download or view totals (if supported).

---

## 9. Restaurant – Inventory & receiving

- [ ] **Restaurant inventory** (`/app/restaurant-inventory`)
  - [ ] Inventory list (on-hand, low-stock threshold) loads.
  - [ ] Adjust quantity (manual adjust or receive); movement log (if present).
  - [ ] Low-stock alerts or reorder suggestions (if present).
- [ ] **Receiving** (`/app/receiving`)
  - [ ] Receiving list (by order or by date).
  - [ ] Record receipt: select order/supplier, confirm quantities (or mark short/damaged); submit.
  - [ ] Receiving report or history view (if present).

---

## 10. Restaurant – Invoices

- [ ] **Invoices** (`/app/invoices`)
  - [ ] Invoices list (issued, paid, overdue) loads.
  - [ ] Open an invoice → detail (line items, totals, due date, status).
  - [ ] Record payment (if supported): amount, date; status updates.
  - [ ] Filter by status/supplier/date (if present).

---

## 11. Restaurant – Chat

- [ ] **Chat** (`/app/chat`)
  - [ ] Conversation list (with the one supplier) loads.
  - [ ] Open conversation → message history (or empty).
  - [ ] Send text message → appears in thread.
  - [ ] Reply to message (if reply UI present).
  - [ ] Pin/archive conversation (if supported).
  - [ ] Attach file (if supported).

---

## 12. Restaurant – Onboarding & settings

- [ ] **Onboarding** (`/app/onboarding`) – if shown for new/incomplete profile
  - [ ] Steps: business details, branches, suppliers to follow; complete flow.
- [ ] **Settings** (`/app/settings`)
  - [ ] **Restaurant settings** (if shown): business name, address, contact, logo; save.
  - [ ] **Notification preferences**: toggles (email, SMS, in-app; order updates, messages, invoices, low stock, reservations, staff PTO/swaps); save.
  - [ ] **Subscription / plan** (if shown): current plan, upgrade/downgrade (or link to billing).

---

## 13. Supplier role – core nav & dashboard

- [ ] **Logout; login as supplier** (`supplier@supplify.com`).

- [ ] **Sidebar**
  - [ ] Dashboard, Products, Orders, Chat visible.
  - [ ] Restaurants, Fulfillment, Invoices visible.
  - [ ] Settings visible.
  - [ ] **No** Admin / Supplier Admin / Restaurant Admin links.

- [ ] **Dashboard** (`/app/dashboard`)
  - [ ] Supplier dashboard loads (stats, recent orders, or placeholder).

---

## 14. Supplier – Products & catalog

- [ ] **Products** (`/app/products`)
  - [ ] Supplier’s products load (Fresh Foods catalog).
  - [ ] Search/filter; open product detail.
  - [ ] Edit product (name, description, price, unit, category) if supplier can edit; save.
  - [ ] Inventory (warehouse qty) visible or editable (if present).

---

## 15. Supplier – Orders & fulfillment

- [ ] **Orders** (`/app/orders`)
  - [ ] Orders from the one restaurant load.
  - [ ] Filter by status (PLACED, ACKNOWLEDGED, PROCESSING, SHIPPED, DELIVERED, CANCELLED).
  - [ ] Open order → detail; **Acknowledge** order (if PLACED).
  - [ ] **Start processing** → status PROCESSING.
  - [ ] **Ship** → status SHIPPED (or add tracking if supported).
  - [ ] **Deliver** → status DELIVERED.
  - [ ] **Decline / cancel** (if PLACED) → status CANCELLED; reason (if required).
- [ ] **Fulfillment** (`/app/fulfillment`)
  - [ ] Fulfillment queue or list (by order/date); update status (pick, pack, ship) if present.

---

## 16. Supplier – Restaurants & invoices

- [ ] **Restaurants** (`/app/restaurants`)
  - [ ] List shows the one restaurant (Golden Fork).
  - [ ] Open restaurant detail (if present): profile, order history.
- [ ] **Invoices** (`/app/invoices`)
  - [ ] Invoices list (issued to restaurant); open invoice; status (Issued, Partially paid, Paid, Overdue, Void).
  - [ ] Create invoice (if supported): link to order, line items, due date; issue.

---

## 17. Supplier – Chat & settings

- [ ] **Chat** (`/app/chat`)
  - [ ] Conversation with restaurant; send/receive messages; reply; pin/archive (if supported).
- [ ] **Supplier settings** (`/app/supplier-settings`)
  - [ ] **Profile**: name, slug, VAT, contact email/phone, address; logo upload; save.
  - [ ] **Warehouses** (if present): add/edit warehouse (name, address); set inventory per warehouse.
  - [ ] **Notification preferences**: toggles; save.
  - [ ] **Subscription / plan** (if shown): current plan, limits.

---

## 18. Admin role – dashboard & tabs

- [ ] **Logout; login as admin** (`supplifyadmin@supplify.com`).

- [ ] **Sidebar**
  - [ ] **Only** Admin Dashboard, Supplier Admin, Restaurant Admin (and Settings if shown).
  - [ ] No Products, Orders, Cart, Quick Lists, etc. (tenant nav hidden).

- [ ] **Admin dashboard** (`/app/admin`)
  - [ ] **Overview** tab: high-level metrics (tenants, orders, revenue, or placeholders).
  - [ ] **Plans** tab: list of subscription plans (Free, Bronze, Gold, Platinum); create/edit plan (if supported).
  - [ ] **Subscriptions** tab: list of tenant subscriptions; change plan, cancel, or extend trial.
  - [ ] **Tenants** tab: list of restaurants and suppliers; open tenant detail (if present).
  - [ ] **Health** tab: service health or dependency status (if present).
  - [ ] **Finance** tab: revenue overview, payouts (if present).
  - [ ] **Usage** tab: usage metrics, quotas, limits per tenant (if present).
  - [ ] **Audit** tab: audit log (login, admin actions); filter by date/user/action.

- [ ] **Supplier Admin** (`/app/admin/suppliers`)
  - [ ] Same admin dashboard with **Tenants** tab focused on suppliers; list and detail (if present); usage/audit for suppliers.

- [ ] **Restaurant Admin** (`/app/admin/restaurants`)
  - [ ] Same with **Tenants** tab focused on restaurants; list and detail; usage/audit.

---

## 19. Admin – Impersonation (if supported)

- [ ] From tenant list or tenant detail: **Impersonate** restaurant or supplier.
- [ ] UI switches to that tenant’s view (sidebar, dashboard); banner “Impersonating …” visible.
- [ ] Actions (orders, products, etc.) performed as that tenant.
- [ ] **Stop impersonating** → back to admin view.

---

## 20. Admin – Settings

- [ ] **Settings** (`/app/settings`) as admin
  - [ ] Admin-specific settings (if any): notification prefs, system config; save.

---

## 21. Public reservation portal (no login)

- [ ] **Booking link** (from restaurant Reservations page): copy link; open in incognito or different browser.
- [ ] **Public portal** (`/reserve` or `/reserve/:restaurantIdOrSlug`)
  - [ ] Select date, time, party size; see available tables/slots.
  - [ ] Submit booking → confirmation message or page.
- [ ] **Confirmation page** (`/reserve/confirmation`)
  - [ ] After booking: confirmation with details; email (if sent).
- [ ] **Manage reservation** (`/reserve/manage/:token`)
  - [ ] Use link from “manage” email or UI; modify time/party or cancel reservation.

---

## 22. Staff self-service (no main app login)

- [ ] **Staff login** (`/staff`)
  - [ ] Staff self-service login page; sign in with staff credentials (if configured).
- [ ] **Staff dashboard** (`/staff/dashboard`)
  - [ ] After login: shifts, time clock-in/out, PTO request, swap requests, announcements, documents (as per staff role).

---

## 23. Cross-cutting & edge cases

- [ ] **Permissions**: Turn off a permission (e.g. RESERVATIONS_VIEW) for restaurant role in DB or admin UI; reload → Reservations nav hidden or access denied.
- [ ] **Subscription / limits**: If plan limits exist (e.g. max orders, max staff), hit limit → upgrade prompt or blocked action; message clear.
- [ ] **Mobile / responsive**: Key flows (login, dashboard, products, cart, one order, one reservation) usable on small viewport.
- [ ] **Errors**: Invalid URL (e.g. `/app/unknown`) → 404 or redirect; API error (e.g. 500) → user-friendly message or toast.
- [ ] **Logout from all roles**: After testing each role, logout and confirm redirect to login and no residual data in UI.

---

## Quick reference – logins (after reduce-to-single-tenant + seed:demo-users)

| Role       | Email                      | Password             |
| ---------- | -------------------------- | -------------------- |
| Admin      | supplifyadmin@supplify.com | Supplify2025!        |
| Admin      | admin@supplify.com         | SupplifyAdmin1!      |
| Restaurant | restaurant@supplify.com    | SupplifyRestaurant1! |
| Supplier   | supplier@supplify.com      | SupplifySupplier1!   |

---

**End of checklist.** Tick each item as you test; use the “Quick reference” table to switch roles and cover every feature.
