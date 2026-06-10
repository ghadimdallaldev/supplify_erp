# Supplify UI/UX Modernization Plan

> **This is a planning document only. No code has been changed.**
> Execute phases by telling Claude: "Execute Phase N of the UI Modernization Plan."

**Goal:** Transform Supplify from feeling like a generic CRUD app into a premium, trustworthy operations command center that restaurants and suppliers use with confidence every day.

**Design north star:** Linear / Stripe / Vercel level polish — dense, fast, clear, no wasted space, no fake data, no decorative noise.

---

## 1. Executive Summary

Supplify has a strong functional foundation: good routing, solid data fetching, real-time entitlements, a capable admin portal, and meaningful operational features across supplier and restaurant roles.

However, the UI currently sits in an inconsistent "middle state":

- Several shared components exist (`PageHeader`, `EmptyState`, `StatusBadge`, `AdminKpiCard`) but are not used uniformly.
- Some pages were built early and still use old patterns (raw `Card/CardContent/CardHeader`, giant loading spinners, manual `h1` tags).
- The main dashboard has cosmetic-only controls (a period picker that does nothing), synthetic sparkline data, and a duplicated `StatusChip` component.
- The supplier `InventoryPage` is one of the most visually dated pages in the codebase.
- Banners (limit warnings, feature locks, tier notices) stack awkwardly in the Layout shell with inline styles.
- `FeatureLockedCard` uses the old Shadcn `CardHeader/CardContent` pattern and amber styling that is inconsistent with the rest of the lock/upgrade system.
- No consistent skeleton loading system outside the admin portal.

The result: the app works, but it does not feel premium. It doesn't consistently signal trust to a new user or a demo audience.

**Biggest opportunity:** Apply the existing good patterns (`PageHeader`, `StatusBadge`, `EmptyState`, `AdminKpiCard`) to the pages that haven't been updated yet, fix the three most visually weak pages (Inventory, promotions/deals, cart), and standardize the loading/error/empty state system.

---

## 2. UI Modernization Principles

1. **Use what exists.** Extend shared components before creating new ones. `PageHeader`, `StatusBadge`, `EmptyState`, and `AdminKpiCard` are already well-built.
2. **No fake metrics.** Remove synthetic sparkline data. Either show real data or nothing.
3. **No UI-only controls.** Either wire the period picker or remove it. Silent interactions erode trust.
4. **Skeletons everywhere, spinners nowhere.** Full-screen `animate-spin` circles are 2015 UX. Skeleton-based loading is already used in good pages — extend it to all.
5. **One header system.** All content pages use `PageHeader`. Admin pages use `AdminPageHeader`. No ad-hoc `h1` tags.
6. **Status badges are canonical.** Use `StatusBadge` everywhere. Remove any inline `StatusChip` or `Badge` for status values.
7. **Intentional color.** Purple = brand/primary. Green = healthy/complete. Amber = warning/near-limit. Red = danger/error. Gray = metadata. Blue = informational. Don't overuse purple.
8. **Dense but breathable.** B2B ops users scan tables, not read prose. Compact tables, clear primary actions, consistent padding.
9. **Lock UX is upgrade UX.** Locked features should feel like an opportunity (clear value prop + upgrade path) not a dead-end wall.
10. **Responsive as a first-class concern.** Mobile-first for restaurant staff, laptop-first for admin and supplier ops.

---

## 3. Current Strengths

These are well-built and should be **preserved without changes**:

- `StatusBadge` (`apps/web/src/components/ui/status-badge.tsx`) — clean tone system with dot + label
- `EmptyState` (`apps/web/src/components/ui/empty-state.tsx`) — branded, clean, with icon ring
- `PageHeader` (`apps/web/src/components/ui/page-header.tsx`) — responsive, clean title + description + actions
- `AdminKpiCard` (`apps/web/src/components/admin/AdminKpiCard.tsx`) — well-structured with tone system
- `AdminPageHeader` (`apps/web/src/components/admin/AdminPageHeader.tsx`) — matches Admin portal needs
- `AdminPortalNav` — full-width admin portal navigation with tab support
- `BillingOverdueBanner` — focused, single-purpose
- `ImpersonationBanner` — clear, high-contrast impersonation indicator
- `OfflineBanner` — clean offline awareness
- `LimitExceededBanner` — clear at-limit messaging
- The admin dashboard tab system (lazy loading, `AdminTabMount`, `AdminTabLoading`) — solid pattern
- Layout's entitlements + WebSocket refresh system — do not touch
- The cart's `RequirePermission` + `PermissionGate` pattern
- `BranchSwitcher` — workspace context awareness
- `FeatureLockedCard` (functionally) — logic is correct, needs cosmetic polish only

---

## 4. Current Weaknesses

### 4.1 Loading states — inconsistent

| Page                           | Current state                              | Target         |
| ------------------------------ | ------------------------------------------ | -------------- |
| `InventoryPage.tsx` (supplier) | Full-screen `h-32 w-32` spinning circle    | Skeleton tiles |
| `DashboardPage.tsx`            | ✅ Has skeletons                           | Keep           |
| `OrdersPage.tsx`               | Shadcn `Skeleton` but inconsistently sized | Standardize    |
| `ReceivingPage.tsx`            | Skeleton exists                            | Good           |
| `RestaurantInventoryPage.tsx`  | Skeleton exists                            | Good           |

### 4.2 Page headers — inconsistent

- `InventoryPage.tsx` line 97: Uses manual `<h1 className="text-[21px] font-black">` with `mt-2` description — bypasses `PageHeader`
- Several pages inside `RequirePermission` wrappers place their own headers outside the wrapper

### 4.3 Fake/cosmetic-only UI

- `DashboardPage.tsx` `syntheticRamp()` (lines 414–421): sparklines use random synthetic data when there are fewer than 4 real orders. This is misleading and untrustworthy.
- `DashboardPage.tsx` period selector (7d / 30d / 90d): purely cosmetic, has no effect on the actual data shown.

### 4.4 Duplicated components

- `DashboardPage.tsx` defines `StatusChip` (lines 98–125) that duplicates `StatusBadge`. Should use the shared component.
- `DashboardPage.tsx` defines `KpiCard` and `SectionCard` inline — not reused anywhere.

### 4.5 Pattern inconsistency

