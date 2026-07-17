# Orders list laptop density — design

## Problem

On laptop widths the orders table feels cramped: `Order #ID` wraps onto two lines, restaurant names truncate hard, and action buttons stack vertically because labeled buttons wrap.

## Goal

Laptop-first density: one scannable row per order, easy one-click actions, no wasted vertical space.

## Approach

Denser table (keep hybrid cards on small screens).

### Order ID

- Table cell uses `whitespace-nowrap`
- Display `#{{id}}` only in the table (header still “Order”); cards keep full `Order #{{id}}`

### Typography & spacing

- Headers: `text-[11px]` / compact uppercase
- Cells: `text-sm`, `py-2 px-3`
- Total stays emphasized but slightly smaller (`text-sm font-semibold`)

### Actions

- `flex-nowrap` — never stack vertically
- Compact `text-xs` buttons with icons + labels always visible (laptop-first usability)
- Keep `aria-label` + `title` on every action

### Columns

- Relax restaurant truncate (`max-w-[14rem]` + `title` tooltip)
- Raise `tableMinWidth` to ~880 so columns breathe with horizontal scroll when needed
- Table from `lg` (laptop-friendly); cards below `lg`

## Out of scope

- Mobile app changes (web-only density)
- Overflow menus / redesign of card layout beyond leaving it as-is
