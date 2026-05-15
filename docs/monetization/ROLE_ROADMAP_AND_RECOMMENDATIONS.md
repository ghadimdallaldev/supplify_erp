# Role-by-Role Review & Recommendations: Making Supplify the Best Restaurant Software

This document reviews **every role** (Restaurant, Supplier, Admin, Staff), summarizes current capabilities, and recommends what to build next so Supplify becomes the best software a restaurant can use.

---

## 1. RESTAURANT (Primary User)

### What they have today
- **Procurement:** Quick Lists, Cart, Orders, direct Message from Suppliers page, Order reminders
- **Suppliers:** Browse, follow/block, view products, message
- **Inventory:** Restaurant inventory, reorder suggestions, waste/spoilage tracking, receiving with quality status
- **Finance:** Invoices list/detail, record payments, overdue view, expense analytics, supplier statements
- **Receiving:** Pending orders, receive with quantity/quality, history
- **Reservations:** Board, floor builder, analytics, public `/reserve` portal, waitlist
- **Staff:** Roster, shifts, time entries, PTO/swaps, announcements, documents, performance notes
- **Chat:** 1:1 with suppliers, attachments
- **Settings:** Profile, notifications, subscription info

### Gaps & opportunities (restaurant-centric)

| Priority | Area | Gap / Opportunity | Why it matters |
|----------|------|-------------------|----------------|
| **P0** | **Unified “today” view** | No single “command center” for: orders due today, deliveries expected, low-stock alerts, reservations today, staff on shift | Restaurants think in “today”; everything is scattered across Orders, Receiving, Inventory, Reservations, Staff. |
| **P0** | **Mobile-first receiving** | Receiving is desktop-heavy; staff often receive at the back door on a phone | Quick “Receive” from notification or short link (order + confirm quantities) would dramatically improve adoption. |
| **P0** | **Invoice PDF** | No download/print for invoices; only view in app | Needed for accounting, disputes, and filing; doc says “planned” but not implemented. |
| **P1** | **Order → Receiving link** | After “Mark Delivered,” restaurant must remember to go to Receiving; no strong CTA “Receive this order” from order detail or notification | One tap from order or notification to open receiving for that order. |
| **P1** | **Low-stock → Quick List / Cart** | Reorder suggestions don’t one-click add to a Quick List or Cart | Reduces friction from “I see I’m low” to “I’ve ordered.” |
| **P1** | **Multi-branch clarity** | Branches exist in schema; UI is not clearly multi-branch (inventory, orders, reporting per branch) | Chains need per-location view and reporting. |
| **P1** | **Reservations ↔ Staff** | Reservations and Staff are separate; no “who’s on floor today” next to reservation load | Helps with section planning and shift coverage. |
| **P1** | **Notification preferences** | In-app + email/SMS exist; per-channel and per-event toggles could be clearer (e.g. “Only notify me for deliveries and overdue invoices”) | Reduces noise and increases action on important events. |
| **P2** | **Spend vs budget** | Expense analytics exist; no simple “monthly budget” or “budget vs actual” per category/supplier | Helps managers control costs. |
| **P2** | **Supplier performance** | No scorecard: on-time delivery, order accuracy, quality issues from receiving | Restaurants want to choose and keep the best suppliers. |
| **P2** | **Recurring order visibility** | Quick Lists can be scheduled; no clear “Upcoming recurring orders” or “Next run: Wed 9am” on dashboard | Builds trust in automation. |
| **P2** | **Guest preferences (reservations)** | Notes exist; no structured allergies, preferences, or visit history per guest (e.g. by phone/email) | Improves service and repeat visits. |

---

## 2. SUPPLIER

### What they have today
- **Products:** CRUD, bulk upload, images, categories, warehouse assignment
- **Inventory:** By product and by warehouse, reserved vs available
- **Orders:** Inbox, status workflow (Acknowledge → Processing → Shipped → Delivered), manual order creation for a restaurant
- **Invoices:** Auto-created on delivery, list/detail, record payments
- **Chat:** 1:1 with restaurants
- **Restaurants:** List (customers who ordered), basic detail
- **Fulfillment:** UI (waves, pick lists, routes); backend integration partial
- **Settings:** Profile, contacts, warehouses

