# 12 — Demo Scripts

**Audience:** Sales, customer success, product, and engineering presenters.  
**Environment:** Local or staging with `pnpm run seed:full` completed.  
**Evidence:** `apps/api/scripts/seed-full.mjs`, `seed-demo-users.js`, `seed-plan-tier-demos.js`, `seed-billing.js`, `seed-demo-readiness-extras.js`, `docs/audits/SUPPLIFY_DEMO_READINESS_AUDIT.md`.

---

## Before you present

### One-command prep

```bash
pnpm local:infra          # Postgres, Keycloak (8180), MinIO, Redis
pnpm db:migrate
pnpm run seed:full        # WARNING: wipes all restaurants/suppliers
pnpm dev                  # API + web
```

If Keycloak was down during seed:

```bash
pnpm run seed:accounts && pnpm run seed:demo-users
```

Optional deterministic data: `SEED=1337 pnpm run seed:full`.

### Primary demo accounts (Gold tier, active billing)

| Account                   | Password               | Tenant                 | Why use it                                                                 |
| ------------------------- | ---------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `admin@supplify.com`      | `SupplifyAdmin1!`      | Platform admin         | Command center, deal approval, impersonation                               |
| `restaurant@supplify.com` | `SupplifyRestaurant1!` | Golden Fork Restaurant | **Gold**, active billing, coupon `DEMOFORK10`, expiring inventory tomorrow |
| `supplier@supplify.com`   | `SupplifySupplier1!`   | Fresh Foods Co.        | **Gold**, active billing, linked to Golden Fork, rich catalog              |

### Plan-tier matrix accounts (password `Supplify1!`)

| Account                                            | Plan       | Slug                        | Notes                                                                                      |
| -------------------------------------------------- | ---------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `restaurant-gold@supplify.com`                     | Gold       | `plan-demo-restaurant-gold` | **Past-due grace** after `seed:billing` — shows billing banner; use for billing story only |
| `supplier-gold@supplify.com`                       | Gold       | `plan-demo-supplier-gold`   | Clean Gold supplier for tier comparisons                                                   |
| `supplier-free@supplify.com`                       | Free Trial | `plan-demo-supplier-free`   | At **1/1 active deals** after seed (quota demo)                                            |
| `restaurant-1@test.com` … `restaurant-10@test.com` | Prod-like  | varies                      | Volume data; password `Supplify1!`                                                         |

> **Presenter tip:** For a polished Gold demo without billing noise, lead with `restaurant@supplify.com` / `supplier@supplify.com`. Use `restaurant-gold@` only when demonstrating grace-period UX.

### Data seeded by `seed:full` (talking points)

- ~10 prod-like restaurants, ~50 suppliers, ~2k products, ~1.5k orders, invoices, chats, quick lists, reservations, staff, disputes, approved deals.
- Extras (`seed-demo-readiness-extras.js`): inventory expiring tomorrow, coupon `DEMOFORK10`, Free-tier supplier at promotion limit.
- **Not seeded:** driver Keycloak logins, live GPS routes, multi-warehouse stock edge cases. See backups per step.

### Avoid on live demos

| Area                                                  | Reason                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Supplier Settings → Delivery Zones / Contacts         | UI not wired (`DELIVERY_ZONES_ENABLED = false` in `supplierSettingsShared.tsx`) |
| Restaurant finance → period statement opening balance | Hardcoded `0` (`restaurant-finance.routes.js:795`)                              |
| Dashboard 7d/30d/90d selector                         | Visual only; spend trend is fixed 30-day                                        |
| Creating a **new** deal without pre-approving         | New deals start `pending_approval` until admin approves                         |

---

## Step template (used below)

Each step lists: **Screen**, **User**, **Clicks**, **Narration**, **Business value**, **Expected result**, **Backup**, **Prep data**.

---

## 5-minute executive demo

**Goal:** Platform vision in one pass — marketplace, fulfillment, control plane.  
**Logins prepared:** admin, restaurant@, supplier@ (three browser profiles or incognito tabs).

