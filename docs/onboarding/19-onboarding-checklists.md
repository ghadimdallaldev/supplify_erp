# 19 — Onboarding Checklists

**Audience:** Onboarding specialists, customer success, implementation partners.

**Usage:** Print each section (page break before each checklist heading). Check boxes during prep calls, live sessions, go-live, and hypercare. Cross-reference step detail in persona guides (`03`–`06`).

---

## Checklist 1 — Supplier prep (before live session)

**Owner:** Onboarding specialist · **Duration:** 30–45 min prep

**Customer contacts**

- [ ] Primary owner email matches future Keycloak login
- [ ] Finance contact identified (Accountant role candidate)
- [ ] Warehouse/ops contact identified (Warehouse Manager / Fulfillment Staff)
- [ ] Driver contacts list (if Gold+ and `driver_management`)

**Business data to collect**

- [ ] Legal business name, VAT/tax ID, phone, address
- [ ] Public slug for mini-store (`/supplier/:slug`)
- [ ] Logo file (PNG/SVG, &lt; 2 MB)
- [ ] MOQ, payment terms, return policy text
- [ ] Business hours and holiday blackout dates
- [ ] Warehouse name(s) and ship-from address(es)

**Catalog data**

- [ ] Product CSV or spreadsheet (SKU, name, unit, price, category)
- [ ] Product images (per SKU or ZIP import plan)
- [ ] Contract pricing list (if applicable)

**Plan & access**

- [ ] Target plan confirmed (Silver / Gold / Platinum)
- [ ] Warehouse count within plan limit (`warehouses`, `multi_warehouse`)
- [ ] SKU count within `supplier_products_skus` limit
- [ ] Customer understands one workspace per email rule

**Environment**

- [ ] Demo or production URL shared
- [ ] Stub billing card noted if sandbox (`4242424242424242`)
- [ ] Browser: Chrome/Edge current version

---

## Checklist 2 — Supplier live onboarding session

**Owner:** Onboarding specialist + supplier owner · **Duration:** 90–120 min

**Account & activation**

- [ ] Owner registers at `/login` → Register
- [ ] Completes `/register/complete` with accountType **Supplier**
- [ ] Activates at `/app/activate` (free or paid)
- [ ] `GET /api/billing/status` → not locked

**Profile & policies**

- [ ] Settings → Profile: name, logo, contact, slug saved
- [ ] Settings → Business: MOQ, hours, terms saved
- [ ] Public page `/supplier/{slug}` loads

**Warehouses & fulfillment**

- [ ] Settings → Warehouses: at least one active warehouse
- [ ] Fulfillment settings saved (`PATCH /api/suppliers/me/fulfillment`)
- [ ] `/app/fulfillment` board accessible (plan `fulfillment` / `fulfillment_tools`)

**Catalog**

- [ ] At least 10 live products (or agreed pilot set)
- [ ] Categories and units correct
- [ ] Test product visible to test restaurant account

**Team (if Gold+ `advanced_roles`)**

- [ ] Invites sent: Manager, Fulfillment, Driver (as needed)
- [ ] Driver invitee sees only `/app/driver-deliveries` after accept

**Smoke test**

- [ ] Test restaurant places order
- [ ] Supplier sees order on fulfillment board
- [ ] Supplier can accept/decline or progress status
- [ ] Chat message on order thread works (`chat` feature)

**Wrap-up**

- [ ] Owner knows Settings → Team for future invites
- [ ] Support contact and plan limits documented
- [ ] Next session date for finance/drivers (if deferred)

---

## Checklist 3 — Restaurant prep (before live session)

**Owner:** Onboarding specialist · **Duration:** 30–45 min prep

**Customer contacts**

- [ ] Owner/purchasing manager email for login
- [ ] Receiving manager contact (Receiving Staff role)
- [ ] FOH lead (if using reservations)
- [ ] Accountant contact (if using finance module)

**Operational data**

- [ ] Restaurant legal name, address, phone
- [ ] Logo and branding assets
- [ ] Branch list (names, addresses) if multi-site
- [ ] **GPS delivery coordinates** per site (lat/long — not address-only)
- [ ] List of current suppliers to follow (within plan `suppliers_per_restaurant`)

**Plan & access**