- `InventoryPage.tsx`: Uses `Card, CardContent, CardHeader, CardTitle` Shadcn raw components (old pattern). Newer pages use plain `div` + `var(--surface)` / `var(--app-border)` tokens.
- `FeatureLockedCard.tsx`: Uses `CardHeader/CardContent/CardDescription` pattern. Should use a lighter lockout style consistent with the upgrade modal and `LockedFeatureCard` direction.
- `PromotionsPage.tsx` (supplier deals at `/promotions/`): Internally still references `promotions`, `promotionsCopy`, `getSupplierPromotionGate`, `promotionsEnabled`. The display labels are handled via `dealDisplayLabels.ts` but the internal naming is still mixed.

### 4.6 Navigation inconsistencies

- Supplier sidebar links to `/app/promotions` for deals (via `Deals` nav item that conditionally shows)
- Command center (`/app/command-center`) has a quick action for `'Deals'` pointing to `/app/promotions` — should be `/app/deals` or `/app/promotions` consistently
- `OPS_QUICK_ACTIONS` in `SupplierCommandCenterPage.tsx` line 45: `href: '/app/promotions'` for deals

### 4.7 Layout banners stacking

- `Layout.tsx` can show up to 4–5 stacked banners simultaneously (billing overdue + externally disabled features + plan tier disabled + at-limit per item + near-limit). This is visually chaotic and confusing.

### 4.8 Wording cleanup needed

- Restaurant nav item: `'Deals'` → correct
- Supplier nav item: `supplierDealsEnabled &&` → shows `'Deals'` → correct (but href is `/app/promotions` in command center)
- `PromotionsPage.tsx` internal state labels use `promotions` terminology in log/debug contexts
- `getSupplierPromotionGate`, `promotionGate` in `PromotionsPage.tsx` are internal — fine as-is

---

## 5. Page-by-Page Audit

### 5.1 Dashboard (Shared — Supplier + Restaurant)

**File:** `apps/web/src/pages/DashboardPage.tsx`

**Current state:** Good structure. 4 KPI cards, 3-column content row, optional calendar. Has loading skeletons and error state.

**Problems:**

- `StatusChip` component is a duplicate of `StatusBadge` (lines 98–125)
- `syntheticRamp()` generates fake sparkline bars when real data is sparse
- Period picker (7d/30d/90d) at line 674 is cosmetic-only
- `KpiCard` and `SectionCard` are defined inline — not reused anywhere else

**Recommended improvements:**

- Replace `StatusChip` with `StatusBadge` from shared component
- Remove `syntheticRamp` entirely. If fewer than 3 real data points exist, show no sparkline
- Either wire the period picker to filter real data or remove it
- Keep `KpiCard` and `SectionCard` inline for now (they serve only this page)

**Priority:** P1  
**Risk:** Low (copy changes, remove fake data)  
**Files:** `apps/web/src/pages/DashboardPage.tsx`

---

### 5.2 Supplier Inventory Page

**File:** `apps/web/src/pages/InventoryPage.tsx`

**Current state:** Functional but visually dated. One of the most inconsistent pages.

**Problems:**

- Loading state is a full-screen `h-32 w-32 animate-spin` circle (lines 77–81) — old ERP pattern
- No `PageHeader` component — uses manual `h1` at line 97
- No `EmptyState` for empty inventory
- KPI summary cards use `CardContent className="pt-6"` old Shadcn pattern with raw `h-8 w-8` icons
- Error state is plain text without proper styling
- `p-6` padding in outer container is inconsistent with other pages (which get padding from Layout)

**Recommended improvements:**

- Replace spinner with skeleton tiles matching the dashboard skeleton pattern
- Replace manual `h1` with `PageHeader title="Inventory" description="..."`
- Replace KPI summary cards with `AdminKpiCard` (or a new shared `KpiCard` if we want to decouple from admin)
- Add `EmptyState` for empty inventory list
- Remove redundant `p-6` on outer container (layout handles padding)

**Priority:** P0 (demo-visible, visually inconsistent)  
**Risk:** Low  
**Files:** `apps/web/src/pages/InventoryPage.tsx`

---

### 5.3 Orders Page (Supplier + Restaurant)

**File:** `apps/web/src/pages/OrdersPage.tsx`

**Current state:** Feature-rich with tabs, filters, search, manual order creation, dispute badges.

**Problems:**

- Uses raw `Badge` component for some status values (should be `StatusBadge`)
- Filter area could be visually tighter
- Loading state uses `Skeleton` but sizes are inconsistent

**Recommended improvements:**

- Audit all status displays and replace raw `Badge` with `StatusBadge` where applicable
- Standardize skeleton sizing to match table rows

**Priority:** P2  
**Risk:** Low  
**Files:** `apps/web/src/pages/OrdersPage.tsx`

---

### 5.4 Products Page (Supplier)

**File:** `apps/web/src/pages/ProductsPage.tsx`

**Current state:** Large page with product grid/list, bulk upload, inventory adjustment. Uses `PageHeader` and `EmptyState`.

**Problems:**

- Uses raw `Card, CardContent, CardDescription, CardHeader, CardTitle` heavily
- No skeleton loading state — likely shows a blank card while loading
- The `add product` form is inside a dialog — confirm dialog has good structure

**Recommended improvements:**

- Add skeleton loading for product grid
- Consider if product cards can use a cleaner pattern (no `CardDescription`)

**Priority:** P2  
**Risk:** Low  
**Files:** `apps/web/src/pages/ProductsPage.tsx`

---

### 5.5 Fulfillment Page (Supplier)

**File:** `apps/web/src/pages/FulfillmentPage.tsx`

**Current state:** Well-structured. Uses `PageHeader`, multi-tab layout.

**Problems:**

- Native `<select>` for warehouse filter (line 50) vs the custom `Select` component used elsewhere — visual inconsistency

**Recommended improvements:**

- Replace native `<select>` with Supplify custom `Select` component

**Priority:** P3  
**Risk:** Low  
**Files:** `apps/web/src/pages/FulfillmentPage.tsx`

---

### 5.6 Invoices Page (Supplier + Restaurant)

**File:** `apps/web/src/pages/InvoicesPage.tsx`

**Current state:** Feature-rich with finance analytics, credit notes, payment marking.

**Problems:**

- Uses raw `Badge` for invoice statuses (should be `StatusBadge`)
- Heavy import list — check for unused icons
- Multiple `isLoading` states to coordinate

**Recommended improvements:**

- Replace `Badge` with `StatusBadge` for invoice/payment statuses
- Consolidate loading skeletons

**Priority:** P2  
**Risk:** Low  
**Files:** `apps/web/src/pages/InvoicesPage.tsx`

---

### 5.7 Promotions Page (Supplier Deals)

**File:** `apps/web/src/pages/promotions/PromotionsPage.tsx`