| #   | Screen             | User       | Clicks                                                                              | Narration                                                                             | Business value                        | Expected result                                                                         | Backup                                                      | Prep                                               |
| --- | ------------------ | ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| 1   | `/login`           | Presenter  | Sign in with Keycloak → `restaurant@supplify.com`                                   | "Restaurants discover suppliers, build carts, and place B2B orders in one workspace." | Reduces phone/email ordering chaos    | Lands on Command Center or Dashboard; sidebar shows OPERATIONS (Orders, Products, Cart) | Use `restaurant-gold@` + narrate billing banner             | `seed:full`                                        |
| 2   | `/app/products`    | Restaurant | Open **Products** → filter/search → open one SKU                                    | "Contract pricing and catalog search replace spreadsheets."                           | Price transparency, faster purchasing | Product list loads; "Your price" badge if contract price exists                         | Show **Suppliers** → one supplier detail                    | Fresh Foods products linked                        |
| 3   | `/app/cart`        | Restaurant | **Cart** → review lines → **Place order** (do not need full checkout if time-tight) | "One click places the PO; supplier gets notified instantly."                          | Cuts order-to-ack time                | Order created `PLACED`; redirect/toast success                                          | Open existing order from **Orders**                         | Cart may already have items from prior seed orders |
| 4   | `/login` (new tab) | Supplier   | `supplier@supplify.com` → **Orders** → open newest `PLACED` order → **Accept**      | "Suppliers acknowledge, fulfill, and invoice without leaving the platform."           | Supplier ops on one screen            | Status → `ACKNOWLEDGED` or processing path visible                                      | Show **Fulfillment** board with existing `PROCESSING` order | Pending orders in seed data                        |
| 5   | `/login` (new tab) | Admin      | `admin@supplify.com` → `/app/admin` **Overview**                                    | "We govern tenants, plans, growth, and compliance from a single command center."      | SaaS operator control                 | KPI cards populate; Activity feed non-empty after seed                                  | **Tenants** tab only if Overview empty                      | Admin Keycloak role                                |

**Close:** "Supplify connects restaurant procurement to supplier fulfillment with plan-based monetization and platform oversight."

---

## 15-minute standard demo

**Goal:** End-to-end B2B order + money + chat.  
**Primary path:** restaurant@ → supplier@ → admin@ (deals optional).

