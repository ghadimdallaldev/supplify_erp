# Reorder, Branding, Deals, Warehouse, Support & Featured Placement Audit

**Date:** 2026-06-11

**Status:** Implemented (Phases 0–9 complete)

## 1. Summary

Product-readiness audit and phased implementation for eight features: restaurant reorder assistance, supplier customer follow-up, white labeling, new-deal banner, warehouses/dispatch, admin support chat, paid featured supplier placement, and restaurant invoice export.

Approach: extend existing services and routes; no app rewrite; preserve pricing, billing, RBAC, checkout, and deal discount logic except documented bugs.

## 2. What Already Existed

| Area | Status | Key files |

|------|--------|-----------|

| Reorder cadence | DONE (partial) | `reorder-cadence.service.js`, migration `0135` |

| Smart reorder suggestions | DONE (API) | `restaurant-inventory.routes.js` |

| Supplier reorder intelligence | DONE | `supplier-reorder-intelligence.service.js` |

| Inventory expiry | DONE | `inventory-expiry.service.js`, migration `0133` |

| Quick lists | DONE | `quick-lists.routes.js`, `QuickListsPage.tsx` |

| Custom branding (logo) | PARTIAL | `LogoUpload.tsx`, logo routes |

| Deals / boosts | DONE | `deal-promotions.service.js` |

| Warehouses / dispatch | DONE (backend) | `warehouses.routes.js`, `warehouseRouting.js` |

| B2B chat | DONE | `chat.routes.js`, `ChatPage.tsx` |

| Invoice PDF | DONE | `GET /api/invoices/:id/pdf` |

## 3. What Was Partial

- Restaurant reorder: dashboard widgets only; no unified panel; cron not plan-gated

- Supplier follow-up: two parallel models; copy-only reminder draft

- Branding: logo only; no runtime CSS variables for colors

- Deal banner: notifications exist; no dismissible layout banner; notify fan-out bug

- Warehouses: missing multi-warehouse toggle and routing rules UI

- Support chat: admin routes schema-mismatched; no tenant/admin UI

- Featured supplier: deal boosts only; no supplier-list placement

- Invoice export: Export button called `refetch()` only

## 4. What Was Missing

- `restaurant-reorder-assistance.service.js` facade

- `supplier-reorder-assistance.service.js` facade

- `reorder_suggestion_suppression` table

- Brand color columns and `branding.service.js`

- New-deals banner API and `NewDealsBanner` component

- `banner_dismiss` interaction type

- Support chat schema fixes and UI

- `supplier_featured_placements` table and service

- Restaurant bulk CSV export endpoint

## 5. What Was Implemented

| Phase | Feature | Deliverables |

|-------|---------|--------------|

| 1 | Restaurant reorder assistance | Unified `ReorderAssistancePanel`, suppression API, plan-gated cadence cron, settings toggle |

| 2 | Supplier follow-up | `SupplierFollowUpPanel`, reminder draft → optional chat URL, deduped notifications |

| 3 | White labeling | Brand colors on tenant, `TenantBrandingProvider`, settings UI, CSS variables |

| 4 | New deal banner | Fixed `notifyDealApproved` scope, dismissible `NewDealsBanner`, `banner_dismiss` interaction |

| 5 | Warehouses UI | Multi-warehouse toggle, routing rules, pick-list warehouse filter |

| 6 | Support chat | Schema migration, support start/list routes, tenant + admin UI, ADMIN WebSocket/REST send |

| 7 | Featured placement | Placements table, purchase flow, supplier settings UI, restaurant sort + badge, admin list |

| 8 | Invoice export | Restaurant CSV endpoint, working Export button on `InvoicesPage` |

## 6. Files Changed

### Backend (API)

| File | Change |

|------|--------|

| `db/migrations/0147_reorder_assistance_suppressions.sql` | Snooze / not-needed suppressions |

| `db/migrations/0148_tenant_branding_columns.sql` | Brand colors + display name |

| `db/migrations/0149_support_chat_schema.sql` | Support/admin conversation schema |

| `db/migrations/0150_supplier_featured_placements.sql` | Paid featured supplier placement |

| `db/migrations/0151_deal_banner_dismiss.sql` | `banner_dismiss` interaction type |