### Gaps & opportunities (supplier helps restaurant experience)

| Priority | Area | Gap / Opportunity | Why it matters |
|----------|------|-------------------|----------------|
| **P0** | **Low-stock alerts (supplier)** | Suppliers don’t get notified when their warehouse stock is low | Prevents stockouts and failed orders; FEATURE_COMPARISON already flags this. |
| **P1** | **Restaurant analytics (supplier)** | No “top restaurants by orders/revenue” or “restaurants who stopped ordering” | Suppliers can prioritize and re-engage; restaurants get better attention. |
| **P1** | **Delivery ETA / tracking** | Order can be “Shipped” but no ETA or link to tracking | Restaurants want to know when to expect delivery; reduces “where’s my order?” chats. |
| **P1** | **Packing slip PDF** | Packing slip data exists; PDF download not implemented | Standard for warehouse and drivers. |
| **P1** | **Contract / custom pricing** | Restaurant pricing exists in schema; no supplier UI to set per-restaurant or volume pricing | Restaurants expect custom terms; reduces back-and-forth. |
| **P2** | **Payment reminders** | No automated “invoice overdue” reminder to restaurant | Improves cash flow for suppliers. |
| **P2** | **Product performance** | No “best sellers” or “products with most returns/complaints” | Helps suppliers optimize catalog and quality. |
| **P2** | **Fulfillment backend** | Waves, routes, pick lists need full API and workflow (assign orders to waves, print pick lists) | Makes “Mark Shipped” and delivery flow professional. |

---

## 3. ADMIN

### What they have today
- **Admin dashboard:** Overview, Plans, Subscriptions, Tenants (suppliers/restaurants), Usage, Audit logs, Portals (reservations, staff)
- **Plans:** Edit limits and features, pricing
- **Tenants:** Change plan, override limits, view usage
- **Chat:** Admin can start conversation with a tenant, join conversations
- **No** Dashboard/Products/Orders/Chat as a “normal” user (admin-only sidebar)

### Gaps & opportunities

| Priority | Area | Gap / Opportunity | Why it matters |
|----------|------|-------------------|----------------|
| **P1** | **Impersonation / support view** | Admin cannot “view as” a restaurant or supplier to debug or guide | Support and onboarding would be much faster. |
| **P1** | **Alerts for platform health** | No built-in alerts for: high error rate, DB latency, queue lag, failed jobs | Ensures reliability as the best restaurant software. |
| **P1** | **Billing integration** | Plans and limits exist; no Stripe/Billing provider for self-serve upgrade and usage-based billing | Needed for scale and fewer manual interventions. |
| **P2** | **Tenant onboarding checklist** | No “Restaurant onboarding: profile ✓, first order ✓, first receiving ✓” | Improves activation and retention. |
| **P2** | **Feature flags per tenant** | Experimental features (e.g. new reservations UI) can’t be toggled per tenant | Safer rollouts. |

---

## 4. STAFF (Front-line, self-service)

### What they have today
- **Staff self-service:** Magic-link login, dashboard with upcoming shifts, announcements, documents
- **PTO requests, shift swaps** (submit; manager approves in main Staff UI)
- **No** direct access to main app (no Orders, Inventory, Reservations in staff portal)

### Gaps & opportunities

| Priority | Area | Gap / Opportunity | Why it matters |
|----------|------|-------------------|----------------|
| **P1** | **Shift swap discovery** | Staff can request swaps; no “open shifts” or “who wants to swap?” visibility in portal | Fills gaps and reduces manager load. |
| **P1** | **Clock in/out in portal** | Time entry may be in main Staff app; ensure staff can clock in/out from self-service on mobile | Single place for frontline. |
| **P2** | **Read-only reservations or “my section”** | Staff could see today’s reservations (or filtered) in portal | Helps hosts and servers prepare. |
| **P2** | **Acknowledge documents** | Documents and policies with “acknowledged by” and date | Compliance and training. |

---

## 5. CROSS-CUTTING (All roles / platform)