| #   | Screen                                    | User       | Clicks                                                                         | Narration                                                        | Business value                        | Expected result                               | Backup                                 | Prep                                     |
| --- | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| 1   | `/app/command-center` or `/app/dashboard` | Restaurant | Sign in → overview                                                             | "Command center surfaces spend, low stock, and pending orders."  | Executive visibility for ops managers | Widgets load; pending order badge on sidebar  | Skip to **Orders** if dashboard slow   | Gold entitlements active                 |
| 2   | `/app/suppliers`                          | Restaurant | **Suppliers** → show Fresh Foods connected                                     | "Restaurants follow suppliers; limits scale by plan."            | Curated supplier network              | Follow relationship visible                   | Use **Products** with supplier filter  | `restaurant_supplier_follow` seeded      |
| 3   | `/app/deals`                              | Restaurant | **Deals** → open active promotion                                              | "Suppliers run campaigns; restaurants redeem with daily caps."   | Promotional pull-through              | Active deals list; redemption UI              | Mention admin approval workflow        | `seed-feature-demos` + approved deals    |
| 4   | `/app/cart`                               | Restaurant | Add 2–3 SKUs → apply coupon `DEMOFORK10` if shown → **Place order**            | "Deals and contract prices apply at checkout."                   | Margin protection + promos            | Order `PLACED`; deal redemption recorded      | Place without coupon                   | Coupon from `seed-demo-readiness-extras` |
| 5   | `/app/orders/:id`                         | Restaurant | Open new order → **Tracking** panel (if shipped)                               | "Restaurants see delivery ETA and driver location when enabled." | Delivery confidence                   | Tracking card or status timeline              | Narrate GPS env flag if no live route  | `GPS_TRACKING_ENABLED` default true      |
| 6   | `/app/orders`                             | Supplier   | Sign in supplier → filter **PLACED** → **Accept**                              | "Inbox replaces email POs."                                      | Faster response SLA                   | Status updates; notification to restaurant    | Show already-`ACKNOWLEDGED` order      | 60s polling on orders                    |
| 7   | `/app/fulfillment`                        | Supplier   | **Fulfillment** → dispatch board → assign driver (or show existing assignment) | "Warehouse teams batch routes and assign drivers."               | Last-mile efficiency                  | Board shows assignments; driver column        | Narrate driver mobile app parity       | Fulfillment feature on Gold              |
| 8   | `/app/receiving`                          | Restaurant | **Receiving** → select delivered order → confirm quantities                    | "Receiving closes the loop and triggers invoicing."              | Accurate goods-in                     | `RECEIVED_FULL` or partial path               | Show pre-received order in list        | Receiving orders in seed                 |
| 9   | `/app/invoices`                           | Restaurant | **Invoices** → open `ISSUED` invoice                                           | "Finance sees AP in one ledger."                                 | AP automation                         | Invoice lines match order                     | Supplier **Invoices** receivables view | ~500 invoices seeded                     |
| 10  | `/app/chat`                               | Both       | Restaurant **Chat** → open Fresh Foods thread → send message                   | "Contextual messaging beats WhatsApp chaos."                     | Fewer order errors                    | Message appears; typing/realtime if socket up | Refresh once if socket delayed         | `seed:chats`                             |
| 11  | `/app/admin`                              | Admin      | **Deals** tab → show approved vs pending                                       | "Platform approves supplier promotions before they go live."     | Brand/trust control                   | Filter pending/approved                       | **Plans** tab if no pending deals      | Admin `ADMIN_GROWTH`                     |

---

## 30-minute full demo

**Goal:** Standard demo plus inventory, reservations, growth, RBAC, and ops. Add **+15 min** after step 11 above.

| #   | Screen                      | User       | Clicks                                                  | Narration                                                    | Business value                 | Expected result                    | Backup                                                        | Prep                                     |
| --- | --------------------------- | ---------- | ------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------ | ---------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| 12  | `/app/restaurant-inventory` | Restaurant | **Inventory** → **Expiry** tab                          | "Expiry alerts prevent waste before service."                | Food cost control              | Item expiring tomorrow highlighted | Dashboard expiry summary widget                               | `seed-demo-readiness-extras`             |
| 13  | `/app/quick-lists`          | Restaurant | **Ordering Lists** → open list → **Order from list**    | "Templates turn weekly buying into one click."               | Purchaser productivity         | Quick list → cart prefill          | Scheduled list narrative only                                 | `seed:quick-lists`                       |
| 14  | `/app/reservations`         | Restaurant | **Reservations** → floor board                          | "FOH runs on the same platform as back-of-house buying."     | Unified hospitality stack      | Tables/slots visible               | Public `/reserve/:slug` in second window                      | Reservations in prodlike seed            |
| 15  | `/app/customer-growth`      | Supplier   | **Customer Growth** → metrics + import card             | "Suppliers acquire restaurants via CSV, invites, referrals." | Supplier-led growth            | KPI widgets; import history        | Narrate `/register?ref=` flow                                 | `supplier_growth` on Gold                |
| 16  | `/app/promotions`           | Supplier   | **Deals** → create draft (optional)                     | "New deals enter compliance review."                         | Controlled promos              | Status `pending_approval`          | Show existing active deal instead                             | Don't submit if no admin follow-up       |
| 17  | `/app/admin` → Usage        | Admin      | Search `plan-demo-supplier-free` → **Usage & quotas**   | "Free tier hits promotion caps — upgrade path is visible."   | Conversion funnel              | `1/1` active deals                 | **Limits** override demo                                      | `seed-demo-readiness-extras`             |
| 18  | `/app/admin` → Operations   | Admin      | **Operations** → active deliveries / fulfillment issues | "Ops sees live logistics health."                            | NOC-style visibility           | Panels load or empty state         | **Health** tab cron status                                    | `GET /api/admin-dashboard/operational/*` |
| 19  | `/app/settings` → Team      | Restaurant | **Settings** → **Team** → show roles                    | "Granular RBAC: purchaser vs receiving vs accountant."       | Least privilege                | Role matrix visible                | Mention `restaurant-gold-manager@` if `seed:tier-catalog` run | 7 restaurant system roles                |
| 20  | `/app/disputes`             | Restaurant | **Disputes** → open active dispute                      | "Quality issues become structured workflows, not arguments." | Dispute resolution audit trail | Dispute detail with status         | Supplier incoming disputes mirror                             | `seed-feature-demos`                     |