**Current state:** Functional deal management. Display labels are handled by `dealDisplayLabels.ts`.

**Problems:**

- Page title from `copy.pageTitle` via persona — good. But the page header description is not using `PageHeader` component
- Status filter uses a native select
- No skeleton loading state

**Recommended improvements:**

- Add `PageHeader` at top
- Replace native select with `Select` component
- Add skeleton loading

**Priority:** P2  
**Risk:** Low  
**Files:** `apps/web/src/pages/promotions/PromotionsPage.tsx`

---

### 5.8 Deals Page (Restaurant)

**File:** `apps/web/src/pages/deals/DealsPage.tsx`

**Current state:** Clean, uses `EmptyState`. Has `MotionDealsHeader` (need to check).

**Problems:**

- Sort/filter controls use native select
- Uses `Loader2` spinner for loading vs skeleton

**Recommended improvements:**

- Replace `Loader2` spinner with skeleton deal cards
- Replace native select with `Select` component

**Priority:** P2  
**Risk:** Low  
**Files:** `apps/web/src/pages/deals/DealsPage.tsx`

---

### 5.9 Cart Page (Restaurant)

**File:** `apps/web/src/pages/CartPage.tsx`

**Current state:** Functional. Uses `RequirePermission` and persona-based copy.

**Problems:**

- Uses raw `Card, CardContent, CardHeader, CardTitle` pattern
- No skeleton or loading state for cart hydration
- `LimitExceededBanner` is shown inside cart — good

**Recommended improvements:**

- Add a cart skeleton for initial hydration state
- Consider lighter card styling (remove `CardHeader` chrome)

**Priority:** P2  
**Risk:** Medium (form submission flow involved)  
**Files:** `apps/web/src/pages/CartPage.tsx`

---

### 5.10 Restaurant Inventory Page

**File:** `apps/web/src/pages/RestaurantInventoryPage.tsx`

**Current state:** Good. Uses `PageHeader`, `EmptyState`, `Skeleton`, tabbed layout.

**Problems:** Minor — some `Badge` usage for status vs `StatusBadge`.

**Recommended improvements:** Minor status badge cleanup.

**Priority:** P3  
**Risk:** Low  
**Files:** `apps/web/src/pages/RestaurantInventoryPage.tsx`

---

### 5.11 Receiving Page (Restaurant)

**File:** `apps/web/src/pages/ReceivingPage.tsx`

**Current state:** Good. Uses `PageHeader`, `EmptyState`, `Skeleton`, `FeatureLockedCard`.

**Problems:**

- `FeatureLockedCard` uses old `CardHeader/CardContent` pattern

**Recommended improvements:**

- When `FeatureLockedCard` is polished (Phase 1), this page benefits automatically.

**Priority:** P3 (automatic from Phase 1)  
**Risk:** Low  
**Files:** `apps/web/src/pages/ReceivingPage.tsx`

---

### 5.12 Admin Dashboard Page

**File:** `apps/web/src/pages/AdminDashboardPage.tsx`

**Current state:** Very well structured. Tab system, lazy loading, `AdminPortalNav`, `AdminPageHeader`. Recent work has improved this significantly.

**Problems:**

- Tab bar overflows on small laptop screens — `overflow-x-auto` handles it but no visual indicator of more tabs
- Some admin tab content areas don't have consistent skeleton loading

**Recommended improvements:** Minor polish only. Do not restructure.

**Priority:** P3  
**Risk:** Low  
**Files:** `apps/web/src/pages/AdminDashboardPage.tsx`

---

### 5.13 Supplier Command Center

**File:** `apps/web/src/pages/SupplierCommandCenterPage.tsx`

**Current state:** Has quick action grid, KPI overview, at-risk orders section. Uses `PageHeader`, `EmptyState`.

**Problems:**

- Quick action for Deals (`qa-deals`) links to `/app/promotions` — should match the Deals nav item
- Quick action icons are generic Lucide icons (fine)

**Recommended improvements:**

- Update `OPS_QUICK_ACTIONS` and `SALES_QUICK_ACTIONS` deal link to `/app/deals` for consistency with supplier nav (since supplier nav item `testId: 'nav-deals'` also links to `/app/deals` but on a plan gate)

**Priority:** P1 (navigation clarity)  
**Risk:** Low  
**Files:** `apps/web/src/pages/SupplierCommandCenterPage.tsx`

---

### 5.14 Quick Lists Page (Restaurant)

**File:** `apps/web/src/pages/QuickListsPage.tsx`

**Current state:** Not yet read in detail. Has `Ordering Lists` nav item.

**Recommended improvements:** Inspect and audit in Phase 4.

**Priority:** P2  
**Risk:** Low

---

### 5.15 Reports Page

**File:** `apps/web/src/pages/reports/ReportsPage.tsx`

**Recommended improvements:** Inspect and audit in Phase 4.

**Priority:** P2  
**Risk:** Low

---

### 5.16 Layout Shell

**File:** `apps/web/src/components/Layout.tsx`

**Current state:** Handles global banners, socket entitlements refresh, monetization nudges.

**Problems:**

- Up to 5 different banner types can stack simultaneously: billing overdue, externally disabled features, plan tier disabled features, at-limit entries (multiple), near-limit entries.
- All banners use inline Tailwind styles — no shared `Banner` component.
- The visual difference between `externally disabled features` (amber) and `plan tier disabled features` (slate) is subtle and the descriptions are similar.

**Recommended improvements:**

- Create a shared `InfoBanner` component with a `tone` prop (amber, slate, red)
- Limit simultaneous banners: prefer 1 at a time, prioritize: billing overdue > at-limit > near-limit > tier-disabled. The admin override banner is separate and always shows.
- Consider collapsing multiple limit banners into one summary banner: "3 limits exceeded — view usage"

**Priority:** P1  
**Risk:** Medium (touches monetization display, not logic)  
**Files:** `apps/web/src/components/Layout.tsx`

---

### 5.17 Feature Locked Card

**File:** `apps/web/src/components/FeatureLockedCard.tsx`

**Current state:** Functionally correct. Upgrade-path copy via `upgradeCopy.ts`.

**Problems:**

- Uses `CardHeader/CardDescription/CardContent` old Shadcn pattern
- `bg-amber-50/50` with `border-amber-200` is soft — in some contexts locks are more prominent
- `h-5 w-5 text-amber-600 Lock` icon is too large relative to card size

**Recommended improvements:**

