# Dashboard Redesign — Design Spec

**Date:** 2026-05-15  
**Status:** Approved  
**Scope:** Full app chrome (Sidebar, Header) + DashboardPage — both Supplier and Restaurant roles

---

## 1. Design Direction

**Style:** Enterprise light-mode with a distinctive signature color identity.  
**Layout:** Classic ERP — white sidebar + light content area. Full-width KPI strip at top, then a 3-column content grid, then a calendar row at the bottom.  
**Differentiator:** Deep Violet & Mint palette — no generic blue. Instantly recognizable and marketing-friendly.

---

## 2. Color System

All colors defined as CSS custom properties on `:root`.

| Token           | Hex       | Usage                                          |
| --------------- | --------- | ---------------------------------------------- |
| `--brand`       | `#5b21b6` | Brand mark, active nav, primary buttons        |
| `--brand-mid`   | `#7c3aed` | KPI icons, chart fills, links                  |
| `--brand-light` | `#a78bfa` | Sparklines (mid), secondary accents            |
| `--brand-pale`  | `#ede9fe` | Active nav background, chip backgrounds        |
| `--brand-ultra` | `#f5f0ff` | Page background, card hover states, search bg  |
| `--mint`        | `#059669` | Completed status, delivery calendar dots       |
| `--mint-mid`    | `#10b981` | Positive KPI deltas, completed bars            |
| `--mint-light`  | `#6ee7b7` | Sparkline mid-tones                            |
| `--mint-pale`   | `#d1fae5` | Mint chip backgrounds, calendar delivery cells |
| `--amber`       | `#d97706` | Pending KPI delta text                         |
| `--amber-mid`   | `#f59e0b` | Pending status bars, order badges              |
| `--amber-pale`  | `#fef3c7` | Amber chip backgrounds, plan indicator         |
| `--red`         | `#dc2626` | Urgent reorder alerts, notification dot        |
| `--red-pale`    | `#fee2e2` | Alert chip backgrounds                         |
| `--bg`          | `#f5f0ff` | Main content area background                   |
| `--surface`     | `#ffffff` | Sidebar, header, all cards                     |
| `--border`      | `#ede8f5` | All card/panel borders                         |
| `--border-mid`  | `#e0d8f0` | Stronger dividers                              |
| `--text`        | `#1e0b3a` | Primary text                                   |
| `--text-mid`    | `#4a3570` | Section titles, nav labels                     |
| `--text-muted`  | `#8b7aaa` | Secondary text, placeholders, descriptions     |

---

## 3. Typography

**Font:** Inter (Google Fonts) — weights 400, 500, 600, 700, 800, 900  
**Monospace:** JetBrains Mono — weights 400, 500 (order IDs, keyboard shortcuts)

| Element          | Size    | Weight                         |
| ---------------- | ------- | ------------------------------ |
| Page title (h1)  | 21px    | 900                            |
| Card title       | 12px    | 700, uppercase, 0.07em spacing |
| KPI value        | 26px    | 900                            |
| KPI label        | 11px    | 600, uppercase                 |
| Nav item         | 13px    | 500 (600 active)               |
| Body / list      | 12–13px | 400–500                        |
| Metadata / muted | 10–11px | 400–500                        |
| Order ID         | 12px    | 700, JetBrains Mono            |

---

## 4. Sidebar (`Sidebar.tsx`)

**Width:** 224px  
**Background:** `#ffffff`  
**Right border:** `1px solid var(--border)`

### Brand Block

- Logo mark: 36×36px, `border-radius: 10px`, `linear-gradient(140deg, #7c3aed, #5b21b6)`, box-shadow with violet glow
- SVG: hexagon wireframe mark (existing Supplify geometry)
- Brand name: 16px / 800 / `#1e0b3a`, letter-spacing -0.04em
- Tagline: "Enterprise ERP", 10px / 500 / `var(--text-muted)`
- Bottom border: `1px solid var(--border)`

### Navigation

Nav items grouped into 4 sections with uppercase section labels (`9.5px / 700 / #d4c8f0`):

- **Overview:** Dashboard
- **Operations:** Orders (amber badge with pending count), Products, Fulfillment, Reservations
- **Intelligence:** Analytics (violet "New" badge), Notifications (red alert badge when unread)
- **Account:** Branches, Settings

**Nav item anatomy:**

- Icon container: 30×30px, `border-radius: 7px`, `background: #f5f0ff` (inactive) / `#ede9fe` (active)
- Icon: 14×14px SVG, `var(--text-muted)` (inactive) / `var(--brand)` (active)
- Label: 13px / 500 (inactive) / 600 (active)
- Active state: `background: var(--brand-pale)`, `color: var(--brand)`, left accent bar `3px wide / var(--mint-mid) / border-radius 0 3px 3px 0`
- Hover: `background: var(--brand-ultra)`, `color: var(--text-mid)`

### Footer

User pill: avatar (32px circle, gradient `var(--brand)` → `var(--mint-mid)`), display name, role label, Gold plan indicator badge (amber).

---

## 5. Header (`Header.tsx`)

**Height:** 56px  
**Background:** `#ffffff`  
**Bottom border:** `1px solid var(--border)`  
**Padding:** `0 22px`