---

## Restaurant-only demo (12 minutes)

**Login:** `restaurant@supplify.com` / `SupplifyRestaurant1!`

| #   | Screen                      | User             | Clicks                             | Narration                                 | Business value    | Expected result         | Backup                                   | Prep               |
| --- | --------------------------- | ---------------- | ---------------------------------- | ----------------------------------------- | ----------------- | ----------------------- | ---------------------------------------- | ------------------ |
| 1   | `/app/dashboard`            | Restaurant Owner | Sign in                            | "Your purchasing cockpit."                | Visibility        | Dashboard KPIs          | Command center                           | Gold active        |
| 2   | `/app/products`             | Purchaser        | Search → add to cart               | "Browse all connected suppliers."         | Assortment        | Cart badge updates      | **My Prices** for contracts              | Catalog seeded     |
| 3   | `/app/deals`                | Purchaser        | Redeem/view deal                   | "Save on promoted SKUs."                  | COGS              | Deal applied at cart    | Skip if empty                            | Approved deals     |
| 4   | `/app/cart`                 | Purchaser        | Place order                        | "PO in seconds."                          | Speed             | `PLACED` order          | Use quick list                           | —                  |
| 5   | `/app/orders`               | Manager          | Track status                       | "No more calling suppliers."              | Accountability    | Timeline updates        | Open seeded `DELIVERED` order            | —                  |
| 6   | `/app/receiving`            | Receiving Staff  | Receive shipment                   | "Scan-verify quantities."                 | Accuracy          | Receiving complete      | Photo upload if `receiving_quality`      | —                  |
| 7   | `/app/invoices`             | Accountant       | Open invoice → record payment view | "AP ready for export."                    | Finance           | Invoice `ISSUED`/`PAID` | Avoid period statement                   | —                  |
| 8   | `/app/chat`                 | Purchaser        | Message supplier                   | "Clarify substitutions in-thread."        | Fewer errors      | Message sent            | —                                        | Chat thread exists |
| 9   | `/app/restaurant-inventory` | Manager          | Expiry + par levels                | "Stock ties to what you actually bought." | Waste reduction   | Expiry row tomorrow     | —                                        | Extras seed        |
| 10  | `/app/settings`             | Owner            | Plan & entitlements                | "Upgrade when you outgrow limits."        | Expansion revenue | Gold plan shown         | Compare `restaurant-free@` in second tab | —                  |

---

## Supplier-only demo (12 minutes)

**Login:** `supplier@supplify.com` / `SupplifySupplier1!`

