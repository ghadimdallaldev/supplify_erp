import { Link } from 'react-router-dom'
import { prefetchRouteChunk } from '../../lib/routeChunkPrefetch'
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
    <div style={{ marginBottom: 6 }}>
      <div className="px-1.5 pb-0.5 pt-2 text-[9.5px] font-bold uppercase tracking-wider text-[var(--sidebar-section)]">
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
        <item.icon size={14} style={{ color: isActive ? 'var(--brand)' : 'var(--text-muted)' }} />
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
}
