# Responsive data lists (hybrid card / table)

Canonical web pattern for operational list pages that must work on phone, tablet, and laptop.

## Component

`apps/web/src/components/ui/responsive-data-list.tsx` exports:

- `ResponsiveDataList<T>` — renders **both** a card list and a table; CSS breakpoints show one at a time
- `responsiveDataListClasses` — shared Tailwind helpers for column density and action labels
- `CardBreakpoint`: `'md' | 'lg' | 'xl'` (default **`xl`**)

`DataTableShell` is separate: it wraps search / filters / actions chrome. Hybrid card↔table switching belongs on `ResponsiveDataList`, not the shell.

## Viewport tiers

| Tier          | Tailwind               | Width | Typical use                                         |
| ------------- | ---------------------- | ----: | --------------------------------------------------- |
| Cards         | below `cardBreakpoint` |     — | Phone / tablet (and laptop when breakpoint is `xl`) |
| Compact table | at `cardBreakpoint`    |     — | Scannable rows; secondary columns may still hide    |
| Full density  | `xl` (1280px+)         |     — | Tertiary columns + labeled actions via helpers      |

Breakpoints:

- `md` = 768px
- `lg` = 1024px (laptop)
- `xl` = 1280px (desktop)

## Class helpers

| Helper                                     | Behavior                                                      |
| ------------------------------------------ | ------------------------------------------------------------- |
| `columnSecondary`                          | `hidden lg:table-cell` — stock, status, restaurant name, etc. |
| `columnTertiary`                           | `hidden xl:table-cell` — metadata, tags, secondary dates      |
| `actionLabel`                              | `hidden xl:inline` — icon-first actions on compact tables     |
| `cardContainer(bp)` / `tableContainer(bp)` | Toggle card vs table visibility for the chosen breakpoint     |

Inside cards, use `CardActionGrid` / flex-wrap — never viewport breakpoints for in-card action layout.

## Page conventions

| Surface                         | `cardBreakpoint`   | Notes                                                                                                               |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Orders (`OrdersResponsiveList`) | **`lg`**           | Laptop-first density (2026-07-17): compact type/padding, `#ID` nowrap, `flex-nowrap` actions, `tableMinWidth={880}` |
| Supplier inventory / disputes   | **`lg`**           | Table usable on laptop widths                                                                                       |
| Product catalog                 | **`xl`** (default) | Cards through laptop; table when wide enough                                                                        |
| Contract pricing                | default **`xl`**   | Same hybrid pattern                                                                                                 |

Design note for orders: [../superpowers/specs/2026-07-17-orders-list-laptop-density-design.md](../superpowers/specs/2026-07-17-orders-list-laptop-density-design.md).

## Testing

Responsive layout is asserted via **compile-time class strings**, not runtime media queries:

- `apps/web/src/test/viewports.ts` — `expectLgCardTableSplit`, `expectXlCardTableSplit`
- Examples: `OrdersPage.responsive.test.tsx`, `InventoryPage.responsive.test.tsx`, `ProductCatalogTable.responsive.test.tsx`, `Layout.responsive.test.tsx`

## Mobile parity

Web density changes do not require mobile app UI changes. Document web-only layout work in [../mobile/MOBILE_FEATURE_PARITY.md](../mobile/MOBILE_FEATURE_PARITY.md) (see **2026-07-17 — Orders list laptop density**).