| #   | Screen                   | User               | Clicks                         | Narration                                    | Business value     | Expected result              | Backup                                  | Prep                   |
| --- | ------------------------ | ------------------ | ------------------------------ | -------------------------------------------- | ------------------ | ---------------------------- | --------------------------------------- | ---------------------- |
| 1   | `/app/command-center`    | Supplier Manager   | Sign in                        | "Revenue, at-risk orders, fulfillment load." | Supplier exec view | KPIs render                  | Dashboard                               | —                      |
| 2   | `/app/products`          | Catalog Manager    | Open SKU → edit price          | "Single catalog feeds all restaurants."      | Catalog truth      | Save succeeds                | CSV import narrative                    | Products seeded        |
| 3   | `/app/contract-pricing`  | Catalog Manager    | Show restaurant-specific price | "Negotiated rates per account."              | Account management | Contract row for Golden Fork | —                                       | —                      |
| 4   | `/app/orders`            | Order Fulfillment  | Accept/decline demo            | "Structured decline reasons."                | Quality feedback   | Status change                | Show declined order in seed             | —                      |
| 5   | `/app/fulfillment`       | Warehouse Manager  | Dispatch board                 | "Pick, pack, route."                         | Throughput         | Assignments visible          | Routes tab                              | —                      |
| 6   | `/app/invoices`          | Accountant         | Receivables → record payment   | "AR without QuickBooks export hell."         | Cash application   | Payment recorded             | Credit note via dispute                 | —                      |
| 7   | `/app/promotions`        | Promotions Manager | Active deal                    | "Growth through promotions."                 | Revenue lift       | Active promotion             | Locked card on Free tier account        | —                      |
| 8   | `/app/customer-growth`   | Manager            | Invite link / CSV              | "Acquire net-new restaurants."               | Pipeline           | Growth dashboard             | —                                       | Gold `supplier_growth` |
| 9   | `/app/restaurants`       | Manager            | Connected restaurants          | "CRM for your buyer base."                   | Relationship mgmt  | Golden Fork listed           | —                                       | Follow seeded          |
| 10  | `/app/supplier-settings` | Owner              | Profile, warehouses, team      | "Configure org without IT."                  | Self-serve         | Tabs load                    | **Do not** open Delivery Zones/Contacts | Warehouses API-backed  |

---

## Operations / platform admin demo (15 minutes)

**Login:** `admin@supplify.com` / `SupplifyAdmin1!`

| #   | Screen                       | User           | Clicks                                     | Narration                                | Business value       | Expected result                      | Backup                                     | Prep                                    |
| --- | ---------------------------- | -------------- | ------------------------------------------ | ---------------------------------------- | -------------------- | ------------------------------------ | ------------------------------------------ | --------------------------------------- |
| 1   | `/app/admin/overview`        | Platform admin | Sign in → Overview                         | "Health of the marketplace."             | Investor/ops metrics | KPI cards                            | Activity tab                               | `ADMIN_ACCESS`                          |
| 2   | `/app/admin/tenants`         | Admin          | Filter `ACTIVE` / `TRIALING`               | "Every tenant at a glance."              | Support efficiency   | Paginated directory                  | Supplier/restaurant portals                | Seeded tenants                          |
| 3   | `/app/admin/suppliers`       | Admin          | Open supplier row → impersonate (optional) | "Support sees exactly what they see."    | Faster tickets       | Impersonation banner on web          | Narrate only if policy forbids impersonate | `POST /api/admin-dashboard/impersonate` |
| 4   | `/app/admin/plans`           | Admin          | Edit Free Trial days (7–90) → save         | "Tune sandbox without deploy."           | Product ops          | PATCH succeeds                       | Revert after demo                          | Default 30 days                         |
| 5   | `/app/admin/subscriptions`   | Admin          | Find `restaurant-gold@` → show past due    | "Grace before lockout."                  | Revenue protection   | Past due + days left                 | Unlock action narrative                    | `seed-billing.js`                       |
| 6   | `/app/admin/limits`          | Admin          | Tenant override demo (narrate)             | "Enterprise deals without new plan SKU." | Flexibility          | Effective limit preview              | Read-only if no permission                 | `ADMIN_PLANS`                           |
| 7   | `/app/admin/deals`           | Admin          | Approve pending promotion                  | "Compliance gate for public deals."      | Trust & safety       | Deal → active                        | Show already-approved                      | —                                       |
| 8   | `/app/admin/operations`      | Admin          | Active deliveries, email logs              | "Run the airline."                       | Incident response    | Panels or empty states               | Health tab                                 | Operational APIs                        |
| 9   | `/app/admin/audit`           | Admin          | Audit log search                           | "Who changed what."                      | SOC narrative        | Rows after impersonation/plan change | Tenant audit log on Gold restaurant        | —                                       |
| 10  | `/app/admin/growth-settings` | Admin          | Referral discount fields                   | "Growth program knobs."                  | CAC/LTV tuning       | GET/PATCH growth settings            | —                                          | `0169` migration                        |

