# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Supplify ERP app chrome (Sidebar, Header, Layout) and DashboardPage with a Deep Violet & Mint enterprise palette — white sidebar, grouped navigation, KPI cards with sparklines, 3-column content grid, and a calendar row.

**Architecture:** CSS custom properties drive the entire color system; Sidebar and Header are full rewrites preserving all existing logic (role-based nav, permissions, notifications, logout); DashboardPage replaces the current gradient-banner layout with a structured ERP grid that reuses all existing RTK Query hooks.

**Tech Stack:** React + TypeScript, Tailwind CSS, CSS custom properties, Recharts (BarChart/ResponsiveContainer), shadcn/ui (Card, Badge, Button, Skeleton), Lucide React, React Router, RTK Query hooks.

---

## File Map

| File | Action |
|------|--------|
| `apps/web/src/index.css` | Add `:root` design tokens + Google Fonts @import |
| `apps/web/src/components/Layout.tsx` | 1-line bg change: `bg-gray-50` → `bg-[var(--bg)]` |
| `apps/web/src/components/Sidebar.tsx` | Full rewrite — grouped nav, violet active states, brand block, user footer |
| `apps/web/src/components/Header.tsx` | Full rewrite — breadcrumb, ⌘K search, notification bell, settings icon, avatar |
| `apps/web/src/pages/DashboardPage.tsx` | Full rewrite — 4-KPI grid with sparklines, 3-col content row, calendar |

---

## Task 1: CSS Design Tokens + Font Import

**Files:**
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Add Google Fonts import and design tokens**

Add at the very top of `apps/web/src/index.css` (before `@tailwind base`):

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
```

Then inside the existing `@layer base { :root { ... } }` block, append these tokens after `--radius: 0.5rem;`:

```css
    /* Supplify brand tokens */
    --brand: #5b21b6;
    --brand-mid: #7c3aed;
    --brand-light: #a78bfa;
    --brand-pale: #ede9fe;
    --brand-ultra: #f5f0ff;
    --mint: #059669;
    --mint-mid: #10b981;
    --mint-light: #6ee7b7;
    --mint-pale: #d1fae5;
    --amber: #d97706;
    --amber-mid: #f59e0b;
    --amber-pale: #fef3c7;
    --red: #dc2626;
    --red-pale: #fee2e2;
    --bg: #f5f0ff;
    --surface: #ffffff;
    --border: #ede8f5;
    --border-mid: #e0d8f0;
    --text: #1e0b3a;
    --text-mid: #4a3570;
    --text-muted: #8b7aaa;
```

Also add Inter as the base body font at the bottom of `@layer base`:

```css
  body {
    font-family: 'Inter', system-ui, sans-serif;
  }
```

- [ ] **Step 2: Verify no TS/build errors** — tokens are pure CSS, no compilation needed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/index.css
git commit -m "style: add supplify violet/mint design tokens and Inter font"
```

---

## Task 2: Layout.tsx Background Update

**Files:**
- Modify: `apps/web/src/components/Layout.tsx:65`

- [ ] **Step 1: Change page background color**

In `Layout.tsx` line 65, change:
```tsx
<div className="min-h-screen bg-gray-50">
```
to:
```tsx
<div className="min-h-screen" style={{ background: 'var(--bg)' }}>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/Layout.tsx
git commit -m "style: update layout background to brand-ultra violet"
```

---

