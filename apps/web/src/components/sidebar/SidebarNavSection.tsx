import { Link } from 'react-router-dom'
import { prefetchRouteChunk } from '../../lib/routeChunkPrefetch'
import { cn } from '../../lib/utils'
import type { SidebarNavItem, SidebarNavSectionConfig } from './sidebarNavConfig'
import { isNavItemActive } from './sidebarNavConfig'

export type SidebarNavBadgeContext = {
  pendingOrders: number
  unreadCount: number
  activeDisputeCount: number
  orderUsageBadge: { label: string; atLimit: boolean; nearLimit: boolean } | null
  showOrderUsageOnCart: boolean
}

type SidebarNavSectionProps = {
  section: SidebarNavSectionConfig
  pathname: string
  badges: SidebarNavBadgeContext
  onNavigate?: () => void
}

export function SidebarNavSection({
  section,
  pathname,
  badges,
  onNavigate,
}: SidebarNavSectionProps) {
  const { pendingOrders, unreadCount, activeDisputeCount, orderUsageBadge, showOrderUsageOnCart } =
    badges

  return (
    <div className="mb-1.5">
      <div className="section-label px-1.5 pb-0.5 pt-2 text-[var(--sidebar-section)]">
        {section.label}
      </div>
      {section.items.map((item) => (
        <SidebarNavLink
          key={item.name}
          item={item}
          isActive={isNavItemActive(pathname, item.href)}
          pendingOrders={pendingOrders}
          unreadCount={unreadCount}
          activeDisputeCount={activeDisputeCount}
          orderUsageBadge={orderUsageBadge}
          showOrderUsage={item.name === 'Cart' && showOrderUsageOnCart}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function SidebarNavLink({
  item,
  isActive,
  pendingOrders,
  unreadCount,
  activeDisputeCount,
  orderUsageBadge,
  showOrderUsage,
  onNavigate,
}: {
  item: SidebarNavItem
  isActive: boolean
  pendingOrders: number
  unreadCount: number
  activeDisputeCount: number
  orderUsageBadge: SidebarNavBadgeContext['orderUsageBadge']
  showOrderUsage: boolean
  onNavigate?: () => void
}) {
  const showPendingBadge = item.badge === 'pending' && pendingOrders > 0
  const showUnreadBadge = item.badge === 'unread' && unreadCount > 0
  const showDisputesBadge = item.badge === 'disputes' && activeDisputeCount > 0

  return (
    <Link
      to={item.href}
      aria-current={isActive ? 'page' : undefined}
      onMouseEnter={() => prefetchRouteChunk(item.href)}
      onFocus={() => prefetchRouteChunk(item.href)}
      onClick={() => onNavigate?.()}
      data-testid={item.testId || `nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'sidebar-nav-item relative mb-px flex h-[34px] items-center gap-2 rounded-md px-2 text-[13px] no-underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30 focus-visible:ring-offset-1',
        isActive
          ? 'bg-[var(--brand-pale)] font-semibold text-[var(--brand)]'
          : 'font-medium text-[var(--text-muted)]'
      )}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-[18px] w-px -translate-y-1/2 rounded-r bg-[var(--mint-mid)]"
        />
      )}
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          isActive ? 'bg-[var(--brand)]/10' : 'bg-[var(--brand-ultra)]'
        )}
      >
        <item.icon
          size={14}
          className={isActive ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {showPendingBadge && <NavCountBadge count={pendingOrders} variant="amber" />}
      {showDisputesBadge && (
        <NavCountBadge count={activeDisputeCount} variant="amber" title="Active disputes" />
      )}
      {showUnreadBadge && <NavCountBadge count={unreadCount} variant="red" cap={9} />}
      {showOrderUsage && orderUsageBadge && (
        <span
          title="Daily orders used today"
          className={cn(
            'min-w-[18px] rounded-lg px-1.5 py-px text-center text-[10px] font-bold',
            orderUsageBadge.atLimit
              ? 'bg-[var(--red)] text-white'
              : orderUsageBadge.nearLimit
                ? 'bg-[var(--amber-mid)] text-black'
                : 'bg-[var(--brand-ultra)] text-[var(--text-muted)]'
          )}
        >
          {orderUsageBadge.label}
        </span>
      )}
    </Link>
  )
}

function NavCountBadge({
  count,
  variant,
  cap = 99,
  title,
}: {
  count: number
  variant: 'amber' | 'red'
  cap?: number
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'min-w-[18px] rounded-lg px-1.5 py-px text-center text-[10px] font-bold',
        variant === 'red' ? 'bg-[var(--red)] text-white' : 'bg-[var(--amber-mid)] text-black'
      )}
    >
      {count > cap ? `${cap}+` : count}
    </span>
  )
}
