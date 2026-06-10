import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, ShoppingBag, MessageSquare } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { cn } from '../lib/utils'

type MobileNavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  permission?: string
  testId: string
}

function isActive(pathname: string, href: string) {
  if (href === '/app/dashboard') {
    return pathname === href || pathname === '/app' || pathname === '/app/'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function RestaurantMobileNav() {
  const location = useLocation()
  const { can } = usePermissions()
  const { isEffectiveRestaurant } = useImpersonation()
  const { persona } = useWorkspaceRole()

  const isRestaurantUser = isEffectiveRestaurant
  if (!isRestaurantUser) return null

  const homeHref =
    persona.analyticsNav?.href && (can('ORDERS_VIEW') || can('INVOICES_VIEW'))
      ? persona.analyticsNav.href
      : '/app/dashboard'

  const items: MobileNavItem[] = [
    {
      name: 'Home',
      href: homeHref,
      icon: LayoutDashboard,
      permission: 'ORDERS_VIEW',
      testId: 'mobile-nav-home',
    },
    {
      name: 'Orders',
      href: '/app/orders',
      icon: ShoppingCart,
      permission: 'ORDERS_VIEW',
      testId: 'mobile-nav-orders',
    },
    {
      name: 'Cart',
      href: '/app/cart',
      icon: ShoppingBag,
      permission: 'ORDERS_CREATE',
      testId: 'mobile-nav-cart',
    },
    {
      name: 'Products',
      href: '/app/products',
      icon: Package,
      permission: 'CATALOG_VIEW',
      testId: 'mobile-nav-products',
    },
    {
      name: 'Chat',
      href: '/app/chat',
      icon: MessageSquare,
      permission: 'CHAT_VIEW',
      testId: 'mobile-nav-chat',
    },
  ].filter((item) => !item.permission || can(item.permission))

  if (items.length === 0) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--app-border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary navigation"
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const active = isActive(location.pathname, item.href)
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
