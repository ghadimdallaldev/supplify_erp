# Responsive UI Audit

**Date:** 2026-05-28 (updated)  
**Scope:** Layout-only fixes (no business logic, API, tier/pricing, or deals/promotions logic changes).

## Root cause (supplier card regression)

`CardActionGrid` initially used `sm:flex` tied to **viewport** width. In a 3-column desktop grid, each card can be ~300px wide while the viewport is ≥640px, so buttons switched to a single flex row, `flex-1` clipped labels (“Mess”), and controls overlapped.

**Fix:** Card actions always use a **2-column CSS grid** inside the card. Never switch card-internal layouts based on viewport breakpoints alone.

## Shared primitives (`apps/web/src/components/ui/card-layout.tsx`)

| Export                                       | Purpose                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `cardShellClass`                             | `overflow-hidden min-w-0` on cards in grids      |
| `pageHeaderRowClass`                         | Page title + actions stack on mobile             |
| `splitRowClass`                              | Label/value rows wrap instead of overlapping     |
| `CardActionGrid`                             | Always 2-col (optional 3-col) button grid        |
| `cardActionBtnClass()`                       | Full-width cells, `whitespace-normal`, `text-xs` |
| `CardStatusBadges`                           | Inline badges (not absolute on avatar)           |
| `CardMetaLine` / `CardFooterMeta`            | Truncated meta + stacked footer                  |
| `formatAddressLine()` / `formatStreetLine()` | Safe city/country join (no lone `,`)             |
| `CardAddressBlock`                           | Street + city/country or fallback text           |

## Base UI

- `card.tsx` — default `min-w-0 overflow-hidden`
- `dialog.tsx` — `w-[calc(100vw-2rem)]`, mobile padding
- `index.css` — `body { overflow-x-hidden }`, dashboard KPI/content grids, `dashboard-page-header`, `dashboard-split-row`
- `LimitExceededBanner.tsx` — uses `splitRowClass`

## Pages & components updated

### Listing / grid cards

- `SuppliersPage.tsx` — badges beside title, action grid, address fallback
- `RestaurantsPage.tsx` — supplier grid + **admin marketplace grid**, list view, headers
- `QuickListsPage.tsx` — badges beside title, unified `CardActionGrid` (incl. schedule/delete)
- `deals/DealCard.tsx` — card shell, header layout, CTA `whitespace-normal`
- `deals/DealsPage.tsx` — grid already `grid-cols-1 md:2 xl:3` (OK)

### Orders & cart

- `OrdersPage.tsx` — card header/actions wrap
- `OrderDetailPage.tsx` — responsive page header
- `CartPage.tsx` — header, supplier subtotal row, line items stack on mobile

### Detail pages

- `SupplierDetailPage.tsx` — header actions wrap, `CardAddressBlock`
- `RestaurantDetailPage.tsx` — header + `CardAddressBlock`

### Operations

- `FulfillmentPage.tsx` — pick lists, routes, tracking, exceptions rows
- `InvoicesPage.tsx` — invoice list rows
- `AdminDashboardPage.tsx` — plan card Edit button full width

### Dashboard & monetization

- `DashboardPage.tsx` — KPI/content responsive grids, split rows
- `UpgradeModal.tsx` — responsive plan columns, scrollable comparison table

### Shell

- `Layout.tsx` — banner margins and stacked near-limit rows

## Address comma bug

Replaced raw `{city}, {country}` in:

- `RestaurantsPage.tsx` (admin grid)
- `RestaurantDetailPage.tsx`
- `SupplierDetailPage.tsx`

Use `formatAddressLine()` or `CardAddressBlock` everywhere else.

## Screen sizes

Breakpoints used: default (320px+), `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px. Card **actions** do not use viewport `sm:` for layout.

## Tests / build

| Command                                                                                | Result                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run test:run -- src/components/Header.test.tsx src/components/ui/button.test.tsx` | Pass (6 tests)                                                                 |
| `npm run typecheck` / `npm run build`                                                  | Pre-existing errors in unrelated files (sockets, AdminDashboard imports, etc.) |

## Remaining lower-priority areas

These still use inline `justify-between` in dense forms/settings (acceptable with scroll/wrap in many cases):

- `SupplierSettingsPage.tsx` — contact rows, tab headers
- `StaffPage.tsx` — timeclock rows
- `RestaurantOnboardingPage.tsx` — onboarding steps
- `SettingsPage.tsx` — notification toggles
- `ProductsPage.tsx` — table view (horizontal scroll intentional)
- `ChatPage.tsx` — conversation layout
- `ReceivingPage.tsx` — partial header rows
- `reservations/ReservationTableBuilder.tsx` — floor plan absolute seat labels (different UI)

Prefer `splitRowClass` / `pageHeaderRowClass` when touching these files.

## Manual QA checklist

1. Supplier listing at **320px** — 2×2 actions, no overlap, badges beside name.
2. Quick Lists at **375px** — schedule + delete in grid, no clipped labels.
3. Deals grid at **768px** (3 columns) — each deal card readable, CTA not clipped.
4. Cart with items at **390px** — line items stack; qty/price visible.
5. Restaurant admin grid — no comma-only location row.
6. Fulfillment pick list — actions wrap on narrow width.
7. No horizontal page scroll on suppliers/dashboard/deals (tables may scroll inside container).
8. Desktop layouts unchanged in spirit.

## Before / after (supplier card)

- **Before:** Viewport `sm:flex` squeezed Message/Products in ~300px-wide cards; badges over avatar; `,` for empty address.
- **After:** Fixed 2×2 action grid; badges top-right of title; “Location not provided” or real address text.
