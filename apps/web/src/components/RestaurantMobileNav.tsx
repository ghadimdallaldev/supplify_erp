import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, ShoppingCart, Package, ShoppingBag, MessageSquare } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { useAppSelector } from '../hooks/redux'
import { useGetDashboardSummaryQuery } from '../services/api'
import { StatusDot } from './ui/status-badge'
import type { StatusTone } from './ui/status-badge'
import { cn } from '../lib/utils'

type MobileNavItem = {
  nameKey: string
  href: string
  icon: typeof LayoutDashboard
  permission?: string
  testId: string
  badge?: { count: number; tone: StatusTone }
}

function isActive(pathname: string, href: string) {
  if (href === '/app/dashboard') {
    return pathname === href || pathname === '/app' || pathname === '/app/'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
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

export function RestaurantMobileNav() {
  const { t } = useTranslation('navigation')
  const location = useLocation()
  const { can } = usePermissions()
  const { isEffectiveRestaurant } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const cartItemCount = useAppSelector((state) => state.cart.items.length)
  const { data: summaryData } = useGetDashboardSummaryQuery(undefined, {
    skip: !isEffectiveRestaurant,
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
  })
  const pendingOrders = Number(summaryData?.stats?.pendingOrders) || 0

  const isRestaurantUser = isEffectiveRestaurant
  if (!isRestaurantUser) return null

  const homeHref =
    persona.analyticsNav?.href && (can('ORDERS_VIEW') || can('INVOICES_VIEW'))
      ? persona.analyticsNav.href
      : '/app/dashboard'

  const items: MobileNavItem[] = [
    {
      nameKey: 'home',
      href: homeHref,
      icon: LayoutDashboard,
      permission: 'ORDERS_VIEW',
      testId: 'mobile-nav-home',
    },
    {
      nameKey: 'orders',
      href: '/app/orders',
      icon: ShoppingCart,
      permission: 'ORDERS_VIEW',
      testId: 'mobile-nav-orders',
      badge: { count: pendingOrders, tone: 'warning' as const },
    },
    {
      nameKey: 'cart',
      href: '/app/cart',
      icon: ShoppingBag,
      permission: 'ORDERS_CREATE',
      testId: 'mobile-nav-cart',
      badge: { count: cartItemCount, tone: 'info' as const },
    },
    {
      nameKey: 'products',
      href: '/app/products',
      icon: Package,
      permission: 'CATALOG_VIEW',
      testId: 'mobile-nav-products',
    },
    {
      nameKey: 'chat',
      href: '/app/chat',
      icon: MessageSquare,
      permission: 'CHAT_VIEW',
      testId: 'mobile-nav-chat',
    },
  ].filter((item) => !item.permission || can(item.permission))

  if (items.length === 0) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--app-border)]/40 bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
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
                'erp-pressable flex min-h-[2.75rem] min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium touch-manipulation',
                active ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
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
                    'relative h-5 w-5 shrink-0',
                    active ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
                  )}
                  aria-hidden
                />
                {item.badge ? (
                  <MobileNavBadge count={item.badge.count} tone={item.badge.tone} />
                ) : null}
              </span>
              <span className="truncate">{t(item.nameKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
