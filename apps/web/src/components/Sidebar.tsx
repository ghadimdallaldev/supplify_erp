import { Link, useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import {
  useGetImpersonationStatusQuery,
  useGetNotificationsQuery,
  useGetDashboardStatsQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { SupplifyLogo } from './SupplifyLogo'
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
  ClipboardCheck,
  BarChart3,
  Scale,
  Tag,
  Percent,
} from 'lucide-react'
import { featureEnabled, getOrderUsageBadge } from '../lib/planLimits'

type NavItem = {
  name: string
  href: string
  icon: any
  permission?: string
  badge?: 'pending' | 'unread'
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
  const planLabel = entitlementsData?.entitlements?.plan?.name ?? ''
  const planCode = (entitlementsData?.entitlements?.plan?.code ?? 'free').toLowerCase()
  const approvalsEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.approvals_budgets
  )
  const reportsEnabled = featureEnabled(entitlementsData?.entitlements?.features?.reports)
  const supplierDealsEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.supplier_deals
  )
  const disputesEnabled = featureEnabled(entitlementsData?.entitlements?.features?.disputes_returns)
  const promotionsEnabled = featureEnabled(entitlementsData?.entitlements?.features?.promotions)
  const orderUsageBadge = getOrderUsageBadge(entitlementsData?.entitlements)

  let sections: NavSection[] = []

  if (isRestaurant || impersonatingRestaurant) {
    const ops: NavItem[] = [
      {
        name: 'Orders',
        href: '/app/orders',
        icon: ShoppingCart,
        badge: 'pending' as const,
        testId: 'nav-orders',
      },
      { name: 'Products', href: '/app/products', icon: Package, testId: 'nav-products' },
      { name: 'Quick Lists', href: '/app/quick-lists', icon: List, testId: 'nav-quick-lists' },
      { name: 'Cart', href: '/app/cart', icon: ShoppingBag, testId: 'nav-cart' },
      {
        name: 'Reservations',
        href: '/app/reservations',
        icon: CalendarDays,
        permission: 'RESERVATIONS_VIEW',
        testId: 'nav-reservations',
      },
      { name: 'Receiving', href: '/app/receiving', icon: PackageCheck, testId: 'nav-receiving' },
    ].filter((item) => !item.permission || can(item.permission))

    const intel: NavItem[] = [
      { name: 'Suppliers', href: '/app/suppliers', icon: Building2, testId: 'nav-suppliers' },
      ...(approvalsEnabled
        ? [
            {
              name: 'Approvals',
              href: '/app/approvals',
              icon: ClipboardCheck,
              testId: 'nav-approvals',
            },
          ]
        : []),
      ...(reportsEnabled
        ? [{ name: 'Reports', href: '/app/reports', icon: BarChart3, testId: 'nav-reports' }]
        : []),
      ...(disputesEnabled
        ? [{ name: 'Disputes', href: '/app/disputes', icon: Scale, testId: 'nav-disputes' }]
        : []),
      ...(supplierDealsEnabled
        ? [{ name: 'Deals', href: '/app/deals', icon: Percent, testId: 'nav-deals' }]
        : []),
      {
        name: 'Invoices',
        href: '/app/invoices',
        icon: FileText,
        permission: 'INVOICES_VIEW',
        testId: 'nav-invoices',
      },
      { name: 'Chat', href: '/app/chat', icon: MessageSquare, testId: 'nav-chat' },
    ].filter((item) => !item.permission || can(item.permission))

    const acct: NavItem[] = [
      {
        name: 'Staff',
        href: '/app/staff',
        icon: UserCircle2,
        permission: 'STAFF_VIEW',
        testId: 'nav-staff',
      },
      {
        name: 'Inventory',
        href: '/app/restaurant-inventory',
        icon: Package2,
        permission: 'INVENTORY_VIEW',
        testId: 'nav-inventory',
      },
      { name: 'Settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' },
    ].filter((item) => !item.permission || can(item.permission))

    sections = [
      {
        label: 'OVERVIEW',
        items: [
          {
            name: 'Dashboard',
            href: '/app/dashboard',
            icon: LayoutDashboard,
            testId: 'nav-dashboard',
          },
        ],
      },
      { label: 'OPERATIONS', items: ops },
      ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
      { label: 'ACCOUNT', items: acct },
    ]
  } else if (isPlatformAdmin && !impersonation?.active) {
    sections = [
      {
        label: 'ADMIN',
        items: [
          {
            name: 'Admin Dashboard',
            href: '/app/admin',
            icon: Shield,
            testId: 'nav-admin-dashboard',
          },
          {
            name: 'Supplier Admin',
            href: '/app/admin/suppliers',
            icon: Building2,
            testId: 'nav-supplier-admin',
          },
          {
            name: 'Restaurant Admin',
            href: '/app/admin/restaurants',
            icon: Users,
            testId: 'nav-restaurant-admin',
          },
        ],
      },
      {
        label: 'ACCOUNT',
        items: [
          { name: 'Settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' },
        ],
      },
    ]
  } else if (isSupplier || impersonatingSupplier) {
    const ops: NavItem[] = [
      {
        name: 'Orders',
        href: '/app/orders',
        icon: ShoppingCart,
        badge: 'pending' as const,
        testId: 'nav-orders',
      },
      { name: 'Products', href: '/app/products', icon: Package, testId: 'nav-products' },
      { name: 'Fulfillment', href: '/app/fulfillment', icon: Truck, testId: 'nav-fulfillment' },
      { name: 'Restaurants', href: '/app/restaurants', icon: Users, testId: 'nav-restaurants' },
    ]
    const intel: NavItem[] = [
      ...(reportsEnabled
        ? [{ name: 'Reports', href: '/app/reports', icon: BarChart3, testId: 'nav-reports' }]
        : []),
      ...(disputesEnabled
        ? [{ name: 'Disputes', href: '/app/disputes', icon: Scale, testId: 'nav-disputes' }]
        : []),
      ...(promotionsEnabled
        ? [
            {
              name: 'Deals & Promotions',
              href: '/app/promotions',
              icon: Tag,
              testId: 'nav-promotions',
            },
          ]
        : []),
      {
        name: 'Invoices',
        href: '/app/invoices',
        icon: FileText,
        permission: 'INVOICES_VIEW',
        testId: 'nav-invoices',
      },
      { name: 'Chat', href: '/app/chat', icon: MessageSquare, testId: 'nav-chat' },
    ].filter((item) => !item.permission || can(item.permission))

    sections = [
      {
        label: 'OVERVIEW',
        items: [
          {
            name: 'Dashboard',
            href: '/app/dashboard',
            icon: LayoutDashboard,
            testId: 'nav-dashboard',
          },
        ],
      },
      { label: 'OPERATIONS', items: ops },
      ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
      {
        label: 'ACCOUNT',
        items: [
          { name: 'Settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' },
        ],
      },
    ]
  }

  const initials = (user?.displayName || user?.email || 'U')
    .split(/[\s@]/)
    .filter(Boolean)
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
        borderRight: '1px solid var(--app-border)',
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
      <div
        style={{ padding: '14px 14px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}
      >
        <SupplifyLogo size={34} variant="lockup" theme="light" tagline={true} />
      </div>

      {/* Navigation sections */}
      <nav style={{ flex: 1, padding: '6px 10px', display: 'flex', flexDirection: 'column' }}>
        {sections.map((section) => (
          <div key={section.label} style={{ marginBottom: 6 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#d4c8f0',
                letterSpacing: '0.08em',
                padding: '8px 6px 3px',
              }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = location.pathname === item.href
              const showPendingBadge = item.badge === 'pending' && pendingOrders > 0
              const showUnreadBadge = item.badge === 'unread' && unreadCount > 0
              const showOrderUsage =
                item.name === 'Cart' && (isRestaurant || impersonatingRestaurant) && orderUsageBadge

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  data-testid={item.testId || `nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    paddingLeft: 6,
                    paddingRight: 8,
                    height: 34,
                    borderRadius: 7,
                    textDecoration: 'none',
                    position: 'relative',
                    background: isActive ? 'var(--brand-pale)' : 'transparent',
                    color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 13,
                    marginBottom: 1,
                  }}
                  className="sidebar-nav-item"
                >
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
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: isActive ? 'rgba(91,33,182,0.12)' : 'var(--brand-ultra)',
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
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </span>
                  {showPendingBadge && (
                    <span
                      style={{
                        background: 'var(--amber-mid)',
                        color: '#000',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: '1px 5px',
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
                        padding: '1px 5px',
                        minWidth: 18,
                        textAlign: 'center',
                      }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                  {showOrderUsage && orderUsageBadge && (
                    <span
                      title="Daily orders used today"
                      style={{
                        background: orderUsageBadge.atLimit
                          ? 'var(--red)'
                          : orderUsageBadge.nearLimit
                            ? 'var(--amber-mid)'
                            : 'var(--brand-ultra)',
                        color: orderUsageBadge.atLimit
                          ? '#fff'
                          : orderUsageBadge.nearLimit
                            ? '#000'
                            : 'var(--text-muted)',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: '1px 5px',
                        minWidth: 18,
                        textAlign: 'center',
                      }}
                    >
                      {orderUsageBadge.label}
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
          borderTop: '1px solid var(--app-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
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
        {planCode !== 'free' && planLabel && (
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