- Restyle without `CardHeader/CardContent` wrappers
- Tighter layout: icon + title in one row, description below, CTA at bottom
- Keep amber tone but use design tokens (e.g., `var(--amber-pale)`, `var(--amber)`) instead of Tailwind amber classes

**Priority:** P1  
**Risk:** Low (cosmetic only, no logic change)  
**Files:** `apps/web/src/components/FeatureLockedCard.tsx`

---

## 6. Shared Component Plan

### 6.1 Components that Already Exist (keep or extend)

| Component         | File                        | Status  | Action                                              |
| ----------------- | --------------------------- | ------- | --------------------------------------------------- |
| `PageHeader`      | `ui/page-header.tsx`        | ✅ Good | Use it in InventoryPage + any pages using manual h1 |
| `StatusBadge`     | `ui/status-badge.tsx`       | ✅ Good | Replace all `Badge` status usage with this          |
| `EmptyState`      | `ui/empty-state.tsx`        | ✅ Good | Already well-used; continue pattern                 |
| `AdminKpiCard`    | `admin/AdminKpiCard.tsx`    | ✅ Good | Consider exposing as general `KpiCard`              |
| `AdminPageHeader` | `admin/AdminPageHeader.tsx` | ✅ Good | Admin-only, keep separate                           |
| `Skeleton`        | `ui/skeleton.tsx`           | ✅ Good | Extend usage to all loading states                  |

### 6.2 Components to Create or Improve

#### `KpiCard` (general, non-admin)

**Purpose:** Shared KPI card for supplier and restaurant dashboards. Currently `DashboardPage.tsx` defines its own `KpiCard` inline.  
**Proposal:** Extract `DashboardPage.tsx`'s `KpiCard` into `ui/kpi-card.tsx`. Remove sparklines or make them optional/real-data-only.  
**Used in:** `DashboardPage`, `InventoryPage` (to replace 4 raw `Card/CardContent` tiles)  
**Priority:** P1  
**Risk:** Low

#### `InfoBanner`

**Purpose:** Shared inline banner component for contextual warnings/notices. Replaces inline amber/slate/red banner JSX in `Layout.tsx`.  
**Props:** `tone: 'amber' | 'slate' | 'red' | 'green'`, `icon?`, `title`, `description?`, `action?`  
**Used in:** `Layout.tsx` (4 banner types), any future notifications  
**Priority:** P1  
**Risk:** Low (Layout banners are purely display)

#### `DataTableShell`

**Purpose:** Consistent table wrapper with search bar, filter row, optional action button, and responsive scroll. Standardizes the table header pattern across Orders, Products, Tenants, Inventory.  
**Props:** `search?`, `filters?`, `actions?`, `children`  
**Used in:** `OrdersPage`, `ProductsPage`, `InventoryPage`, admin tenant/usage tables  
**Priority:** P2  
**Risk:** Medium (touches multiple pages)

#### `LoadingSkeleton` (table variant)

**Purpose:** Semantic named export from `skeleton.tsx` for a standard table row skeleton. Currently each page rolls its own.  
**Props:** `rows?: number`, `columns?: number`  
**Used in:** Any page with a data table  
**Priority:** P2  
**Risk:** Low

#### `LockedFeatureCard` (renamed/restyled `FeatureLockedCard`)

**Purpose:** Cleaner replacement for current `FeatureLockedCard`. Same props, better styling.  
**Changes:** Remove `CardHeader/CardContent`, use design tokens, tighter layout.  
**Priority:** P1  
**Risk:** Low (cosmetic only)

#### `SectionHeader`

**Purpose:** Section-level headers within a page (below PageHeader). `text-sm font-semibold text-[var(--text-mid)] uppercase tracking-wide` — already exists informally in admin as `AdminSectionHeader` via `adminUi.tsx`.  
**Proposal:** Export a general `SectionHeader` from `ui/` that both admin and tenant pages use.  
**Priority:** P2  
**Risk:** Low

---

## 7. Status Badge System

The `StatusBadge` component in `ui/status-badge.tsx` is the canonical status system. The following statuses are already mapped. Confirm all pages use `StatusBadge` rather than raw `Badge` or custom chips.

### Order Statuses

| Status         | Tone    | Label        |
| -------------- | ------- | ------------ |
| `PLACED`       | warning | Placed       |
| `PENDING`      | warning | Pending      |
| `PROCESSING`   | info    | Processing   |
| `ACKNOWLEDGED` | info    | Acknowledged |
| `SHIPPED`      | info    | Shipped      |
| `DELIVERED`    | success | Delivered    |
| `COMPLETED`    | success | Completed    |
| `CANCELLED`    | muted   | Cancelled    |
| `DECLINED`     | danger  | Declined     |
| `REJECTED`     | danger  | Rejected     |

### Invoice Statuses

| Status      | Tone    | Label     |
| ----------- | ------- | --------- |
| `PAID`      | success | Paid      |
| `PENDING`   | warning | Pending   |
| `PAST_DUE`  | danger  | Past Due  |
| `FAILED`    | danger  | Failed    |
| `CANCELLED` | muted   | Cancelled |

### Deal Statuses (Supplier)

| Status      | Tone    | Label          |
| ----------- | ------- | -------------- |
| `ACTIVE`    | success | Active         |
| `SCHEDULED` | info    | Scheduled      |
| `PAUSED`    | muted   | Paused         |
| `EXPIRED`   | muted   | Expired        |
| `DRAFT`     | neutral | Draft          |
| `PENDING`   | warning | Pending review |
| `REJECTED`  | danger  | Rejected       |

### Boost Statuses

| Status                               | Tone    | Label            |
| ------------------------------------ | ------- | ---------------- |
| `APPROVED`                           | success | Boosted          |
| `PENDING` / `pending_admin_approval` | warning | Pending approval |
| `REJECTED`                           | danger  | Rejected         |
| `EXPIRED`                            | muted   | Expired          |

### Inventory Expiry Statuses

| Status          | Tone    | Label         |
| --------------- | ------- | ------------- |
| `expired`       | danger  | Expired       |
| `expiring_soon` | warning | Expiring soon |
| `ok`            | success | Good          |

### Tenant / Subscription Statuses

| Status      | Tone    | Label     |
| ----------- | ------- | --------- |
| `ACTIVE`    | success | Active    |
| `TRIALING`  | info    | Trial     |
| `PAST_DUE`  | danger  | Past due  |
| `CANCELLED` | muted   | Cancelled |
| `PAUSED`    | muted   | Paused    |
| `INACTIVE`  | muted   | Inactive  |

### Fulfillment / Receiving

