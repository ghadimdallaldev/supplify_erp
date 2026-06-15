import { Link, useLocation } from 'react-router-dom'
import { Package, ShoppingCart, UserPlus } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
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
  const { can, canAny } = usePermissions()
  const { isEffectiveSupplier } = useImpersonation()

  if (!isEffectiveSupplier) return null

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
    {
      name: 'Growth',
      href: '/app/customer-growth',
      icon: UserPlus,
      anyOf: ['CATALOG_EDIT', 'ORDERS_VIEW'],
      testId: 'mobile-nav-customer-growth',
    },
  ].filter((item) => {
    if (item.anyOf?.length) return canAny(...item.anyOf)
    if (item.permission) return can(item.permission)
    return true
  })

  if (items.length === 0) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--app-border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
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
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="truncate">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
