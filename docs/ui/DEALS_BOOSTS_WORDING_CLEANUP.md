# Deals & Boosts UI Wording Cleanup

## 1. Summary

Presentation-only pass to clarify Supplify’s two-layer deals system for suppliers, restaurants, and admins:

- **Deals** — supplier offers stored in `promotions` (discounts, targeting, optional coupon, CTA).
- **Boosts** — paid sponsored visibility stored in `deal_promotions` (pricing from `promotion_pricing_config`).
- **Coupons** — optional codes on a deal (`promotions.coupon_code`), not a separate product.
- **Redemptions** — checkout usage tracked via `promotion_usages` / `usage_count`.

No business logic, database, API fields, migrations, checkout, billing, or plan enforcement was changed.

## 2. What changed

### New files

- [`apps/web/src/lib/dealDisplayLabels.ts`](../apps/web/src/lib/dealDisplayLabels.ts) — central user-facing label maps, helper text, empty states.
- [`apps/web/src/lib/dealDisplayLabels.test.ts`](../apps/web/src/lib/dealDisplayLabels.test.ts) — label/helper/empty-state tests.

### Plan & limit display

- [`apps/web/src/lib/adminLimitLabels.ts`](../apps/web/src/lib/adminLimitLabels.ts) — `promotions` → **Active deals**
- [`apps/web/src/lib/planComparison.ts`](../apps/web/src/lib/planComparison.ts) — limit/feature labels for deals and redemptions
- [`apps/web/src/lib/planLimits.ts`](../apps/web/src/lib/planLimits.ts) — gate message uses “active deal”
- [`apps/web/src/lib/upgradeCopy.ts`](../apps/web/src/lib/upgradeCopy.ts) — upgrade copy for active deals

### Supplier UI

- [`apps/web/src/components/Sidebar.tsx`](../apps/web/src/components/Sidebar.tsx) — nav **Deals**
- [`apps/web/src/components/Header.tsx`](../apps/web/src/components/Header.tsx) — page title **Deals**
- [`apps/web/src/lib/workspaceRoleProfile.ts`](../apps/web/src/lib/workspaceRoleProfile.ts) — persona copy
- [`apps/web/src/pages/promotions/PromotionsPage.tsx`](../apps/web/src/pages/promotions/PromotionsPage.tsx) — create form helpers, empty state, badges
- [`apps/web/src/components/promotions/DealsPerformanceSummary.tsx`](../apps/web/src/components/promotions/DealsPerformanceSummary.tsx)
- [`apps/web/src/components/deals/DealAnalyticsDialog.tsx`](../apps/web/src/components/deals/DealAnalyticsDialog.tsx)
- [`apps/web/src/components/deals/PromoteDealDialog.tsx`](../apps/web/src/components/deals/PromoteDealDialog.tsx)
- [`apps/web/src/components/deals/DealBoostPackagePicker.tsx`](../apps/web/src/components/deals/DealBoostPackagePicker.tsx)
- [`apps/web/src/lib/permissionLabels.js`](../apps/web/src/lib/permissionLabels.js) — RBAC **Deals** domain

### Restaurant UI

- [`apps/web/src/pages/deals/DealsPage.tsx`](../apps/web/src/pages/deals/DealsPage.tsx)
- [`apps/web/src/components/deals/DealCard.tsx`](../apps/web/src/components/deals/DealCard.tsx)
- [`apps/web/src/pages/CartPage.tsx`](../apps/web/src/pages/CartPage.tsx)
- [`apps/web/src/pages/OrderDetailPage.tsx`](../apps/web/src/pages/OrderDetailPage.tsx)

### Admin UI

- [`apps/web/src/components/admin/AdminDealsPanel.tsx`](../apps/web/src/components/admin/AdminDealsPanel.tsx)
- [`apps/web/src/pages/AdminDashboardPage.tsx`](../apps/web/src/pages/AdminDashboardPage.tsx)

### Tests updated