| `services/restaurant-reorder-assistance.service.js` | Restaurant reorder facade |

| `services/supplier-reorder-assistance.service.js` | Supplier follow-up facade |

| `services/branding.service.js` | Brand color validation + persistence |

| `services/deal-banner.service.js` | New-deals banner query |

| `services/support-chat.service.js` | Support conversation lifecycle |

| `services/featured-supplier-placement.service.js` | Featured placement purchase/list |

| `services/notification.service.js` | Fixed deal-approved fan-out |

| `services/reorder-cadence.service.js` | Plan gate for `smart_reorder` |

| `routes/restaurant-inventory.routes.js` | Reorder assistance endpoints |

| `routes/supplier-ops.routes.js` | Supplier reorder assistance + plan gate |

| `routes/restaurants.routes.js` / `suppliers.routes.js` | Branding + featured placement routes |

| `routes/promotions.routes.js` | New-deals banner + dismiss |

| `routes/chat.routes.js` | Support routes, B2B/support split, ADMIN messaging |

| `routes/restaurant-finance.routes.js` | Invoice CSV export |

| `services/chatSocket.service.js` | ADMIN sender persistence |

| `lib/socket.js` | `senderType` on socket events |

### Frontend (Web)

| File | Change |

|------|--------|

| `components/inventory/ReorderAssistancePanel.tsx` | Restaurant reorder UI |

| `components/supplier/SupplierFollowUpPanel.tsx` | Supplier follow-up UI |

| `components/settings/BrandingSettingsSection.tsx` | Brand color settings |

| `components/TenantBrandingProvider.tsx` | Runtime CSS variables |

| `components/deals/NewDealsBanner.tsx` | Dismissible deal banner |

| `components/settings/WarehouseFulfillmentSettings.tsx` | Warehouse + routing UI |

| `components/fulfillment/FulfillmentPickListsTab.tsx` | Warehouse filter |

| `components/support/SupportContactCard.tsx` | Tenant support entry |

| `components/admin/AdminSupportChatPanel.tsx` | Admin support list |

| `components/supplier/FeaturedPlacementPanel.tsx` | Supplier purchase UI |

| `components/admin/AdminFeaturedPlacementsPanel.tsx` | Admin active placements |

| `pages/RestaurantInventoryPage.tsx` | Mount reorder panel |

| `pages/SupplierCommandCenterPage.tsx` | Mount follow-up panel |

| `pages/SupplierSettingsPage.tsx` | Branding, warehouses, featured, support |

| `pages/RestaurantOnboardingPage.tsx` | Branding + cadence notification |

| `pages/SuppliersPage.tsx` | Featured badge + sort |

| `pages/InvoicesPage.tsx` | CSV export download |

| `components/Layout.tsx` | Branding provider + deal banner |

| `services/api.ts` | RTK hooks for all new endpoints |

### Tests

| File | Coverage |

|------|----------|

| `restaurant-reorder-assistance.service.test.js` | Dedup, suppression merge |

| `supplier-reorder-assistance.service.test.js` | Missed pattern + churn risk |

| `branding.service.test.js` | Hex validation, defaults |

| `featured-supplier-placement.service.test.js` | Package validation smoke |

## 7. Migrations Added

| Migration | Purpose |

|-----------|---------|

| `0147_reorder_assistance_suppressions.sql` | Snooze / not-needed suppressions |

| `0148_tenant_branding_columns.sql` | Brand colors + display name |

| `0149_support_chat_schema.sql` | Admin/support conversation schema |

| `0150_supplier_featured_placements.sql` | Paid featured supplier placement |

| `0151_deal_banner_dismiss.sql` | `banner_dismiss` interaction type |

## 8. APIs Added/Updated

| Method | Path | Purpose |

|--------|------|---------|

| GET | `/api/restaurant-inventory/reorder-assistance` | Restaurant reorder suggestions |

| POST | `/api/restaurant-inventory/reorder-assistance/suppress` | Snooze / dismiss suggestion |

| GET | `/api/supplier-ops/reorder-assistance` | Supplier follow-up suggestions |

| POST | `/api/supplier-ops/reorder-reminder-draft` | Reminder draft (+ optional chat URL) |