## Task 3: Sidebar.tsx — Full Rewrite

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`

Key requirements:
- Width 224px, white background, right border `1px solid var(--border)`
- Brand block: gradient logo mark + "Supplify" / "Enterprise ERP"
- Navigation: grouped into sections (OVERVIEW / OPERATIONS / ACCOUNT) with role-based items
- Active state: `var(--brand-pale)` bg + `var(--brand)` text + 3px left mint accent bar
- Hover state: `var(--brand-ultra)` bg
- Orders link: amber badge with `stats.pendingOrders` count
- Notification badge on bell/notifications if unread
- User footer: avatar circle with gradient, display name, role, plan badge
- Preserve ALL `data-testid` attributes
- Preserve ALL permission checks and role logic

- [ ] **Step 1: Write the new Sidebar.tsx**

```tsx
import { Link, useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import {
  useGetImpersonationStatusQuery,
  useGetNotificationsQuery,
  useGetDashboardStatsQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Building2,
  Settings,
  MessageSquare,
  ShoppingBag,
  Truck,
  FileText,
  List,
  Package2,
  PackageCheck,
  Shield,
  CalendarDays,
  UserCircle2,
} from 'lucide-react'

type NavItem = {
  name: string
  href: string
  icon: any
  permission?: string
  badge?: 'pending' | 'unread' | { label: string; color: string }
  testId?: string
}

type NavSection = { label: string; items: NavItem[] }

export function Sidebar() {
  const location = useLocation()
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const { data: impersonation } = useGetImpersonationStatusQuery(undefined, {
    skip: user?.role !== 'ADMIN',
  })
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !user || user.role === 'ADMIN',
  })
  const { data: statsData } = useGetDashboardStatsQuery(undefined, {
    skip: user?.role === 'ADMIN' && !impersonation?.active,
  })
  const { data: notificationsData } = useGetNotificationsQuery(
    { limit: 10, offset: 0 },
    { skip: !user, pollingInterval: 60000 }
  )

  const isPlatformAdmin =
    user?.role === 'ADMIN' &&
    Array.isArray(user?.adminPermissions) &&
    user.adminPermissions.length > 0 &&
    (user.adminPermissions.includes('ADMIN_ACCESS') ||
      user.adminPermissions.includes('ADMIN_TENANTS'))
  const isAdmin = isPlatformAdmin
  const isSupplier = user?.role === 'SUPPLIER'
  const isRestaurant = user?.role === 'RESTAURANT'
  const impersonatingRestaurant =
    isPlatformAdmin && impersonation?.active && impersonation?.tenantType === 'RESTAURANT'
  const impersonatingSupplier =
    isPlatformAdmin && impersonation?.active && impersonation?.tenantType === 'SUPPLIER'

  const pendingOrders = Number(statsData?.pendingOrders) || 0
  const unreadCount = (notificationsData?.notifications || []).filter(
    (n: { is_read?: boolean }) => !n.is_read
  ).length
  const planCode = (entitlementsData?.entitlements?.plan?.code ?? 'free').toLowerCase()
  const planLabel = entitlementsData?.entitlements?.plan?.name ?? 'Free'

  // Build sections based on role
  let sections: NavSection[] = []

  if (isRestaurant || impersonatingRestaurant) {
    const ops: NavItem[] = [
      { name: 'Orders', href: '/app/orders', icon: ShoppingCart, badge: 'pending', testId: 'nav-orders' },
      { name: 'Products', href: '/app/products', icon: Package, testId: 'nav-products' },
      { name: 'Quick Lists', href: '/app/quick-lists', icon: List, testId: 'nav-quick-lists' },
      { name: 'Cart', href: '/app/cart', icon: ShoppingBag, testId: 'nav-cart' },
      { name: 'Reservations', href: '/app/reservations', icon: CalendarDays, permission: 'RESERVATIONS_VIEW', testId: 'nav-reservations' },
      { name: 'Receiving', href: '/app/receiving', icon: PackageCheck, testId: 'nav-receiving' },
    ].filter((item) => !item.permission || can(item.permission))

    const intel: NavItem[] = [
      { name: 'Suppliers', href: '/app/suppliers', icon: Building2, testId: 'nav-suppliers' },
      { name: 'Invoices', href: '/app/invoices', icon: FileText, permission: 'INVOICES_VIEW', testId: 'nav-invoices' },
      { name: 'Chat', href: '/app/chat', icon: MessageSquare, testId: 'nav-chat' },
    ].filter((item) => !item.permission || can(item.permission))

    const acct: NavItem[] = [
      { name: 'Staff', href: '/app/staff', icon: UserCircle2, permission: 'STAFF_VIEW', testId: 'nav-staff' },
      { name: 'Inventory', href: '/app/restaurant-inventory', icon: Package2, permission: 'INVENTORY_VIEW', testId: 'nav-inventory' },
      { name: 'Settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' },
    ].filter((item) => !item.permission || can(item.permission))

    sections = [
      { label: 'OVERVIEW', items: [{ name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, testId: 'nav-dashboard' }] },
      { label: 'OPERATIONS', items: ops },
      ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
      { label: 'ACCOUNT', items: acct },
    ]
  } else if (isPlatformAdmin && !impersonation?.active) {
    sections = [
      {
        label: 'ADMIN',
        items: [
          { name: 'Admin Dashboard', href: '/app/admin', icon: Shield, testId: 'nav-admin-dashboard' },
          { name: 'Supplier Admin', href: '/app/admin/suppliers', icon: Building2, testId: 'nav-supplier-admin' },
          { name: 'Restaurant Admin', href: '/app/admin/restaurants', icon: Users, testId: 'nav-restaurant-admin' },
        ],
      },
      {
        label: 'ACCOUNT',
        items: [{ name: 'Settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' }],
      },
    ]
  } else if (isSupplier || impersonatingSupplier) {
    const ops: NavItem[] = [
      { name: 'Orders', href: '/app/orders', icon: ShoppingCart, badge: 'pending', testId: 'nav-orders' },
      { name: 'Products', href: '/app/products', icon: Package, testId: 'nav-products' },
      { name: 'Fulfillment', href: '/app/fulfillment', icon: Truck, testId: 'nav-fulfillment' },
      { name: 'Restaurants', href: '/app/restaurants', icon: Users, testId: 'nav-restaurants' },
    ]
    const intel: NavItem[] = [
      { name: 'Invoices', href: '/app/invoices', icon: FileText, permission: 'INVOICES_VIEW', testId: 'nav-invoices' },
      { name: 'Chat', href: '/app/chat', icon: MessageSquare, testId: 'nav-chat' },
    ].filter((item) => !item.permission || can(item.permission))

    sections = [
      { label: 'OVERVIEW', items: [{ name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, testId: 'nav-dashboard' }] },
      { label: 'OPERATIONS', items: ops },
      ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
      { label: 'ACCOUNT', items: [{ name: 'Settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' }] },
    ]
  }

  const initials = (user?.displayName || user?.email || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div
      data-testid="sidebar"
      style={{
        width: 224,
        minWidth: 224,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Brand block */}
      <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(140deg, #7c3aed, #5b21b6)',
              boxShadow: '0 2px 12px rgba(91,33,182,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <polygon points="9,1 17,5 17,13 9,17 1,13 1,5" stroke="white" strokeWidth="1.5" fill="none" />
              <polygon points="9,4 14,7 14,11 9,14 4,11 4,7" stroke="rgba(255,255,255,0.5)" strokeWidth="1" fill="none" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
              Supplify
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)' }}>
              Enterprise ERP
            </div>
          </div>
        </div>
      </div>

      {/* Navigation sections */}
      <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sections.map((section) => (
          <div key={section.label} style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#d4c8f0',
                letterSpacing: '0.08em',
                padding: '8px 6px 4px',
              }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = location.pathname === item.href
              const showPendingBadge = item.badge === 'pending' && pendingOrders > 0
              const showUnreadBadge = item.badge === 'unread' && unreadCount > 0

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  data-testid={item.testId || `nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 8px',
                    height: 34,
                    borderRadius: 7,
                    textDecoration: 'none',
                    position: 'relative',
                    background: isActive ? 'var(--brand-pale)' : 'transparent',
                    color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 13,
                    transition: 'background 0.15s, color 0.15s',
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'var(--brand-ultra)'
                      ;(e.currentTarget as HTMLElement).style.color = 'var(--text-mid)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                    }
                  }}
                >
                  {/* Active left bar */}
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 3,
                        height: 18,
                        borderRadius: '0 3px 3px 0',
                        background: 'var(--mint-mid)',
                      }}
                    />
                  )}
                  {/* Icon */}
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      background: isActive ? 'var(--brand-pale)' : 'var(--brand-ultra)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <item.icon
                      size={14}
                      style={{ color: isActive ? 'var(--brand)' : 'var(--text-muted)' }}
                    />
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                  {/* Badges */}
                  {showPendingBadge && (
                    <span
                      style={{
                        background: 'var(--amber-mid)',
                        color: '#000',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: '1px 6px',
                        minWidth: 18,
                        textAlign: 'center',
                      }}
                    >
                      {pendingOrders > 99 ? '99+' : pendingOrders}
                    </span>
                  )}
                  {showUnreadBadge && (
                    <span
                      style={{
                        background: 'var(--red)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: '1px 6px',
                        minWidth: 18,
                        textAlign: 'center',
                      }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--brand), var(--mint-mid))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.displayName || user?.email}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
            {user?.role?.toLowerCase()}
          </div>
        </div>
        {planCode !== 'free' && (
          <span
            style={{
              background: 'var(--amber-pale)',
              color: 'var(--amber)',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 4,
              padding: '2px 6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {planLabel}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx
git commit -m "feat(sidebar): redesign with violet palette, grouped nav, brand block, user footer"
```

---

## Task 4: Header.tsx — Rewrite

**Files:**
- Modify: `apps/web/src/components/Header.tsx`

Key requirements:
- Height 56px, white background, bottom border `1px solid var(--border)`
- Left: breadcrumb (muted "Supplify" + separator + bold current page)
- Right: BranchSwitcher | Upgrade button | Search bar (200px, ⌘K) | Notification bell (with red dot) | Settings icon | Avatar circle
- Preserve ALL existing notification panel logic (dropdown, mark-all-as-read, WhatsApp links)
- Preserve logout/navigation logic
- Keep `data-testid="header"`

The current page name for breadcrumb is derived from `useLocation()` pathname.

- [ ] **Step 1: Write new Header.tsx**

The Header preserves all existing state and API hooks, just replaces the JSX with the new design. Key new elements:
- Breadcrumb: map pathname to page name
- Search bar: visual-only 200px input with ⌘K kbd hint (no functionality yet)
- Notification bell: existing bell logic wrapped in new 36×36 button style
- Settings/theme icon: link to /app/settings
- Avatar: 34px gradient circle

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/Header.tsx
git commit -m "feat(header): redesign with breadcrumb, search bar, notification bell, avatar"
```

---

## Task 5: DashboardPage.tsx — Full Rewrite

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

Key requirements:
- Preserve ALL existing data hooks: useGetDashboardStatsQuery, useGetOrdersQuery, useGetReorderSuggestionsQuery, useGetInvoiceAnalyticsQuery, useGetProductCategoriesQuery, useGetQuickListsQuery, useAddItemToQuickListMutation, useGetImpersonationStatusQuery
- Preserve admin-not-impersonating early return (simple CTA card)
- Preserve loading skeleton and error state
- Preserve post-onboarding empty state CTAs
- New layout: page heading row | 4-col KPI grid | 3-col content row (5fr 3fr 4fr) | calendar
- KPI cards: sparkline bars, colored icon badges, delta row
- Col 1: recent orders with mini bar chart + order list with status chips
- Col 2 (Supplier): order status progress bars | (Restaurant): spend trend bar chart
- Col 3: reorder alerts with urgency bars + add button
- Calendar row: uses existing `<CalendarView>` component

Sparkline data: generate 7 synthetic bars based on available stats for visual interest.
- Revenue sparkline: ramp from 40% to 100% of totalRevenue/7
- Orders sparkline: last 7 orders amounts from recentOrders
- Pending sparkline: synthetic ramp from amber palette
- Restaurants/Suppliers sparkline: static ramp

- [ ] **Step 1: Write new DashboardPage.tsx**

Full rewrite preserving all data logic, replacing only the rendered JSX.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): redesign with KPI grid, sparklines, 3-col layout, calendar row"
```

---

## Post-Implementation Checklist

- [ ] Visit /app/dashboard as Supplier role — verify 4 KPI cards, order status bars, reorder alerts, calendar
- [ ] Visit /app/dashboard as Restaurant role — verify Total Spent KPI, spend trend chart, reorder alerts
- [ ] Verify admin-not-impersonating view unchanged
- [ ] Verify sidebar active states highlight correctly across pages
- [ ] Verify notification bell dropdown still works in header
- [ ] Verify logout button still works
- [ ] Verify all data-testid attributes preserved (`nav-dashboard`, `nav-orders`, etc.)
