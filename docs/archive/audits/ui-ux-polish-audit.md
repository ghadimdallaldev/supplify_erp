# UI/UX Polish Audit

**Date:** 2026-05-28  
**Goal:** Premium, clean, modern SaaS feel — incremental polish without business-logic changes.  
**Brand:** Keep existing purple/clean Supplify direction.

---

## Executive summary

| Area                      | Status                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Design system (shared UI) | **Improved** — dialogs, tabs, cards, empty states, tables, utilities                           |
| Responsive (320–desktop)  | **Improved** — modals, action bars, tabs scroll, touch targets                                 |
| High-impact screens       | **Polished** — roles editor, fulfillment, driver, command center, admin limits, public booking |
| Full app sweep            | **Partial** — pass 3 done for reservations/receiving/disputes                                  |

---

## 1. Pages audited (inventory)

### Restaurant (sampled + grep patterns)

| Page                               | Audited |          Polished this pass          |
| ---------------------------------- | :-----: | :----------------------------------: |
| Dashboard                          |    ✓    |   — (uses existing dashboard CSS)    |
| Suppliers marketplace              |    ✓    |                  —                   |
| Cart / Orders / Order detail       |    ✓    |                  —                   |
| Receiving / Disputes               |    ✓    |           **Yes** (pass 3)           |
| Invoices / Quick lists / Inventory |    ✓    |                  —                   |
| Reservations / Public booking      |    ✓    | **Yes** (portal pass 2; page pass 3) |
| Settings / Subscription            |    ✓    |                  —                   |

### Supplier

| Page                          | Audited |    Polished this pass    |
| ----------------------------- | :-----: | :----------------------: |
| Command center                |    ✓    |         **Yes**          |
| Products / Import             |    ✓    |            —             |
| Fulfillment & logistics       |    ✓    |         **Yes**          |
| Driver deliveries             |    ✓    |         **Yes**          |
| Warehouses / Invoices / Deals |    ✓    |            —             |
| Settings / Team & roles       |    ✓    | **Yes** (TeamRolesPanel) |

### Admin

| Page                                | Audited | Polished this pass |
| ----------------------------------- | :-----: | :----------------: |
| Overview / Tenants / Plans / Limits |    ✓    |  **Yes** (limits)  |
| Features / Finance / Audit          |    ✓    |         —          |

### Public

| Page                          | Audited | Polished this pass |
| ----------------------------- | :-----: | :----------------: |
| Public reservation / Waitlist |    ✓    |      **Yes**       |

---

## 2. Issues found (before)

| Category     | Issue                                                        |
| ------------ | ------------------------------------------------------------ |
| Modals       | Fixed height on small screens; footers cramped on mobile     |
| Tabs         | Fulfillment grid cramped; overflow on 320px                  |
| Tables       | Team roles table could overflow without consistent wrapper   |
| Empty states | Plain dashed boxes; weak hierarchy                           |
| Role editor  | Dense permission rows; small checkboxes on mobile            |
| Driver page  | Text-only loading; plain empty card                          |
| Toasts       | Top-right clipped on narrow phones                           |
| Cards        | Heavy `p-6` on mobile                                        |
| Actions      | Header buttons not full-width on mobile where needed         |
| Public flow  | Booking split view lacked a clear summary and trust cues     |
| Admin forms  | Limit/add-on controls felt dense for high-frequency edits    |
| Command hub  | Priorities and quick actions needed stronger visual grouping |

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

| Page / area                    | Improvements                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| **TeamRolesPanel**             | `TableScroll`, responsive card header, role list cards, empty state, dialog footers     |
| **RolePermissionChecklist**    | Domain cards, touch-friendly rows, partial badge                                        |
| **FulfillmentPage**            | `PageHeader`, warehouse filter styling, scrollable tabs                                 |
| **DriverDeliveriesPage**       | Skeleton loading, `EmptyState`, existing touch buttons retained                         |
| **AdminLimitsTab**             | `PageHeader`, consistent selects, `TableScroll` tables, mobile-safe action buttons      |
| **SupplierCommandCenter**      | `PageHeader`, grouped quick actions, stronger section cards, polished empty states      |
| **PublicReservationPortal**    | Premium booking hero, sticky details card, improved slot UX, clearer booking summary    |
| **UpgradeModal**               | Better card spacing and full-width mobile CTA controls                                  |
| **ReservationsPage** (pass 3)  | `PageHeader`, `page-stack`, booking link wrap, waitlist `EmptyState`, board skeletons   |
| **ReceivingPage** (pass 3)     | `page-stack`, scrollable tabs, history `EmptyState`/skeletons, responsive history cards |
| **DisputesPage** (pass 3)      | Mobile dispute cards, `TableScroll` on md+, filter styling, dialog footers              |
| **DisputeDetailPage** (pass 3) | Line items as mobile cards + `TableScroll` on md+                                       |
| **DisputeListCards** (new)     | Reusable mobile card list for dispute rows                                              |

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