- [ ] Target plan: Silver / Gold / Platinum
- [ ] Branch count within `branches` limit
- [ ] Expected daily order volume vs `orders_per_day`
- [ ] Inventory SKU count vs `restaurant_inventory_skus` if using inventory

**Supplier linkage**

- [ ] Pilot supplier(s) live on platform with catalog
- [ ] Or: plan for restaurant to discover/follow suppliers in session

**Environment**

- [ ] URL and login instructions sent
- [ ] Test user credentials for specialist (if co-browsing)

---

## Checklist 4 — Restaurant live onboarding session

**Owner:** Onboarding specialist + restaurant owner · **Duration:** 90–120 min

**Account & activation**

- [ ] Register → `/register/complete` accountType **Restaurant**
- [ ] Activate at `/app/activate`
- [ ] Sidebar shows Orders, Suppliers, Settings

**Profile & locations**

- [ ] Settings/Onboarding → Profile complete
- [ ] Delivery coordinates saved (`PATCH .../delivery-location`)
- [ ] Branches created if multi-branch entitled (`multi_branch`, Gold+)

**Suppliers & catalog**

- [ ] Follow at least one supplier (`/app/suppliers`)
- [ ] Browse products `/app/products`
- [ ] Confirm contract pricing if applicable

**First order**

- [ ] Build cart and place order
- [ ] Order visible in `/app/orders`
- [ ] Supplier acknowledges (coordinate with supplier or test tenant)

**Receiving (if in scope)**

- [ ] Receiving Staff or Manager walks receive flow
- [ ] Optional quality photo if `receiving_quality` tier allows
- [ ] Optional inventory lot/expiry capture

**Team**

- [ ] Invites: Purchaser, Receiving Staff, Accountant as needed
- [ ] Role sidebar matches least privilege

**Optional modules (plan permitting)**

- [ ] Quick list created (`/app/quick-lists`)
- [ ] Finance: invoice list loads (`finance_invoices` + `INVOICES_VIEW`)
- [ ] Reservations smoke test (`/app/reservations`) if FOH

**Wrap-up**

- [ ] Plan limits explained (orders/day, suppliers, branches)
- [ ] Disputes/receiving escalation path documented

---

## Checklist 5 — Driver onboarding

**Owner:** Supplier admin + driver · **Duration:** 30–45 min

**Prerequisites (supplier admin)**

- [ ] Supplier on Gold+ (`driver_management`) or equivalent entitlement
- [ ] Driver user invited with **Driver** system role
- [ ] User linked to `drivers` row (admin fulfillment setup)
- [ ] At least one order assigned to driver for training

**Driver session**

- [ ] Login at `/login` — only **My Deliveries** in sidebar
- [ ] Board loads: `GET /api/supplier/deliveries/board`
- [ ] Driver understands statuses: assigned → out_for_delivery → delivered
- [ ] Practice **I'm on the way** (`out_for_delivery`)
- [ ] Practice **Delivered** with notes/POD if required
- [ ] Practice **Problem** (failed) and **Reschedule** paths
- [ ] If 2+ stops: **Build my route** demonstrated
- [ ] GPS permission granted on mobile browser/PWA
- [ ] Restaurant confirms ETA/tracking on test order

**Safety & policy**

- [ ] Driver knows not to share login
- [ ] Privacy: restaurant address visible; limited financial data
- [ ] Who to call at supplier dispatch for reassignment

---

## Checklist 6 — Platform admin onboarding

**Owner:** Internal ops / support lead · **Duration:** 2–3 hours

**Access**

- [ ] Admin user exists (`role: ADMIN` in `app_user`)
- [ ] Admin permissions assigned (SUPER_ADMIN or scoped roles)
- [ ] Login → `/app/admin` loads overview

**Portal navigation**

- [ ] Platform portal vs Supplier admin vs Restaurant admin understood
- [ ] Tab gating matches permission map (`ADMIN_TENANTS`, `ADMIN_PLANS`, etc.)

**Core workflows practiced**

- [ ] Search tenants (`/app/admin/tenants`)
- [ ] Filter by subscription status (TRIALING, ACTIVE, SUSPENDED, …)
- [ ] View subscription row and change plan (test tenant)
- [ ] Apply feature flag or limit override on test tenant (Growth/Plans)
- [ ] Impersonate tenant → verify **no** Owner bypass without view-as Owner
- [ ] Stop impersonation
- [ ] Review audit log entry for impersonation/plan change

