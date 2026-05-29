# UI/UX Polish Audit

**Date:** 2026-05-28  
**Goal:** Premium, clean, modern SaaS feel — incremental polish without business-logic changes.  
**Brand:** Keep existing purple/clean Supplify direction.

---

## Executive summary

| Area                      | Status                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| Design system (shared UI) | **Improved** — dialogs, tabs, cards, empty states, tables, utilities |
| Responsive (320–desktop)  | **Improved** — modals, action bars, tabs scroll, touch targets       |
| High-impact screens       | **Polished** — roles editor, fulfillment header, driver deliveries   |
| Full app sweep            | **Partial** — remaining pages listed below for pass 2                |

---

## 1. Pages audited (inventory)

### Restaurant (sampled + grep patterns)

| Page                               | Audited |       Polished this pass        |
| ---------------------------------- | :-----: | :-----------------------------: |
| Dashboard                          |    ✓    | — (uses existing dashboard CSS) |
| Suppliers marketplace              |    ✓    |                —                |
| Cart / Orders / Order detail       |    ✓    |                —                |
| Receiving / Disputes               |    ✓    |                —                |
| Invoices / Quick lists / Inventory |    ✓    |                —                |
| Reservations / Public booking      |    ✓    |                —                |
| Settings / Subscription            |    ✓    |                —                |

### Supplier

| Page                          | Audited |    Polished this pass    |
| ----------------------------- | :-----: | :----------------------: |
| Command center                |    ✓    |            —             |
| Products / Import             |    ✓    |            —             |
| Fulfillment & logistics       |    ✓    |         **Yes**          |
| Driver deliveries             |    ✓    |         **Yes**          |
| Warehouses / Invoices / Deals |    ✓    |            —             |
| Settings / Team & roles       |    ✓    | **Yes** (TeamRolesPanel) |

### Admin

| Page                                | Audited | Polished this pass |
| ----------------------------------- | :-----: | :----------------: |
| Overview / Tenants / Plans / Limits |    ✓    |         —          |
| Features / Finance / Audit          |    ✓    |         —          |

### Public

| Page                          | Audited | Polished this pass |
| ----------------------------- | :-----: | :----------------: |
| Public reservation / Waitlist |    ✓    |         —          |

---

## 2. Issues found (before)

| Category     | Issue                                                      |
| ------------ | ---------------------------------------------------------- |
| Modals       | Fixed height on small screens; footers cramped on mobile   |
| Tabs         | Fulfillment grid cramped; overflow on 320px                |
| Tables       | Team roles table could overflow without consistent wrapper |
| Empty states | Plain dashed boxes; weak hierarchy                         |
| Role editor  | Dense permission rows; small checkboxes on mobile          |
| Driver page  | Text-only loading; plain empty card                        |
| Toasts       | Top-right clipped on narrow phones                         |
| Cards        | Heavy `p-6` on mobile                                      |
| Actions      | Header buttons not full-width on mobile where needed       |

---

## 3. Shared components changed

| Component               | Change                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `index.css`             | `.page-stack`, `.table-scroll`, `.tabs-scroll`, `.action-bar`, `.touch-target`, `.section-label` |
| `ui/table-scroll.tsx`   | **New** — accessible horizontal scroll for tables                                                |
| `ui/dialog.tsx`         | `max-h` + scroll; mobile width; footer border/gap                                                |
| `ui/tabs.tsx`           | Horizontal scroll list; taller triggers                                                          |
| `ui/card.tsx`           | Responsive padding; wrapping footer                                                              |
| `ui/button.tsx`         | `touch` size; larger icon hit area on mobile                                                     |
| `ui/empty-state.tsx`    | Icon well, typography, action bar                                                                |
| `ui/confirm-dialog.tsx` | Full-width mobile footer buttons                                                                 |
| `main.tsx`              | Toast position/style for mobile safe area                                                        |

---

## 4. Pages polished (this pass)

| Page / area                 | Improvements                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------- |
| **TeamRolesPanel**          | `TableScroll`, responsive card header, role list cards, empty state, dialog footers |
| **RolePermissionChecklist** | Domain cards, touch-friendly rows, partial badge                                    |
| **FulfillmentPage**         | `PageHeader`, warehouse filter styling, scrollable tabs                             |
| **DriverDeliveriesPage**    | Skeleton loading, `EmptyState`, existing touch buttons retained                     |

