import { Link, useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { useNotificationBadge } from '../hooks/useNotificationBadge'
import {
  useGetDashboardStatsQuery,
  useGetEntitlementsQuery,
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
} from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
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
  BarChart3,
  Scale,
  Tag,
  Percent,
  Radar,
} from 'lucide-react'
import { featureEnabled, getOrderUsageBadge, isEntitlementFeatureEnabled } from '../lib/planLimits'
import { countActiveDisputes } from '../lib/disputeHelpers'
import { canUseGlobalReports, canUseSupplierDeals } from '../lib/planFeatureGates'
import { formatPlanDisplayName } from '../lib/planComparison'

type NavItem = {
  name: string
  href: string
  icon: any
  permission?: string
  anyOf?: string[]
  badge?: 'pending' | 'unread' | 'disputes'
  testId?: string
}

function navItemAllowed(
  item: NavItem,
  can: (key: string) => boolean,
  canAny: (...keys: string[]) => boolean
) {
  if (item.anyOf?.length) return canAny(...item.anyOf)
  if (item.permission) return can(item.permission)
  return true
}

type NavSection = { label: string; items: NavItem[] }

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/app/command-center') {
    return pathname === href || pathname === '/app' || pathname === '/' || pathname === '/app/'
  }
  if (href === '/app/dashboard') {
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
} = {}) {
  const location = useLocation()
  const { user } = useAppSelector((state) => state.auth)
  const { can, canAny } = usePermissions()
  const { isDriverRole } = useWorkspaceRole()
  const {
    isImpersonating,
    isEffectiveRestaurant,
    isEffectiveSupplier,
    isPlatformAdmin,
    shouldLoadTenantEntitlements,
  } = useImpersonation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const { data: statsData } = useGetDashboardStatsQuery(undefined, {
    skip: isPlatformAdmin && !isImpersonating,
  })
  const { unreadCount: notificationUnreadCount } = useNotificationBadge()

  const hasAdminNavAccess = isPlatformAdmin && !isImpersonating
  const isSupplier = isEffectiveSupplier
  const isRestaurant = isEffectiveRestaurant
  const impersonatingRestaurant = isImpersonating && isEffectiveRestaurant
  const impersonatingSupplier = isImpersonating && isEffectiveSupplier

  const pendingOrders = Number(statsData?.pendingOrders) || 0
  const unreadCount = notificationUnreadCount
  const planLabel = entitlementsData?.entitlements?.plan?.name ?? ''
  const planCode = (entitlementsData?.entitlements?.plan?.code ?? 'free').toLowerCase()
  const reportsEnabled = canUseGlobalReports(entitlementsData?.entitlements)
  const supplierDealsEnabled = canUseSupplierDeals(entitlementsData?.entitlements)
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )
  const { data: restaurantDisputesData } = useGetDisputesQuery(undefined, {
    skip: !disputesEnabled || isSupplier || !user,
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
  })
  const { data: supplierDisputesData } = useGetIncomingDisputesQuery(undefined, {
    skip: !disputesEnabled || !isSupplier || !user,
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
  })
  const activeDisputeCount = countActiveDisputes(
    (isSupplier ? supplierDisputesData?.disputes : restaurantDisputesData?.disputes) ?? []
  )
  const promotionsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'promotions'
  )
  const orderUsageBadge = getOrderUsageBadge(entitlementsData?.entitlements)

  let sections: NavSection[] = []

  if (isRestaurant || impersonatingRestaurant) {
    const ops: NavItem[] = [
      {
        name: 'Orders',
        href: '/app/orders',
        icon: ShoppingCart,
        badge: 'pending' as const,
        permission: 'ORDERS_VIEW',
        testId: 'nav-orders',
      },
      {
        name: 'Products',
        href: '/app/products',
        icon: Package,
        permission: 'CATALOG_VIEW',
        testId: 'nav-products',
      },
      {
        name: 'My Prices',
        href: '/app/my-prices',
        icon: Percent,
        permission: 'CATALOG_VIEW',
        testId: 'nav-my-prices',
      },
      {
        name: 'Ordering Lists',
        href: '/app/quick-lists',
        icon: List,
        permission: 'ORDERS_VIEW',
        testId: 'nav-quick-lists',
      },
      {
        name: 'Cart',
        href: '/app/cart',
        icon: ShoppingBag,
        permission: 'ORDERS_CREATE',
        testId: 'nav-cart',
      },
      {
        name: 'Reservations',
        href: '/app/reservations',
        icon: CalendarDays,
        permission: 'RESERVATIONS_VIEW',
        testId: 'nav-reservations',
      },
      {
        name: 'Receiving',
        href: '/app/receiving',
        icon: PackageCheck,
        permission: 'RECEIVING_VIEW',
        testId: 'nav-receiving',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    const intel: NavItem[] = [
      {
        name: 'Suppliers',
        href: '/app/suppliers',
        icon: Building2,
        permission: 'CATALOG_VIEW',
        testId: 'nav-suppliers',
      },
      ...(reportsEnabled
        ? [
            {
              name: 'Reports',
              href: '/app/reports',
              icon: BarChart3,
              permission: 'ORDERS_VIEW',
              testId: 'nav-reports',
            },
          ]
        : []),
      ...(disputesEnabled
        ? [
            {
              name: 'Disputes',
              href: '/app/disputes',
              icon: Scale,
              permission: 'ORDERS_VIEW',
              badge: 'disputes' as const,
              testId: 'nav-disputes',
            },
          ]
        : []),
      ...(supplierDealsEnabled
        ? [
            {
              name: 'Deals',
              href: '/app/deals',
              icon: Percent,
              permission: 'PROMOTIONS_VIEW',
              testId: 'nav-deals',
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
      {
        name: 'Chat',
        href: '/app/chat',
        icon: MessageSquare,
        permission: 'CHAT_VIEW',
        testId: 'nav-chat',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

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
      {
        name: 'Settings',
        href: '/app/settings',
        icon: Settings,
        permission: 'SETTINGS_VIEW',
        testId: 'nav-settings',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    sections = [
      {
        label: 'OVERVIEW',
        items: [
          {
            name: 'Dashboard',
            href: '/app/dashboard',
            icon: LayoutDashboard,
            permission: 'ORDERS_VIEW',
            testId: 'nav-dashboard',
          },
        ].filter((item) => navItemAllowed(item, can, canAny)),
      },
      { label: 'OPERATIONS', items: ops },
      ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
      { label: 'ACCOUNT', items: acct },
    ]
  } else if (hasAdminNavAccess && !isImpersonating) {
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
    if (isDriverRole) {
      sections = [
        {
          label: 'DELIVERIES',
          items: [
            {
              name: 'My Deliveries',
              href: '/app/driver-deliveries',
              icon: Truck,
              permission: 'DRIVER_DELIVERIES_VIEW',
              testId: 'nav-driver-deliveries',
            },
          ].filter((item) => navItemAllowed(item, can, canAny)),
        },
      ]
    } else {
      const ops: NavItem[] = [
        {
          name: 'Orders',
          href: '/app/orders',
          icon: ShoppingCart,
          badge: 'pending' as const,
          permission: 'ORDERS_VIEW',
          testId: 'nav-orders',
        },
        {
          name: 'Products',
          href: '/app/products',
          icon: Package,
          permission: 'CATALOG_VIEW',
          testId: 'nav-products',
        },
        {
          name: 'Contract Pricing',
          href: '/app/contract-pricing',
          icon: Percent,
          permission: 'CATALOG_VIEW',
          testId: 'nav-contract-pricing',
        },
        {
          name: 'Fulfillment',
          href: '/app/fulfillment',
          icon: Truck,
          permission: 'FULFILLMENT_VIEW',
          testId: 'nav-fulfillment',
        },
        {
          name: 'Restaurants',
          href: '/app/restaurants',
          icon: Users,
          permission: 'ORDERS_VIEW',
          testId: 'nav-restaurants',
        },
        ...(disputesEnabled
          ? [
              {
                name: 'Disputes',
                href: '/app/disputes',
                icon: Scale,
                permission: 'ORDERS_VIEW',
                badge: 'disputes' as const,
                testId: 'nav-disputes',
              },
            ]
          : []),
      ].filter((item) => navItemAllowed(item, can, canAny))
      const intel: NavItem[] = [
        ...(reportsEnabled
          ? [
              {
                name: 'Reports',
                href: '/app/reports',
                icon: BarChart3,
                permission: 'ORDERS_VIEW',
                testId: 'nav-reports',
              },
            ]
          : []),
        ...(promotionsEnabled
          ? [
              {
                name: 'Deals & Promotions',
                href: '/app/promotions',
                icon: Tag,
                permission: 'PROMOTIONS_VIEW',
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
        {
          name: 'Chat',
          href: '/app/chat',
          icon: MessageSquare,
          permission: 'CHAT_VIEW',
          testId: 'nav-chat',
        },
      ].filter((item) => navItemAllowed(item, can, canAny))

      sections = [
        {
          label: 'OVERVIEW',
          items: [
            {
              name: 'Command Center',
              href: '/app/command-center',
              icon: Radar,
              anyOf: [
                'ORDERS_MANAGE',
                'INVOICES_VIEW',
                'CATALOG_EDIT',
                'FULFILLMENT_VIEW',
                'PROMOTIONS_MANAGE',
              ],
              testId: 'nav-command-center',
            },
            {
              name: 'Analytics',
              href: '/app/dashboard',
              icon: LayoutDashboard,
              permission: 'ORDERS_VIEW',
              testId: 'nav-dashboard',
            },
          ].filter((item) => navItemAllowed(item, can, canAny)),
        },
        { label: 'OPERATIONS', items: ops },
        ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
        {
          label: 'ACCOUNT',
          items: [
            {
              name: 'Settings',
              href: '/app/settings',
              icon: Settings,
              permission: 'SETTINGS_VIEW',
              testId: 'nav-settings',
            },
          ].filter((item) => navItemAllowed(item, can, canAny)),
        },
      ]
    }
  }

  const initials = (user?.displayName || user?.email || 'U')
    .split(/[\s@]/)
    .filter(Boolean)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside
      data-testid="sidebar"
      aria-label="Main navigation"
      className={[
        'flex flex-col border-r border-[var(--app-border)] bg-[var(--surface)] font-sans',
        'h-screen overflow-y-auto',
        'fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,14rem)] transition-transform duration-200 lg:sticky lg:w-56 lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Brand block */}
      <div
        style={{ padding: '14px 14px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}
      >
        <SupplifyLogo size={34} variant="lockup" theme="light" tagline={true} />
      </div>

      {/* Navigation sections */}
      <nav
        style={{ flex: 1, padding: '6px 10px', display: 'flex', flexDirection: 'column' }}
        aria-label="Application sections"
      >
        {sections.map((section) => (
          <div key={section.label} style={{ marginBottom: 6 }}>
            <div className="px-1.5 pb-0.5 pt-2 text-[9.5px] font-bold uppercase tracking-wider text-[var(--sidebar-section)]">
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = isNavItemActive(location.pathname, item.href)
              const showPendingBadge = item.badge === 'pending' && pendingOrders > 0
              const showUnreadBadge = item.badge === 'unread' && unreadCount > 0
              const showDisputesBadge = item.badge === 'disputes' && activeDisputeCount > 0
              const showOrderUsage =
                item.name === 'Cart' && (isRestaurant || impersonatingRestaurant) && orderUsageBadge

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onMobileClose?.()}
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
                  {showDisputesBadge && (
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
                      title="Active disputes"
                    >
                      {activeDisputeCount > 99 ? '99+' : activeDisputeCount}
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
        {planLabel && (
          <span
            style={{
              background: planCode === 'free' ? 'var(--amber-pale)' : 'var(--brand-pale)',
              color: planCode === 'free' ? 'var(--amber)' : 'var(--brand-mid)',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 4,
              padding: '2px 6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {formatPlanDisplayName(planCode, planLabel)}
          </span>
        )}
      </div>
    </aside>
  )
}