| Status                  | Tone    | Label    |
| ----------------------- | ------- | -------- |
| `RECEIVED_FULL`         | success | Received |
| `RECEIVED_PARTIAL`      | warning | Partial  |
| `RECEIVED_WITH_DISPUTE` | warning | Disputed |

**Action:** Audit all pages and replace raw `Badge` color-coded for status with `StatusBadge`.

---

## 8. Empty / Loading / Error State Plan

### 8.1 Loading States

| Page                           | Current                           | Target                                     |
| ------------------------------ | --------------------------------- | ------------------------------------------ |
| `InventoryPage.tsx` (supplier) | Full-screen spinner (`h-32 w-32`) | 4 skeleton KPI tiles + skeleton table rows |
| `ProductsPage.tsx`             | Unclear (Card/Content)            | Skeleton product cards                     |
| `DealsPage.tsx` (restaurant)   | `Loader2` spinner                 | Skeleton deal cards                        |
| `PromotionsPage.tsx`           | Unclear                           | Skeleton deal rows                         |
| All admin tabs                 | ✅ `AdminTabLoading`              | Keep                                       |
| `DashboardPage.tsx`            | ✅ Skeleton layout                | Keep                                       |
| `OrdersPage.tsx`               | Partial skeleton                  | Standardize                                |

**Standard:** All loading states use `Skeleton` from `ui/skeleton.tsx`. No `animate-spin` circles. No `h-32` spinners.

### 8.2 Empty States

| Page                           | Current                                 | Target                                                   |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------- |
| `InventoryPage.tsx` (supplier) | None visible                            | `EmptyState` with "No inventory items" + Add product CTA |
| `ProductsPage.tsx`             | Uses `EmptyState`                       | ✅ Keep                                                  |
| `OrdersPage.tsx`               | Text "no orders"                        | `EmptyState` with icon + CTA                             |
| `PromotionsPage.tsx`           | `EmptyState` via `SUPPLIER_EMPTY_STATE` | ✅ Keep                                                  |
| `DealsPage.tsx`                | Uses `EmptyState`                       | ✅ Keep                                                  |

### 8.3 Error States

| Page                           | Current                                | Target                       |
| ------------------------------ | -------------------------------------- | ---------------------------- |
| `InventoryPage.tsx` (supplier) | `text-[var(--red)] text-lg` plain text | Shared error card with retry |
| `DashboardPage.tsx`            | Inline `AlertTriangle` + text          | ✅ Good enough               |
| All admin tabs                 | ✅ `AdminOverviewTab` has error card   | Keep                         |

**Standard error pattern:** `<div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">` with title, message, and optional retry button. Consider a shared `ErrorState` component.

---

## 9. Dashboard Plan

### 9.1 Admin Dashboard

**File:** `apps/web/src/pages/AdminDashboardPage.tsx`  
**Status:** ✅ Strong. Recent work made this solid.

What the admin dashboard should answer:

- How many active tenants? Revenue? (Overview tab ✅)
- Who is overdue or near limit? (Usage tab ✅)
- Any system health issues? (Health tab ✅)
- Recent platform activity? (Activity tab ✅)
- What deals / boosts are live? (Deals tab ✅)

**Remaining gap:** Overview tab should prominently surface any tenants with billing issues or at-limit status. This is mostly working but the visual hierarchy could push "attention items" higher.

**Do not restructure** this dashboard. It works.

---

### 9.2 Supplier Dashboard

**File:** `apps/web/src/pages/DashboardPage.tsx` (supplier mode)  
**File:** `apps/web/src/pages/SupplierCommandCenterPage.tsx`

What the supplier dashboard should answer:

- What orders are pending? ✅ (KPI + Recent Orders section)
- What's my revenue trend? ✅ (Order Status section)
- What's low on stock? ✅ (Low Stock section)
- Are any restaurant customers about to churn? ✅ (At-risk orders — gated behind feature)

**Gaps:**

- The period picker (7d/30d/90d) doesn't actually change data shown — deceptive
- Synthetic sparklines when data is sparse — misleading
- KpiCard is defined inline in DashboardPage — should be extracted if reused

**Plan:**

- Remove `syntheticRamp` entirely. If fewer than 3 data points, don't show sparkline.
- Either wire period picker or remove it.
- Add `<EmptyState>` to Recent Orders when order count is 0 (already partially done with a text fallback).

---

### 9.3 Restaurant Dashboard

**File:** `apps/web/src/pages/DashboardPage.tsx` (restaurant mode)

What the restaurant dashboard should answer:

- How much have I spent this month? ✅
- What orders are pending? ✅
- What items should I reorder? ✅ (gated)
- What's expiring soon? ✅ (gated)
- Calendar of upcoming delivery days ✅ (gated/persona-based)

**Gaps:** Same as supplier — fake sparklines and non-functional period picker.

---

## 10. Tables Plan

### 10.1 Orders Table

**Problem:** Multiple inconsistent row styles across supplier vs restaurant views. Some rows use raw `Badge` for status.
**Target:** Consistent row layout with `StatusBadge`, truncated names, right-aligned amount.

### 10.2 Products Table

**Problem:** `ProductsPage.tsx` likely uses a mix of card and table layouts. Full audit needed.
**Target:** Consistent product cards or table rows with `StatusBadge` for deal/stock status.

### 10.3 Inventory Table (Supplier)

**Problem:** `InventoryPage.tsx` has a raw `<table>` with `<thead>`. No skeleton. Uses `pt-6` Card pattern.
**Target:** Consistent with other tables. Skeleton loading. `EmptyState` when empty.

### 10.4 Tenants Table (Admin)

**Status:** ✅ Uses `AdminKpiCard` and admin table patterns. Good.

### 10.5 Usage Table (Admin)

**Status:** `AdminTenantUsageTable.tsx` exists. Uses `UsageProgressBar` and `UsageStatusBadge`. ✅

### 10.6 Plans Table (Admin)

**Status:** `AdminPlansTab.tsx` exists. Need to check for consistency.

### 10.7 Invoices Table

**Problem:** Uses raw `Badge` for invoice status.
**Target:** Replace with `StatusBadge`.

---

## 11. Forms Plan

### 11.1 Product Form (Supplier)

**Location:** Inside `ProductsPage.tsx` dialog  
**Problems:** Very long dialog form. Consider a drawer instead of a dialog for complex forms.  
**Target:** Same dialog but with better section grouping (Product details | Pricing | Stock | Images).

### 11.2 Deal Form (Supplier)

