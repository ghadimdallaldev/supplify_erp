import { Link, useLocation } from 'react-router-dom'
import { Package, ShoppingCart, UserPlus } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { canViewSupplierGrowth } from '../lib/tenantRoles'
import { useImpersonation } from '../hooks/useImpersonation'
import { useGetEntitlementsQuery, useGetDashboardStatsQuery } from '../services/api'
import { canUseSupplierGrowth } from '../lib/planFeatureGates'
import { isNavItemActive } from './sidebar/sidebarNavConfig'
import { StatusDot } from './ui/status-badge'
import type { StatusTone } from './ui/status-badge'
import { cn } from '../lib/utils'

type MobileNavItem = {
  name: string
  href: string
  icon: typeof Package
  permission?: string
  anyOf?: string[]
  testId: string
  badge?: { count: number; tone: StatusTone }
}

function MobileNavBadge({ count, tone }: { count: number; tone: StatusTone }) {
  if (count <= 0) return null

  return (
    <span className="absolute -end-1 -top-0.5 flex items-center gap-0.5 rounded-full border border-[var(--surface)] bg-[var(--surface)] px-1 py-px shadow-sm">
      <StatusDot tone={tone} />
      <span className="text-[9px] font-bold leading-none text-[var(--text)]">
        {count > 9 ? '9+' : count}
      </span>
    </span>
  )
}

export function SupplierMobileNav() {
  const location = useLocation()
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const { isEffectiveSupplier, shouldLoadTenantEntitlements } = useImpersonation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const { data: statsData } = useGetDashboardStatsQuery(undefined, {
    skip: !isEffectiveSupplier,
  })
  const pendingOrders = Number(statsData?.pendingOrders) || 0

  if (!isEffectiveSupplier) return null

  const supplierGrowthEnabled =
    canUseSupplierGrowth(entitlementsData?.entitlements) && canViewSupplierGrowth(user, can)

  const items: MobileNavItem[] = [
    {
      name: 'Products',
      href: '/app/products',
      icon: Package,
      permission: 'CATALOG_VIEW',
      testId: 'mobile-nav-products',
    },
    {
      name: 'Orders',
      href: '/app/orders',
      icon: ShoppingCart,
      permission: 'ORDERS_VIEW',
      testId: 'mobile-nav-orders',
      badge: { count: pendingOrders, tone: 'warning' as const },
    },
    ...(supplierGrowthEnabled
      ? [
          {
            name: 'Growth',
            href: '/app/customer-growth',
            icon: UserPlus,
            permission: 'GROWTH_VIEW',
            testId: 'mobile-nav-customer-growth',
          },
        ]
      : []),
  ].filter((item) => {
    if (item.permission) return can(item.permission)
    return true
  })

  if (items.length === 0) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--app-border)]/40 bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary navigation"
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const active = isNavItemActive(location.pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              to={item.href}
              data-testid={item.testId}
              className={cn(
                'erp-pressable flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-medium touch-manipulation',
                active
                  ? 'text-[var(--brand)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-mid)]'
              )}
            >
              <span className="relative flex h-8 w-8 items-center justify-center">
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[var(--brand-pale)]"
                  />
                ) : null}
                <Icon
                  className={cn(
                    'relative h-5 w-5',
                    active ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
                  )}
                  aria-hidden
                />
                {item.badge ? (
                  <MobileNavBadge count={item.badge.count} tone={item.badge.tone} />
                ) : null}
              </span>
              {item.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