**Left:** Breadcrumb — muted parent ("Supplify") + separator + bold current page name  
**Center-right:**

- Search bar: 200px wide, `background: var(--brand-ultra)`, violet border on hover, `⌘K` kbd shortcut in JetBrains Mono
- Notification bell button: 36×36px, `border-radius: 9px`, red dot badge when unread
- Settings/theme toggle button: same dimensions
- User avatar: 34px circle, gradient, double-ring border (`2px white + 1px border`)

---

## 6. Dashboard Page (`DashboardPage.tsx`)

**Background:** `var(--bg)` (`#f5f0ff`)  
**Padding:** `20px 22px 28px`  
**Layout:** flex column, `gap: 16px`

### Page Heading

- Left: `h1` greeting with name + sun emoji, subtitle with date / role / plan
- Right: Period selector (7d / 30d / 90d) — pill tabs, active state uses `var(--brand)` fill. **UI-only for now** — no API filtering; selected value is local state only, can be wired to API in a future iteration.

### KPI Cards (4 cards, full-width grid)

Each card:

- `background: white`, `border: 1px solid var(--border)`, `border-radius: 12px`, `padding: 15px`
- Hover: `translateY(-1px)` + elevated violet shadow
- **Top row:** uppercase label (muted) + colored icon badge (32×32px, `border-radius: 8px`)
- **Value:** 26px / 900
- **Meta row:** colored delta (↑/↓/⚠) + muted context text
- **Sparkline:** 7-bar gradient chart, `height: 26px`, bars ramp from pale to saturated matching each KPI's color

**Supplier KPIs:** Revenue (violet), Orders (mint), Pending (amber), Restaurants (violet)  
**Restaurant KPIs:** Total Spent (violet), My Orders (mint), Pending (amber), Suppliers (violet)

### Content Row (3-column grid: `5fr 3fr 4fr`)

**Col 1 — Recent Orders card:**

- Mini area chart (7 bars, violet palette), `height: 48px`
- Order list: 3 most recent orders
- Each row: monospace order ID + customer name (left), amount + status chip (right)
- Status chips: PLACED (violet pale), SHIPPED (mint pale), PROCESSING (amber pale)
- Supplier: shows restaurant customer name. Restaurant: shows "From: [Supplier name]"

**Col 2 — Order Status (Supplier) / Spend Trend (Restaurant):**

- Supplier: Labeled progress bars with colored dots — Completed / Processing / Pending / Shipped (uses `stats.completedOrders`, `stats.pendingOrders` etc.)
- Restaurant: 30-day spend trend mini bar chart using existing `useGetInvoiceAnalyticsQuery({ period: 30 })` data (per-date totals). A per-supplier breakdown is not available from the current API and is out of scope.

**Col 3 — Reorder Alerts (both roles):**

- Compact list of top 3 reorder suggestions
- Left urgency bar (5px wide): red = urgent, amber = high, mint = medium
- "+ Add" button: violet pale bg, adds to first quick list
- "Add all →" header link

### Calendar Row

- Full-width card, `border-radius: 12px`
- 7-column day grid with Mon–Sun labels
- Day cell states: default (`var(--brand-ultra)`), has-order (`var(--brand-pale)` / violet text), delivery (`var(--mint-pale)` / mint text), today (filled `var(--brand)` circle)
- Legend row: Order placed · Delivery scheduled · Today

### Role-Specific Differences

| Section         | Supplier                 | Restaurant                |
| --------------- | ------------------------ | ------------------------- |
| KPI 1           | Revenue                  | Total Spent               |
| KPI 4           | Restaurants (customers)  | Suppliers (vendors)       |
| Col 2           | Order status bars        | Spend by supplier bars    |
| Empty state CTA | "Add your first product" | "Create your first order" |

### Admin View (not impersonating)

Unchanged from current — simple card pointing to `/app/admin`. No redesign needed.

---

## 7. Loading & Error States

**Loading:** Skeleton cards matching the new layout (4 KPI skeletons + 3-col content skeletons + calendar skeleton), using `--brand-ultra` as skeleton background.  
**Error:** Centered error message in brand text color.  
**Empty KPIs:** Show `0` with no delta row (no `↑ NaN%`).

---

## 8. Files to Change

| File                                   | Change                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web/src/components/Sidebar.tsx`  | Full rewrite — new structure, violet palette                               |
| `apps/web/src/components/Header.tsx`   | Rewrite — new search bar, button styles, avatar                            |
| `apps/web/src/components/Layout.tsx`   | Update `bg-gray-50` → `bg-[#f5f0ff]`, add CSS variable injection           |
| `apps/web/src/pages/DashboardPage.tsx` | Full rewrite — new layout, KPI cards with sparklines, 3-col grid, calendar |
| `apps/web/src/index.css` (or global)   | Add `:root` CSS custom properties for the color system                     |

No new routes, no API changes, no new dependencies (Recharts stays, shadcn/ui components stay but are restyled via Tailwind overrides and CSS variables).

---

## 9. Out of Scope

- Other pages (OrderDetailPage, SettingsPage, etc.) — dashboard only
- Dark mode toggle
- Animations / transitions beyond hover states
- Mobile / responsive layout
- Any backend or API changes