**Support tools**

- [ ] User search (`ADMIN_SUPPORT`)
- [ ] Password reset procedure documented
- [ ] Health tab: `/api/admin-dashboard/health` or equivalent loads
- [ ] Conversion stats after blocked feature test

**Governance**

- [ ] Impersonation policy acknowledged (customer consent, logging)
- [ ] DPA / data access policy reviewed (`DATA_PROCESSING_ADDENDUM.md`)
- [ ] Escalation path to engineering documented

---

## Checklist 7 — Go-live (production cutover)

**Owner:** Implementation lead + customer exec sponsor · **Duration:** 1 day window

**Pre cutover (T-1)**

- [ ] Production URLs and SSL verified
- [ ] Keycloak production realm configured
- [ ] `REDIS_URL`, database, storage buckets production-ready
- [ ] Billing gateway mode confirmed (stub vs live)
- [ ] Plan/subscription correct on production tenant rows
- [ ] Data migration complete (catalog, users, branches) if applicable
- [ ] Rollback plan documented

**Cutover (T-0)**

- [ ] DNS / bookmark update communicated to users
- [ ] All users complete activation (no `pending_activation`)
- [ ] Owner and backup Owner confirmed
- [ ] Critical roles invited and accepted (purchasing, receiving, fulfillment)
- [ ] First production order placed and fulfilled end-to-end
- [ ] Invoice/payment path verified if finance in scope
- [ ] Monitoring: error rate, 402/403 spikes, health endpoints green

**Post cutover (T+0)**

- [ ] War room channel open for 4 business hours
- [ ] Known issues log started
- [ ] Customer sign-off email template sent

---

## Checklist 8 — First week hypercare

**Owner:** Customer success · **Duration:** 5 business days

**Daily**

- [ ] Review support tickets tagged for new tenant
- [ ] Check admin activity for 402/403 conversion events
- [ ] Confirm order volume within plan limits

**Day 1**

- [ ] Owner can log in; no activation lock
- [ ] At least one order cycle completed
- [ ] Team invites accepted or nudged

**Day 3**

- [ ] Receiving or fulfillment workflow used in production
- [ ] Chat or notifications working if in scope
- [ ] Address any RBAC misconfigurations (wrong role assignments)

**Day 5**

- [ ] Usage vs entitlements review (branches, SKUs, orders/day)
- [ ] Upgrade conversation if consistently near limits
- [ ] Schedule Day 30 check-in
- [ ] Customer satisfaction pulse (email/call)

**Exit criteria**

- [ ] No P1 open issues
- [ ] Primary workflows adopted without manual workarounds
- [ ] Documentation links sent (persona guide + FAQ)

---

## Checklist 9 — First month success review

**Owner:** Account manager + customer sponsor · **Duration:** 60 min meeting

**Adoption metrics**

- [ ] Orders per week trend
- [ ] Active users vs invited users
- [ ] Feature adoption: quick lists, inventory, finance, drivers
- [ ] Support ticket themes categorized

**Plan fit**

- [ ] Limit headroom: `orders_per_day`, `branches`, `warehouses`, SKUs
- [ ] Feature gaps vs next tier documented
- [ ] ROI narrative draft (time saved, error reduction)

**RBAC hygiene**

- [ ] No shared Owner credentials
- [ ] Viewer/Accountant roles used appropriately
- [ ] Custom roles documented if `advanced_roles`

**Roadmap**

- [ ] Phase 2 modules agreed (API, multi-branch expansion, AI reorder)
- [ ] Training gaps scheduled
- [ ] Reference/customer story consent if applicable

---

## Checklist 10 — Technical deployment (new environment)

**Owner:** DevOps / platform engineer · **Duration:** 4–8 hours

**Infrastructure**

- [ ] PostgreSQL provisioned; migrations applied (`pnpm run migrate` or CI)
- [ ] Redis provisioned (`REDIS_URL` internal URL in production)
- [ ] Object storage for uploads configured
- [ ] Keycloak realm + clients (`web`, `api`) with correct redirect URIs
- [ ] Environment variables set per `docs/operations/railway.md` or host equivalent