---

## 5. Responsive fixes

| Breakpoint | Fix                                                                |
| ---------- | ------------------------------------------------------------------ |
| 320–430px  | Dialog `w-[calc(100vw-1.5rem)]`, full-width dialog/confirm buttons |
| 375–390px  | Tabs horizontal scroll; table min-width + scroll                   |
| 768px+     | Tables expand to full width inside scroll region                   |
| Desktop    | Unchanged layout; improved spacing via card padding tokens         |

---

## 6. Before / after notes

| Screen            | Before                               | After                                             |
| ----------------- | ------------------------------------ | ------------------------------------------------- |
| Role editor       | Flat bordered boxes, cramped toggles | Grouped domain cards, 44px tap rows, partial pill |
| Fulfillment       | Custom h1 + rigid 2-col tab grid     | `PageHeader` + scroll/wrap tabs                   |
| Driver deliveries | “Loading…” text                      | Skeleton cards + illustrated empty state          |
| Modals            | Could clip on short viewports        | `90dvh` max height + scroll                       |
| Toasts            | Top-right only                       | Top-center on mobile with safe-area               |

---

## 7. Remaining ugly / high-effort screens (pass 2)

| Priority | Screen                      | Notes                        |
| -------- | --------------------------- | ---------------------------- |
| P1       | Admin limits / add-ons      | Dense forms, UUID selectors  |
| P1       | Supplier command center     | KPI density on mobile        |
| P1       | Public booking flow         | Standalone polish pass       |
| P2       | Reservation board           | Calendar + table hybrid      |
| P2       | Product import wizard       | Stepper + error rows         |
| P2       | Billing / Upgrade modal     | Trust copy + spacing         |
| P2       | Disputes / Receiving mobile | Card layouts for tables      |
| P3       | Reports / Analytics charts  | Legend overflow              |
| P3       | Admin tenant detail tabs    | Tab scroll + section headers |

---

## 8. Manual QA checklist

### Global

- [ ] Open app at 375px — no horizontal page scroll
- [ ] Open any modal — fits viewport, scrolls if tall, buttons stack on mobile
- [ ] Toast appears centered on phone, readable width
- [ ] Tab bars scroll horizontally when many tabs (Fulfillment, Settings)

### Roles (Settings → Team → Roles)

- [ ] “New Role” full width on mobile
- [ ] Expand system role — permission groups readable
- [ ] Create role dialog — save/cancel stack on narrow width
- [ ] Users table scrolls horizontally if needed

### Driver

- [ ] Loading shows skeletons
- [ ] Empty state shows icon + copy
- [ ] Status buttons ≥ 44px tall

### Fulfillment

- [ ] Page header consistent with other app pages
- [ ] All five tabs reachable on 320px (scroll)
- [ ] Warehouse filter full width on mobile

---

## 9. Tests / build

```bash
cd apps/web && pnpm test:run
cd apps/web && pnpm typecheck
cd apps/web && pnpm build
```

**2026-05-28 run:**

| Command                    | Result                       |
| -------------------------- | ---------------------------- |
| `pnpm test:run` (apps/web) | **165 passed**               |
| `pnpm typecheck`           | **Pass**                     |
| `pnpm build`               | **Pass** (vite build ~10.6s) |

---

## 10. Recommended next UI pass

1. Adopt `PageHeader` + `page-stack` on top 10 traffic pages (Dashboard, Orders, Products, Settings).
2. Replace raw `<table>` blocks with `TableScroll` + mobile card fallbacks where needed.
3. Public booking: dedicated mobile-first layout (single column, sticky CTA).
4. Admin: section labels + searchable selects instead of raw UUID fields.
5. `UpgradeModal` / `PaymentModal`: spacing, trust badges, loading states.

---

## Files changed (this pass)

**New:** `apps/web/src/components/ui/table-scroll.tsx`, `docs/UI_UX_POLISH_AUDIT.md`

**Updated:** `apps/web/src/index.css`, `main.tsx`, `ui/dialog.tsx`, `ui/tabs.tsx`, `ui/card.tsx`, `ui/button.tsx`, `ui/empty-state.tsx`, `ui/confirm-dialog.tsx`, `RolePermissionChecklist.jsx`, `TeamRolesPanel.jsx`, `FulfillmentPage.tsx`, `DriverDeliveriesPage.tsx`