- [`apps/web/src/lib/planComparison.test.ts`](../apps/web/src/lib/planComparison.test.ts)

### Legal pack + re-acceptance (June 2026 follow-up)

Presentation and acceptance flow only — no discount, checkout, or boost billing logic changed.

- [`apps/web/src/lib/legalDocuments.ts`](../apps/web/src/lib/legalDocuments.ts) — pack version `2026-06-09`, deals/boost description
- [`apps/api/src/lib/legal-documents.js`](../apps/api/src/lib/legal-documents.js) — matching pack version (must stay in sync)
- [`apps/web/src/pages/LegalDocumentPage.tsx`](../apps/web/src/pages/LegalDocumentPage.tsx) — **Billing & deals** category
- [`apps/web/src/pages/LegalReacceptPage.tsx`](../apps/web/src/pages/LegalReacceptPage.tsx) — `/legal/reaccept` gate page
- [`apps/web/src/lib/legalReacceptanceGate.ts`](../apps/web/src/lib/legalReacceptanceGate.ts) — redirect helper
- [`apps/web/src/components/AuthGuard.tsx`](../apps/web/src/components/AuthGuard.tsx), [`StaffPortalGuard.tsx`](../apps/web/src/components/StaffPortalGuard.tsx) — redirect when `legalStatus.needsReacceptance`
- [`apps/api/src/lib/legal-acceptance.js`](../apps/api/src/lib/legal-acceptance.js) — status resolution + `login_refresh` recording
- [`apps/api/src/routes/auth.routes.js`](../apps/api/src/routes/auth.routes.js) — `GET /auth/me` (`legalStatus`), `POST /auth/legal-acceptance`
- Static legal markdown under [`apps/web/static/legal/`](../../apps/web/static/legal/): `TERMS_AND_CONDITIONS.md`, `DEALS_BOOST_TERMS.md`, `ACCEPTABLE_USE_POLICY.md`, `SUBSCRIPTION_ADDON_TERMS.md`, `SUPPLIER_AGREEMENT.md`, `PRIVACY_POLICY.md`, `LEGAL_REVIEW_NOTES.md`

See [LEGAL_PACK_REACCEPTANCE.md](./LEGAL_PACK_REACCEPTANCE.md) and [../releases/2026-06-09-pre-deploy-checklist.md](../releases/2026-06-09-pre-deploy-checklist.md).

## 3. What did not change

- Database tables, columns, migrations
- API routes, request/response field names (`promotionId`, `coupon_code`, etc.)
- RTK Query hook names (`useGetPromotionsQuery`, etc.)
- Discount calculations, `validateCouponForOrder`, `applyBestPromotionToOrder`
- Boost billing and `promotion_pricing_config` logic
- Plan feature/limit keys and enforcement (`promotions`, `deal_redemptions_per_day`, `supplier_deals`)
- Route URLs (`/app/promotions`, `/app/deals`)
- File or component names (`PromotionsPage`, etc.)

## 4. Final user-facing terminology

| Technical / internal          | User-facing label   |
| ----------------------------- | ------------------- |
| `promotions`                  | Deals               |
| `promotion`                   | Deal                |
| supplier promotions           | Supplier deals      |
| `deal_promotions`             | Boosts              |
| paid promotion                | Paid boost          |
| featured/sponsored visibility | Sponsored placement |
| promotion limit               | Active deals limit  |
| promotion usages              | Deal redemptions    |
| `coupon_code`                 | Coupon code         |

## 5. Supplier UI wording

- Sidebar & header: **Deals** (route stays `/app/promotions`)
- Page title: **Deals**; list: **Active deals** / **Your deals**
- CTA: **Create deal**
- Form sections: **Deal type**, **Deal targeting**, **Deal schedule**, **Boost this deal**, **Boost package**
- Deal type helpers (percentage, fixed, buy X get Y, free shipping, visibility-only)
- CTA helpers (order now, use coupon, message supplier, view products)
- Coupon helper: codes are attached to the deal, not standalone vouchers
- Empty state: **No deals yet** + **Create deal**