**Location:** `PromotionsPage.tsx`  
**Problems:** Good structure but uses native `<select>` for type/CTA type. Also uses `FORM_SELECT_CLASS` as a CSS class constant instead of the `Select` component.  
**Target:** Replace native selects with `Select` component.

### 11.3 Plan Edit Form (Admin)

**Location:** `AdminPlansTab.tsx`  
**Target:** Audit in Phase 2.

### 11.4 Cart / Order Form

**Location:** `CartPage.tsx`  
**Problems:** Uses `Card/CardHeader` pattern.  
**Target:** Lighter layout, no card chrome needed.

### 11.5 Inventory Adjustment Form

**Location:** `InventoryPage.tsx` dialog  
**Problems:** Plain `<select>` for adjustment type, no step/validation hint.  
**Target:** Replace with `Select` component.

---

## 12. Navigation Plan

### 12.1 Sidebar

**File:** `apps/web/src/components/Sidebar.tsx`

**Current structure:** Role-based sections. Restaurant has "Operations", "Intelligence", "Account" sections. Supplier has similar structure via `reorderNavSectionsForPrimaryFocus`.

**Problems:**

- `Deals` nav item for supplier links to `/app/deals` via `nav-deals` but command center quick actions link to `/app/promotions`
- Section labels ("Operations", "Intelligence", "Account") are hardcoded strings — fine but ensure they're consistent

**Target:** Ensure nav item hrefs are consistent with command center quick action hrefs. Specifically: `/app/promotions` (supplier deals management) should be the canonical route for suppliers. The restaurant `/app/deals` (browsing deals from suppliers) is a different page — both are correct.

**Priority:** P1 (nav consistency)

### 12.2 Active Nav States

**Current:** `isNavItemActive()` handles `/app/command-center` vs `/app/dashboard` specialcasing.
**Status:** ✅ Works correctly.

### 12.3 Locked Feature Visibility

**Current:** Locked features are hidden from nav if plan gate returns false (`supplierDealsEnabled`, `fulfillmentEnabled`, etc.). User never sees they exist.
**Alternative approach:** Show locked nav items in muted style with a lock icon (like Linear does for locked projects) so users discover upgradeable features.
**Decision:** This is a product decision. **Do not implement until explicitly requested.** Hiding is safer.

### 12.4 Mobile Navigation

**Current:** `mobileOpen` state in `Layout.tsx` controls a slide-in sidebar with `fixed inset-0 z-40` overlay.
**Status:** Works. On small screens, sidebar slides in.
**Improvement:** Ensure bottom navigation bar for restaurant mobile view (chefs/staff often use phones). This is a Phase 6 item.

---

## 13. Deals and Boosts Wording Plan

The following user-facing labels are already implemented correctly in `dealDisplayLabels.ts` and should not be changed. This section confirms what is in place.

### Confirmed correct display labels:

| Internal/API               | Display Label       | Where                                        |
| -------------------------- | ------------------- | -------------------------------------------- |
| `promotion` / `promotions` | **Deal**            | Supplier deal name, restaurant deal browsing |
| `deal_promotion` / boost   | **Boost**           | Supplier boost package picker, boost status  |
| `promotion_usage`          | **Deal redemption** | Usage counters, limit copy                   |
| `coupon_code`              | **Coupon code**     | Checkout, deal form CTA type                 |
| `is_sponsored`             | **Boosted**         | Restaurant deal card badge                   |

### Remaining inconsistency:

- Command center quick actions (`SupplierCommandCenterPage.tsx` line 45): `label: 'Deals & promotions'` — should be `'Deals'` to match the nav item label.
- `SALES_QUICK_ACTIONS` line 49: `label: 'Deals & promotions'` — same fix needed.

**Priority:** P1  
**Risk:** Low (copy only)

---

## 14. Plan / Locked Feature UX Plan

### Current system:

- `FeatureLockedCard`: Shows amber card with lock icon, description, and "View plans" button
- `LimitExceededBanner`: Shows red/warning banner for at-limit scenarios
- `UpgradeModal`: Shows plan comparison modal when upgrade is triggered
- Layout shell banners: Multiple stacked notices for tier/admin/limit issues

### Improvements (no logic changes):

**FeatureLockedCard redesign:**

- Remove Shadcn `CardHeader/CardContent` chrome
- Tighter layout: horizontal row with lock icon + title + description + CTA button
- Use design tokens: `var(--amber-pale)`, `var(--amber)`, `var(--amber-border)` if they exist, or consistent amber Tailwind classes

**Layout banners priority:**

1. Billing overdue (red) — always show, always first
2. At-limit (red/amber per item) — collapse multiple into one if more than 2
3. Near-limit (amber) — show max 1 (most critical)
4. Tier disabled (slate) — show below billing issues only
5. Admin override disabled (amber) — always show if present

---

## 15. Responsive / Mobile Plan

### High-impact responsive fixes (Phase 6):

1. **Supplier Inventory table**: Raw `<table>` with many columns is unreadable on mobile. Add responsive column hiding or card-view toggle.

2. **Orders table**: Multiple columns (ID, customer, amount, status, date). Hide date column on mobile. Stack customer + ID.

3. **Admin tab bar**: Tab bar with 13 tabs overflows. `overflow-x-auto` works but no left/right scroll indicator. Add fade gradients.

4. **Dashboard KPI grid**: `dashboard-kpi-grid` CSS class — ensure it's 2×2 on mobile, 4×1 on desktop.

5. **Restaurant mobile nav**: Consider a fixed bottom nav bar for the 5 most-used restaurant pages (Dashboard, Orders, Cart, Chat, Inventory).

6. **Forms in dialogs**: On mobile, `Dialog` fullscreen mode should be more prominent. Consider `Dialog` → bottom sheet pattern for restaurant forms.

---

## 16. Performance Considerations

### Risks to avoid during implementation:

1. **DashboardPage.tsx** is already heavy with multiple queries (`useGetOrdersQuery` with `limit: 200` for restaurants). Do not add more queries to this page.

2. **DashboardPage.tsx recharts**: `BarChart` / `ResponsiveContainer` from recharts is a non-trivial import. Don't add more chart library dependencies. If sparklines are removed (fake data removal), recharts import on Dashboard may be removable.

3. **AdminKpiCard reuse**: If we expose `AdminKpiCard` as a general `KpiCard`, ensure we don't accidentally bundle the admin module into the restaurant/supplier bundle. Consider renaming to `KpiCard` in `ui/` and importing from there.

4. **Skeleton imports**: `Skeleton` from `ui/skeleton.tsx` is lightweight. Adding it to pages doesn't increase bundle size meaningfully.