## 7. Remaining ugly / high-effort screens

| Priority | Screen                          | Notes                                                     |
| -------- | ------------------------------- | --------------------------------------------------------- |
| P1       | Reservation board (component)   | Calendar + table hybrid readability in `ReservationBoard` |
| P1       | Product import wizard           | Stepper clarity + error affordances                       |
| ~~P1~~   | ~~Receiving / disputes mobile~~ | **Done (pass 3)** — cards + scroll tables                 |
| P2       | Payment modal                   | Stronger trust layout + failure states                    |
| P2       | Reports / analytics charts      | Legend overflow + axis label truncation                   |
| P2       | Admin tenant detail tabs        | Section hierarchy + sticky action rows                    |
| P3       | Dashboard dense widgets         | Spacing rhythm consistency                                |

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

### Admin limits

- [ ] Select tenant and verify all override tables scroll cleanly on 320–390px
- [ ] Add-on quantity +/- remains tappable without overlap on mobile
- [ ] Plan and tenant override save buttons wrap without clipping

### Supplier command center

- [ ] Quick actions wrap cleanly with no clipped labels at 320px
- [ ] Empty states for priorities/reorder render as polished cards
- [ ] Reorder action buttons stack safely on mobile

### Public booking

- [ ] Hero and booking cards remain readable at 320px
- [ ] Time slot buttons remain tappable (>=44px target)
- [ ] Booking summary updates when slot/date/party size changes
- [ ] Waitlist panel remains understandable when slots are full

---

## 9. Tests / build

```bash
cd apps/web && pnpm test:run
cd apps/web && pnpm typecheck
cd apps/web && pnpm build
```

**2026-05-29 run:**

| Command                    | Result                       |
| -------------------------- | ---------------------------- |
| `pnpm test:run` (apps/web) | **165 passed**               |
| `pnpm typecheck`           | **Pass**                     |
| `pnpm build`               | **Pass** (vite build ~10.6s) |

---

## 10. Recommended next UI pass

1. ~~Apply card-based mobile layouts to `Receiving`, `Disputes`, and `Reservations` dense rows.~~ (pass 3)
2. Introduce compact chart legends and responsive axis labels in analytics/reporting pages.
3. Polish `PaymentModal` with stronger trust framing and failure-state clarity.
4. Standardize all admin tabs on `PageHeader`, `section-label`, and consistent action bars.
5. Add visual regression snapshots for key breakpoints (320, 390, 768, desktop).

---

## Files changed (this pass)

**New:** `apps/web/src/components/ui/table-scroll.tsx`, `docs/UI_UX_POLISH_AUDIT.md`

**Updated:** `apps/web/src/index.css`, `main.tsx`, `ui/dialog.tsx`, `ui/tabs.tsx`, `ui/card.tsx`, `ui/button.tsx`, `ui/empty-state.tsx`, `ui/confirm-dialog.tsx`, `RolePermissionChecklist.jsx`, `TeamRolesPanel.jsx`, `FulfillmentPage.tsx`, `DriverDeliveriesPage.tsx`, `components/admin/AdminLimitsTab.tsx`, `pages/SupplierCommandCenterPage.tsx`, `pages/PublicReservationPortal.tsx`, `components/UpgradeModal.tsx`, `pages/ReservationsPage.tsx`, `pages/ReceivingPage.tsx`, `pages/disputes/DisputesPage.tsx`, `pages/disputes/DisputeDetailPage.tsx`, `components/disputes/DisputeListCards.tsx`