## 6. Restaurant UI wording

- Page: **Available deals**; subtitle references **supplier deals** and **sponsored placement**
- Deal card CTA: **Order with deal**, **Use coupon**
- Coupon toast: **Coupon copied. We'll apply it at checkout when eligible.**
- Coupon helper: **This code is linked to this supplier deal.**
- Badge: **Sponsored**
- Cart: **Est. deal savings**; coupon URL hint when `?coupon=` present
- Order detail line: **Deal discount**
- Empty state: **No active deals right now**

## 7. Admin UI wording

- Tab & panel: **Deals & Boosts**
- Table: **All deals**
- Insights: **Deal redemptions**, **Boost revenue**, **Discount amount**, **Coupon uses** (where shown)
- Boost config: **Boost packages**, sponsored placement copy
- Activity filter: **Deal activity**
- Empty state: **No deals found** — supplier deals and sponsored boosts

## 8. Sidebar / menu wording

| Tenant     | Label          | Route               |
| ---------- | -------------- | ------------------- |
| Supplier   | Deals          | `/app/promotions`   |
| Restaurant | Deals          | `/app/deals`        |
| Admin      | Deals & Boosts | Admin dashboard tab |

## 9. Plan / tier display wording

| Key                                   | Display label            |
| ------------------------------------- | ------------------------ |
| Feature `promotions` (supplier)       | Deals                    |
| Limit `promotions`                    | Active deals             |
| Feature `supplier_deals` (restaurant) | Supplier deals           |
| Limit `deal_redemptions_per_day`      | Deal redemptions per day |

Plan keys and enforcement unchanged.

## 10. Legal re-acceptance (pack `2026-06-09`)

When deployed, users whose stored acceptances predate `2026-06-09` are redirected to **`/legal/reaccept`** before `/app/*` or `/staff/dashboard`.

- [ ] User on old pack → login → lands on `/legal/reaccept` (not dashboard)
- [ ] Accept all required documents → redirected to app normally
- [ ] `GET /auth/me` → `legalStatus.needsReacceptance: false` after accept
- [ ] `PENDING` registration user → `/register/complete`, not re-accept
- [ ] Web + API `LEGAL_PACK_VERSION` both `2026-06-09`

Full QA: [LEGAL_PACK_REACCEPTANCE.md](./LEGAL_PACK_REACCEPTANCE.md) §7.

## 11. Manual QA checklist (UI wording)

- [ ] Supplier sidebar shows **Deals** instead of confusing “Promotions”
- [ ] Supplier can still open the same page/route (`/app/promotions`)
- [ ] Supplier create/edit deal form still works
- [ ] CTA type helper copy is clear
- [ ] Coupon code helper copy is clear
- [ ] Boost wording is clearly separate from deal wording
- [ ] Restaurant sidebar/page shows **Deals**
- [ ] Restaurant deal cards still work
- [ ] Coupon CTA still copies/navigates exactly as before
- [ ] Admin area shows **Deals & Boosts**
- [ ] Plan limit `promotions` displays as **Active deals**
- [ ] Plan limit `deal_redemptions_per_day` displays as **Deal redemptions per day**
- [ ] No backend discount logic changed
- [ ] No migration added for wording pass (plan audit migrations `0144`/`0145` are separate — see release checklist)
- [ ] Existing tests still pass (`dealDisplayLabels`, `legalReacceptanceGate`, `legal-acceptance`)

## 12. Risks / follow-ups

- **Legal pack version** — bumped to `2026-06-09`; existing users are prompted to re-accept on login via `/legal/reaccept` when their stored acceptances predate the current pack.
- **Role labels** — system role name “Promotions Manager” unchanged (internal RBAC name).
- **API cache tags** — RTK tag `Promotions` unchanged (internal).
- **Admin boost packages empty state** — when no pricing rows exist, admins may need ops runbook to seed packages (wording no longer references migration IDs in UI).