5. **InfoBanner**: Keep it as a pure Tailwind component with no new dependencies.

6. **Don't add animation libraries** (framer-motion etc.) for Phase 1–3.

7. **Prefetch patterns**: `Layout.tsx` already prefetches `DashboardPage`, `OrdersPage`, `StaffPage`, `InventoryPage` on idle. This is good — don't change.

---

## 17. Implementation Phases

### Phase 1 — Shared UI System + Quick Wins

> **Status: ✅ Completed**

**Scope:** Foundational changes that unblock all other phases. No layout or page-level restructuring.

**Tasks:**

1. Fix `DashboardPage.tsx`: Remove `StatusChip`, replace with `StatusBadge`. Remove `syntheticRamp`. Remove or wire period picker. **File:** `apps/web/src/pages/DashboardPage.tsx`
2. Fix `InventoryPage.tsx` (supplier): Replace spinner with skeleton tiles. Add `PageHeader`. Add `EmptyState`. Replace `Card/CardContent` KPI tiles with `AdminKpiCard` or a shared pattern. **File:** `apps/web/src/pages/InventoryPage.tsx`
3. Fix `FeatureLockedCard.tsx`: Restyle without Shadcn card chrome. Use design tokens. **File:** `apps/web/src/components/FeatureLockedCard.tsx`
4. Create `InfoBanner` component. Refactor `Layout.tsx` banners to use it. **File:** `apps/web/src/components/ui/info-banner.tsx`, `apps/web/src/components/Layout.tsx`
5. Fix command center wording: `'Deals & promotions'` → `'Deals'` in quick actions. **File:** `apps/web/src/pages/SupplierCommandCenterPage.tsx`

**Expected impact:** High — fixes the most visually inconsistent page (Inventory), removes fake data, standardizes banners.  
**Risk:** Low — all isolated changes, no business logic, no API changes.  
**Test strategy:** Visual diff on Inventory page, Dashboard page. Verify banners still appear for billing overdue scenario. Check StatusBadge renders correctly in DashboardPage order list.  
**Complexity:** Medium (5 tasks, each small)

---

### Phase 2 — Admin Refinements

> **Status: ✅ Completed** — Status badges replaced in Subscriptions/Tenants/Plans/Feature flags; `AdminTabScrollRow` fade indicator added to the dashboard tab bar; `AdminPlansTab` native selects replaced with `Select`; `AdminOperationsPanel` sub-tabs now use `AdminLoadingSkeleton` instead of spinners.

**Scope:** Polish admin-specific areas that still have rough edges.

**Tasks:**

1. Audit all admin tab content for raw `Badge` usage vs `StatusBadge`.
2. Add scroll indicator for admin tab bar overflow (fade gradient on right).
3. Check `AdminPlansTab` form for native selects — replace with `Select`.
4. Ensure `AdminOperationsPanel` sub-tab content has consistent skeleton states.

**Expected impact:** Medium — admin portal becomes fully consistent.  
**Risk:** Low  
**Files:** `apps/web/src/components/admin/dashboard/` (multiple tabs)

---

### Phase 3 — Supplier Operational Pages

**Scope:** Supplier pages beyond the dashboard and inventory.

**Tasks:**

1. `PromotionsPage.tsx`: Add `PageHeader`, replace native selects, add skeleton loading.
2. `FulfillmentPage.tsx`: Replace native warehouse `<select>` with `Select` component.
3. `InvoicesPage.tsx`: Replace raw `Badge` status with `StatusBadge`.
4. `ProductsPage.tsx`: Add skeleton loading for product grid.

**Expected impact:** Medium  
**Risk:** Low  
**Files:** Supplier pages as listed

---

### Phase 4 — Restaurant Operational Pages

**Scope:** Restaurant-specific pages.

**Tasks:**

1. `CartPage.tsx`: Remove `CardHeader/CardContent` chrome. Add cart skeleton.
2. `DealsPage.tsx`: Replace `Loader2` spinner with skeleton deal cards. Replace native sort select.
3. `QuickListsPage.tsx`: Audit and standardize.
4. `RestaurantInventoryPage.tsx`: Minor `Badge` → `StatusBadge` cleanup.
5. `ReceivingPage.tsx`: Verify `FeatureLockedCard` changes from Phase 1 apply cleanly.

**Expected impact:** Medium  
**Risk:** Medium (CartPage touches order submission flow — cosmetic only but test carefully)  
**Files:** Restaurant pages as listed

---

### Phase 5 — Tables and Forms Polish

**Scope:** Cross-cutting table and form improvements.

**Tasks:**

1. Create `DataTableShell` component (search + filter row wrapper).
2. Apply `DataTableShell` to Orders, Products, Inventory tables.
3. Audit all forms for native `<select>` — replace with `Select` component.
4. Standardize table skeleton loading (`rows × columns` skeleton).

**Expected impact:** High visual consistency  
**Risk:** Medium (touches multiple pages at once)  
**Files:** `ui/data-table-shell.tsx` (new), Orders/Products/Inventory pages

---

### Phase 6 — Mobile / Responsive Pass

**Scope:** Mobile-first improvements for restaurant staff and drivers.

**Tasks:**

1. Inventory table: Add responsive column hiding for mobile.
2. Orders table: Stack customer + ID on mobile, hide date column.
3. Admin tab bar: Add fade gradient scroll indicators.
4. Consider bottom nav bar for restaurant mobile (5 primary destinations).
5. `Dialog` → bottom sheet behavior review on mobile.

**Expected impact:** High for restaurant mobile users  
**Risk:** Medium (layout restructuring)  
**Files:** Multiple pages

---

### Phase 7 — Performance and QA

**Scope:** Performance audit + cleanup after all phases.

**Tasks:**

1. Check if recharts is still needed after sparkline removal (DashboardPage).
2. Verify no admin-specific imports leaked into tenant bundle.
3. Run full Lighthouse audit on Dashboard, Orders, Admin tabs.
4. Remove any `// TODO` comments introduced during phases.
5. Manual QA pass (see Section 19).

**Expected impact:** Bundle size reduction (if recharts removed), faster load  
**Risk:** Low  
**Files:** Various

---

## 18. Do-Not-Touch List

The following must not be changed during UI modernization work:

