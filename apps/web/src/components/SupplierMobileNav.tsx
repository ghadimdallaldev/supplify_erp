import { Link, useLocation } from 'react-router-dom'
import { Package, ShoppingCart, UserPlus } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { canViewSupplierGrowth } from '../lib/tenantRoles'
import { useImpersonation } from '../hooks/useImpersonation'
import { useGetEntitlementsQuery } from '../services/api'
import { canUseSupplierGrowth } from '../lib/planFeatureGates'
import { isNavItemActive } from './sidebar/sidebarNavConfig'
import { cn } from '../lib/utils'

type MobileNavItem = {
  name: string
  href: string
  icon: typeof Package
  permission?: string
  anyOf?: string[]
  testId: string
}

export function SupplierMobileNav() {
  const location = useLocation()
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const { isEffectiveSupplier, shouldLoadTenantEntitlements } = useImpersonation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })

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
                'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors',
                active
                  ? 'text-[var(--brand-mid)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-mid)]'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
