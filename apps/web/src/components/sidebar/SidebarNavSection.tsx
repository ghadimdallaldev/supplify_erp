import { Link } from 'react-router-dom'
import { useEffect, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

function resolveNavItemLabel(item: SidebarNavItem, t: (key: string) => string): string {
  if (item.nameKey) return t(item.nameKey)
  return item.name ?? ''
}

function resolveSectionLabel(section: SidebarNavSectionConfig, t: (key: string) => string): string {
  if (section.labelKey) return t(section.labelKey)
  return section.label ?? ''
}

export function SidebarNavSection({
  section,
  pathname,
  badges,
  onNavigate,
}: SidebarNavSectionProps) {
  const { t } = useTranslation('navigation')
  const sectionLabel = resolveSectionLabel(section, t)
  const [expanded, setExpanded] = useState(true)
  const contentId = useId()
  const containsActiveRoute = section.items.some((item) => isNavItemActive(pathname, item.href))
  useEffect(() => {
    if (containsActiveRoute) setExpanded(true)
  }, [pathname, containsActiveRoute])
  const { pendingOrders, unreadCount, activeDisputeCount, orderUsageBadge, showOrderUsageOnCart } =
    badges

  return (
    <div className="mb-3 first:mb-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
        className="section-label flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-2 text-start text-[var(--sidebar-section)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >
        {sectionLabel}
        <ChevronDown
          size={14}
          aria-hidden
          className={cn('shrink-0 transition-transform', !expanded && '-rotate-90')}
        />
      </button>
      <div id={contentId} hidden={!expanded}>
        {section.items.map((item) => (
          <SidebarNavLink
            key={item.testId ?? item.href}
            item={item}
            label={resolveNavItemLabel(item, t)}
            isActive={isNavItemActive(pathname, item.href)}
            pendingOrders={pendingOrders}
            unreadCount={unreadCount}
            activeDisputeCount={activeDisputeCount}
            orderUsageBadge={orderUsageBadge}
            showOrderUsage={item.testId === 'nav-cart' && showOrderUsageOnCart}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}

function SidebarNavLink({
  item,
  label,
  isActive,
  pendingOrders,
  unreadCount,
  activeDisputeCount,
  orderUsageBadge,
  showOrderUsage,
  onNavigate,
}: {
  item: SidebarNavItem
  label: string
  isActive: boolean
  pendingOrders: number
  unreadCount: number
  activeDisputeCount: number
  orderUsageBadge: SidebarNavBadgeContext['orderUsageBadge']
  showOrderUsage: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation('navigation')
  const showPendingBadge = item.badge === 'pending' && pendingOrders > 0
  const showUnreadBadge = item.badge === 'unread' && unreadCount > 0
  const showDisputesBadge = item.badge === 'disputes' && activeDisputeCount > 0

  return (
    <Link
      to={item.href}
      aria-current={isActive ? 'page' : undefined}
      data-active={isActive ? 'true' : undefined}
      onMouseEnter={() => prefetchRouteChunk(item.href)}
      onFocus={() => prefetchRouteChunk(item.href)}
      onClick={() => onNavigate?.()}
      data-testid={item.testId || `nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'sidebar-nav-item relative mb-0.5 flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-[13px] no-underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30 focus-visible:ring-offset-1',
        isActive ? 'font-semibold text-[var(--text)]' : 'font-medium text-[var(--text-muted)]'
      )}
    >
      <item.icon
        size={15}
        className={cn('shrink-0', isActive ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]')}
        aria-hidden
      />
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {showPendingBadge && (
        <NavCountBadge count={pendingOrders} variant="amber" title={t('badge.pendingOrders')} />
      )}
      {showDisputesBadge && (
        <NavCountBadge
          count={activeDisputeCount}
          variant="amber"
          title={t('badge.activeDisputes')}
        />
      )}
      {showUnreadBadge && (
        <NavCountBadge
          count={unreadCount}
          variant="red"
          cap={9}
          title={t('badge.unreadNotifications')}
        />
      )}
      {showOrderUsage && orderUsageBadge && (
        <span
          title={t('badge.dailyOrdersUsed')}
          className={cn(
            'min-w-[18px] rounded-md px-1.5 py-px text-center text-[10px] font-semibold',
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
        'min-w-[18px] rounded-md px-1.5 py-px text-center text-[10px] font-semibold',
        variant === 'red' ? 'bg-[var(--red)] text-white' : 'bg-[var(--amber-mid)] text-black'
      )}
    >
      {count > cap ? `${cap}+` : count}
    </span>
  )
}