| Area                                                                         | Reason                     |
| ---------------------------------------------------------------------------- | -------------------------- |
| Business logic in `lib/planLimits.ts`                                        | Plan enforcement rules     |
| RBAC: `usePermissions`, `RequirePermission`, `PermissionGate`                | Access control             |
| Checkout / order creation logic in `CartPage.tsx` (`useCreateOrderMutation`) | Revenue path               |
| Discount / deal pricing logic                                                | Revenue path               |
| Boost billing logic in `PromotionsPage.tsx`                                  | Revenue path               |
| Database migrations / schema                                                 | Backend only               |
| API contracts (`services/api.ts`)                                            | Backend compatibility      |
| WebSocket entitlements refresh in `Layout.tsx` (`onEntitlementsRefresh`)     | Real-time plan enforcement |
| `monetizationSlice`, `showMonetizationBlock`                                 | Monetization tracking      |
| `BranchContext`, `BranchProvider`                                            | Multi-branch workspace     |
| Authentication / Keycloak flows                                              | Security                   |
| `ImpersonationBanner`                                                        | Admin safety               |
| Route prefetch logic in `Layout.tsx`                                         | Performance                |

---

## 19. Manual QA Checklist

Use this checklist after completing each phase.

### Phase 1 QA

- [ ] Dashboard loads — no fake sparklines visible when orders < 3
- [ ] Dashboard period picker removed OR shows real-filtered data
- [ ] Dashboard order list uses `StatusBadge` not inline chips
- [ ] Supplier Inventory page: skeleton tiles appear during load (not spinning circle)
- [ ] Supplier Inventory page: `PageHeader` renders with title + description
- [ ] Supplier Inventory page: `EmptyState` shows when no inventory
- [ ] `FeatureLockedCard` renders cleanly without Shadcn card chrome (amber tone preserved)
- [ ] Layout banners: Billing overdue banner still appears correctly for overdue tenant
- [ ] Layout banners: At-limit banner still appears for tenant at limit
- [ ] Layout banners: Max 2–3 banners stacked at once (no 5-banner pile-up)
- [ ] Command center: "Deals" quick action shows "Deals" not "Deals & promotions"

### Phase 2 QA (Admin)

- [ ] All admin tab status values use `StatusBadge` tone colors correctly
- [ ] Admin tab bar: visible scroll gradient on right when >13 tabs
- [ ] `AdminPlansTab` form: Select components render consistently

### Phase 3 QA (Supplier)

- [ ] Promotions page: `PageHeader` renders
- [ ] Promotions page: Skeleton loading appears correctly
- [ ] Fulfillment page: Warehouse filter uses styled Select component
- [ ] Invoices: Status badges show correct tone for PAID / PAST_DUE / PENDING

### Phase 4 QA (Restaurant)

- [ ] Cart page: order creation still works after cosmetic changes
- [ ] Deals page: skeleton deal cards appear during load
- [ ] Cart: `LimitExceededBanner` still shows when order limit reached
- [ ] Receiving page: Feature locked card renders cleanly

### Phase 5 QA (Tables)

- [ ] Orders table: consistent row structure supplier and restaurant
- [ ] Products table: skeleton loading
- [ ] Inventory table: skeleton loading
- [ ] All forms: no native `<select>` elements (replaced with Select)

### Phase 6 QA (Mobile)

- [ ] iPhone SE (375px): Sidebar opens and closes correctly
- [ ] iPhone 14 (390px): Orders table is readable (no horizontal scroll of key columns)
- [ ] iPad (768px): Dashboard 2-column KPI grid
- [ ] Admin tab bar: scroll indicator visible on 13" laptop
- [ ] All dialogs: close button accessible on small screen

### Phase 7 QA

- [ ] Lighthouse Performance ≥ 85 on Dashboard (mobile emulation)
- [ ] No console errors on any main page
- [ ] Bundle: confirm recharts not included if sparklines removed

---

## 20. Recommended First Execution Prompt

After reviewing this plan, use the following prompt to execute Phase 1:

---

> Execute Phase 1 of the UI/UX Modernization Plan located at `docs/ui/SUPPLIFY_UI_MODERNIZATION_PLAN.md`.
>
> Phase 1 scope (planning-only reference):
>
> **Task 1: DashboardPage.tsx cleanup**
>
> - Remove the `StatusChip` function (lines ~98–125) and replace all its usages in the file with `StatusBadge` from `components/ui/status-badge`.
> - Remove the `syntheticRamp` function and all calls to it. Sparklines should only render if the data array has 3+ real values; otherwise render nothing.
> - Remove the period picker (the 7d/30d/90d button group near line 664) since it has no effect on data. Or, if you can wire it to the existing queries, do so.
>
> **Task 2: InventoryPage.tsx (supplier) modernization**
>
> - Replace the full-screen spinner (lines ~77–81) with skeleton tiles matching the dashboard pattern.
> - Replace the manual `<h1 className="text-[21px] font-black">` (line ~97) with `PageHeader` from `components/ui/page-header`.
> - Replace the 4 Shadcn `Card/CardContent` KPI tiles with `AdminKpiCard` from `components/admin/AdminKpiCard`.
> - Add an `EmptyState` for when `inventory.length === 0`.
> - Remove the outer `p-6` padding on the container (layout shell provides padding).
>
> **Task 3: FeatureLockedCard.tsx restyle**
>
> - Remove `CardHeader`, `CardContent`, `CardDescription` wrappers.
> - Use a compact horizontal layout: Lock icon + title in one row, description below, CTA button at bottom.
> - Replace Tailwind `amber-50/amber-200` classes with CSS variables where they exist (`var(--amber-pale)`, `var(--amber)`). If CSS variables don't exist for those tones, keep Tailwind amber classes.
>
> **Task 4: Wording fix in SupplierCommandCenterPage.tsx**
>
> - Change `label: 'Deals & promotions'` to `label: 'Deals'` in both `OPS_QUICK_ACTIONS` and `SALES_QUICK_ACTIONS`.
>
> Do not change any business logic, API calls, permissions, billing, plan enforcement, or any other non-UI code.
> After making changes, describe what was changed and what still needs to be done.

---

## Plan File Summary

**Plan created:** `docs/ui/SUPPLIFY_UI_MODERNIZATION_PLAN.md`

**Biggest UI opportunities:**

1. Remove fake sparkline data and non-functional controls from Dashboard (trust issue)
2. Modernize supplier Inventory page (most visually inconsistent page)
3. Standardize loading states (eliminate full-screen spinners)
4. Consolidate Layout banners to avoid 5-banner pile-up
5. Apply StatusBadge everywhere (currently inconsistent)

**Recommended first phase:** Phase 1 — 4 focused tasks, all low-risk, all high-impact.

**What to run next:** The "Recommended First Execution Prompt" in Section 20 above.