| GET/PATCH | `/api/restaurants/me/branding`, `/api/suppliers/me/branding` | Tenant branding |

| GET | `/api/promotions/new-deals-banner` | Active deals for banner |

| POST | `/api/promotions/:id/dismiss-banner` | Dismiss deal banner |

| POST | `/api/chat/support/start` | Start support conversation |

| GET | `/api/chat/support/conversations` | Tenant support threads |

| GET | `/api/chat/admin/conversations` | Admin support inbox |

| POST | `/api/chat/admin/start-conversation` | Admin initiates support |

| GET | `/api/suppliers/featured-placement/packages` | Featured packages |

| GET | `/api/suppliers/featured-placement/mine` | Supplier placement history |

| POST | `/api/suppliers/featured-placement/purchase` | Purchase featured placement |

| GET | `/api/suppliers/featured-placement/admin/active` | Admin active placements |

| GET | `/api/restaurant-finance/invoices/export.csv` | Restaurant invoice CSV export |

**Updated behavior:** `GET /api/suppliers` — featured suppliers first, `is_featured` in response; `GET /api/chat/conversations` — excludes admin/support threads from B2B list.

## 9. Plan/RBAC Behavior

- Restaurant reorder: `smart_reorder`, `inventory_management`, `quick_lists`

- Supplier follow-up: `smart_reorder` (aligned with restaurant)

- Branding: `custom_branding`

- Deal banner: `supplier_deals`

- Warehouses: `warehouses`, `multi_warehouse`, `fulfillment`

- Support chat: `chat` for tenants; ADMIN role for support agents (feature gate bypass)

- Featured placement: supplier `SETTINGS_EDIT`; payment waived in non-production

- Invoice export: `INVOICES_VIEW`, `finance_invoices`

- Custom domains: **not wired** (Platinum marketing only)

## 10. Performance Considerations

- Reorder assistance: capped queries, deduplication, indexed suppressions

- Deal banner: RTK staleTime 5 min; indexed dismiss interactions

- Featured suppliers: indexed active placements; EXISTS subquery on supplier list (no N+1)

- Branding: loaded once per session via `/me` bootstrap + `TenantBrandingProvider`

- Support inbox: admin list limited to 100 rows; separate from B2B conversation query

- Invoice CSV: reuses list filters; streamed response for large exports

## 11. Tests Added/Run

**Executed 2026-06-11:**

```text

apps/web:  npm run typecheck          — PASS

apps/api:  vitest run (4 service files) — 9/9 PASS

  - restaurant-reorder-assistance.service.test.js (2)

  - supplier-reorder-assistance.service.test.js (2)

  - branding.service.test.js (4)

  - featured-supplier-placement.service.test.js (1)

```

Route-level tests for deal-banner, chat, and restaurant-finance export remain recommended follow-ups; core service logic is covered.

## 12. Manual QA Checklist

- [ ] Restaurant sees reorder suggestions for low stock / frequent products

- [ ] Restaurant can add suggested item to cart

- [ ] Supplier sees missed-order / customer follow-up suggestions

- [ ] White labeling changes logo/colors for eligible tenant

- [ ] Branding fallback works

- [ ] Restaurant sees new deal banner from eligible supplier

- [ ] Banner dismiss works

- [ ] Supplier can create warehouse

- [ ] Supplier can dispatch order from warehouse

- [ ] Tenant can start support chat

- [ ] Admin/support can respond

- [ ] Supplier can request/pay for featured placement

- [ ] Featured supplier appears at top of restaurant supplier list

- [ ] Restaurant invoice export downloads correctly

## 13. Risks / Follow-ups

- Deal feed still requires boost; banner uses separate query (documented)

- Gold vs Platinum `smart_reorder` tier strings remain display-only

- UTC weekday cadence (no per-restaurant timezone)

- Real payment for featured placement follows mock/waive pattern until billing wired

- Custom domains out of scope

- **Mobile parity:** Web is the full cockpit; mobile v1 does not yet include reorder assistance panel, branding settings, featured placement purchase, or support chat UI — see `docs/mobile/MOBILE_FEATURE_PARITY.md`

- Support chat in main `ChatPage` may need explicit `isSupport` styling variant for full UX polish

- Add route integration tests for CSV export and support conversation isolation