| Priority | Area | Recommendation |
|----------|------|----------------|
| **P0** | **Real-time chat** | WebSocket is planned; deliver it so order-related questions get instant answers. |
| **P0** | **Request IDs & observability** | You have request IDs; add structured logging, metrics (p95, p99), and tracing so you can prove and improve “best software” reliability. |
| **P1** | **Offline / PWA** | Consider PWA for Receiving and Staff check-in so spotty WiFi doesn’t block operations. |
| **P1** | **Localization** | Names like `name_ar` suggest Arabic; add locale/translations for key flows (reservations, receiving, staff) to serve more markets. |
| **P1** | **Accessibility** | Reservations and Staff are used under stress; ensure keyboard nav, focus, and screen-reader basics. |

---

## 6. TOP 10 RECOMMENDATIONS (Prioritized for “best restaurant software”)

1. **Restaurant “Today” command center** – One screen: orders due today, expected deliveries, low-stock alerts, today’s reservations, who’s on shift. Optional: “Receive” and “Message supplier” from the same place.
2. **Mobile-friendly receiving** – Optimize Receiving for small screens; consider “Receive from notification” or short link so back-door staff can confirm delivery in one tap.
3. **Invoice PDF export** – **Status: 🟡 Partial.** Invoice detail has a "PDF" button but no onClick and no API for PDF—placeholder only.
4. **Order → Receive flow** – From order detail (and from “Order Delivered” notification), prominent “Receive this order” that opens receiving for that order.
5. **Low-stock → one-click reorder** – From reorder suggestions, “Add to Quick List” or “Add to Cart” so the next step is place order, not copy-paste.
6. **Supplier low-stock notifications** – So suppliers don’t run out and restaurants get reliable fulfillment.
7. **Supplier delivery ETA / tracking** – Optional ETA or tracking link when order is Shipped; fewer “where’s my order?” messages.
8. **Real-time chat** – **Status: ✅ Implemented.** Chat uses Socket.IO (join_conversation, send_message, new_message, typing, read updates). No change needed.
9. **Restaurant supplier scorecard** – Simple metrics (on-time, accuracy, quality from receiving) so restaurants can choose and reward the best suppliers.
10. **Admin “view as” tenant** – So support and onboarding can see exactly what the restaurant or supplier sees.

---

### Implementation status (as of review)

- **#8 Real-time chat:** **Done.** Socket.IO is used in ChatPage (join_conversation, send_message, new_message, typing, read updates).
- **#2 Mobile receiving:** **Partial.** Receiving page is responsive; no receive-from-notification or deep link to a specific order.
- **#3 Invoice PDF:** **Partial.** Invoice detail has a PDF button but no onClick and no API—placeholder only.
- **#4 Order to Receive:** **Partial.** Orders list links to /app/receiving when DELIVERED; Receiving does not accept ?order=id to open that order.
- **#5 Low-stock one-click:** **Partial.** Dashboard "Add to Quick List" links to quick-lists page; it does not add that suggestion (product + qty) to a list or cart in one click.
- **#6 Supplier low-stock notifications:** **Not implemented.** Suppliers are not notified when warehouse stock is low.

---

## 7. ROLE SUMMARY TABLE

| Role        | Strong today                          | Top 3 improvements |
|------------|----------------------------------------|--------------------|
| **Restaurant** | Procurement, inventory, finance, reservations, staff, chat | Today view, mobile receiving, invoice PDF |
| **Supplier**   | Products, orders, invoices, manual orders, chat | Low-stock alerts, delivery ETA, restaurant analytics |
| **Admin**      | Plans, tenants, usage, audit, portals  | View-as-tenant, billing integration, platform alerts |
| **Staff**      | Self-service, PTO, swaps, docs        | Open shifts / swap discovery, clock in/out in portal |

---

**Conclusion:** You already cover the full lifecycle (order → receive → inventory → invoice → pay) and have reservations, staff, and multi-tenant plans. To make Supplify the **best software a restaurant can use**, focus next on: (1) a unified “today” experience for restaurants, (2) mobile receiving and invoice PDF, (3) supplier reliability (low-stock alerts, ETA/tracking), (4) real-time chat, and (5) visibility (scorecards, admin view-as). That will improve daily operations, trust in suppliers, and support quality.