---

## Admin demo (finance + governance focus, 10 minutes)

Subset for CFO/platform stakeholders — steps 1, 5, 6, 7, 9 from Operations demo, plus:

| #   | Screen                     | User          | Clicks                             | Narration                    | Business value        | Expected result                 | Backup                | Prep            |
| --- | -------------------------- | ------------- | ---------------------------------- | ---------------------------- | --------------------- | ------------------------------- | --------------------- | --------------- |
| A   | `/app/admin/finance`       | Admin Finance | Financial overview                 | "MRR, churn, overdue."       | Board reporting       | Charts load                     | Conversion stats      | `ADMIN_FINANCE` |
| B   | `/app/admin/subscriptions` | Admin         | Preview plan change                | "Safe plan migrations."      | Expansion/contraction | Preview modal                   | —                     | —               |
| C   | `/app/admin/feature-flags` | Admin Growth  | Toggle feature flag (narrate risk) | "Kill switches for rollout." | Risk reduction        | List loads; avoid mutating prod | Read-only walkthrough | —               |

---

## Driver / logistics add-on (5 minutes)

**Note:** `seed:full` does **not** create driver Keycloak users. Prep manually or use fulfillment view as Warehouse Manager.

| #   | Screen                             | User           | Clicks                                                             | Narration                                      | Business value     | Expected result            | Backup                                   | Prep                        |
| --- | ---------------------------------- | -------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ------------------ | -------------------------- | ---------------------------------------- | --------------------------- |
| 1   | `/app/supplier-settings` → Drivers | Supplier Owner | Invite driver email (or use existing team member with Driver role) | "Drivers get a minimal UI — only their route." | Security isolation | Driver role assigned       | **Fulfillment** board as Manager instead | `driver_management` feature |
| 2   | `/app/driver-deliveries`           | Driver         | Sign in as driver user → **My Deliveries**                         | "Mobile-first last mile."                      | Proof of delivery  | Stop list + status buttons | Narrate mobile app                       | `DRIVER_DELIVERIES_*` perms |
| 3   | `/app/orders/:id`                  | Restaurant     | Tracking map on in-transit order                                   | "Buyers see ETA, not phone calls."             | CX                 | Map or stale badge ≥5 min  | Mention `GPS_STALE_AFTER_SECONDS=300`    | Env `GPS_TRACKING_ENABLED`  |

---

## Rehearsal checklist (day before)

- [ ] `seed:full` completes; Keycloak users exist
- [ ] `restaurant@` / `supplier@` login without `/login?expired=true`
- [ ] Admin Overview KPIs non-empty
- [ ] At least one `PLACED` order to accept live
- [ ] Coupon `DEMOFORK10` works on Golden Fork cart
- [ ] Chat message round-trip
- [ ] DevTools: no red errors on scripted path
- [ ] Mobile width: sidebar collapses (`Sidebar.mobile.test.tsx` behavior)

---

## Related docs

- [02-complete-product-guide.md](./02-complete-product-guide.md) — domain reference
- [06-admin-onboarding.md](./06-admin-onboarding.md) — admin tab detail
- [SUPPLIFY_DEMO_READINESS_AUDIT.md](../audits/SUPPLIFY_DEMO_READINESS_AUDIT.md) — known gaps
- [13-acceptance-criteria.md](./13-acceptance-criteria.md) — pass/fail definitions

_Document version: 2026-06-17._