**API (`apps/api`)**

- [ ] `OAUTH_CALLBACK_BASE_URL` matches public API origin
- [ ] `WEB_ORIGIN` matches SPA origin
- [ ] `COOKIE_SECURE`, `COOKIE_DOMAIN`, `COOKIE_SAME_SITE` correct
- [ ] `IMPERSONATION_SECRET` set (production strength)
- [ ] `BILLING_GATEWAY` configured
- [ ] `/health` and `/ready` return 200

**Web (`apps/web`)**

- [ ] Build with correct `VITE_API_URL`
- [ ] PWA assets served over HTTPS
- [ ] CSRF flow verified against API

**Auth smoke**

- [ ] Register → callback → `/auth/me` returns user
- [ ] Refresh token rotation works
- [ ] Logout clears cookies

**Seeds (non-prod only)**

- [ ] `seed:demo-users` if demo environment
- [ ] Plan catalog rows exist (`subscription_plan`)

---

## Checklist 11 — Production validation (post-deploy)

**Owner:** QA / engineer · **Duration:** 2–4 hours

**Automated**

- [ ] API test suite green (`apps/api` CI)
- [ ] Web typecheck/build green
- [ ] Route inventory spot-check against `docs/audits/route-inventory.json`

**Auth & security**

- [ ] OIDC login/logout full cycle
- [ ] CSRF rejected without token (401/403)
- [ ] Staff portal allowlist enforced
- [ ] Impersonation audit row written

**Monetization**

- [ ] Free tenant: entitlements show Gold features + Free limits
- [ ] `requireFeature` returns 403 on disabled feature (Silver `smart_reorder` test)
- [ ] `requireWithinLimit` returns 403 at cap
- [ ] Expired Free Trial: write 402, read mostly OK

**RBAC**

- [ ] Purchaser cannot `RECEIVING_MANAGE` (403)
- [ ] Driver cannot access `/api/suppliers/me` catalog mutations
- [ ] Viewer cannot POST orders

**Critical paths**

- [ ] Restaurant place order → supplier fulfill → driver deliver → restaurant receive
- [ ] Invoice create/view (finance feature + permissions)
- [ ] Admin tenant search + read-only impersonation browse

**Performance**

- [ ] Entitlements cache hit acceptable (&lt; 500 ms p95 on warm)
- [ ] Permission cache invalidates on role change within TTL

---

## Checklist 12 — Demo environment prep (sales / POC)

**Owner:** Sales engineer · **Duration:** 1–2 hours

**Tenant setup**

- [ ] Demo supplier tenant seeded with catalog (50+ SKUs ideal)
- [ ] Demo restaurant tenant follows demo supplier
- [ ] Both tenants activated (not `pending_activation`)
- [ ] Plans set to Gold or Platinum for full demo story (or explain Free Trial parity)

**Personas**

- [ ] `owner@` supplier and restaurant credentials documented
- [ ] `driver@` linked driver with assigned delivery
- [ ] `viewer@` read-only optional
- [ ] Admin `admin@` for impersonation demo

**Scenario data**

- [ ] 3+ orders in various statuses (placed, in fulfillment, delivered)
- [ ] One open dispute or amendment for narrative
- [ ] One quick list with scheduled order if showing automation
- [ ] Receiving session with quality photo example

**Demo script assets**

- [ ] Slug URLs bookmarked: `/supplier/{slug}`, `/app/orders`, `/app/fulfillment`
- [ ] Upgrade modal trigger prepared (e.g. hit branch limit on Silver test user)
- [ ] FAQ one-pager link: `18-frequently-asked-questions.md`

**Reset procedure**

- [ ] Document how to re-seed or reset demo DB
- [ ] No real PII in demo tenants
- [ ] Billing stub only — no live cards

---

## Related docs

- [03-supplier-onboarding.md](./03-supplier-onboarding.md)
- [04-restaurant-onboarding.md](./04-restaurant-onboarding.md)
- [05-driver-onboarding.md](./05-driver-onboarding.md)
- [06-admin-onboarding.md](./06-admin-onboarding.md)
- [07-technical-architecture.md](./07-technical-architecture.md)
- [18-frequently-asked-questions.md](./18-frequently-asked-questions.md)
