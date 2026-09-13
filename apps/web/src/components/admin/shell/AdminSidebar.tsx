import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronsLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/utils'
import { SupplifyLogo } from '../../SupplifyLogo'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip'
import { useIsDarkTheme } from '../../../hooks/useIsDarkTheme'
import { adminTabPath, resolveAdminPortal, type AdminNavGroupResolved } from './adminNavConfig'
import type { AdminShellNavState } from './adminShellContext'
import {
  useAdminPlatformNav,
  useAdminPortalLinks,
  useAdminTenantPortalNav,
} from './useAdminNavLabels'

type AdminSidebarProps = {
  sectionNav?: AdminShellNavState | null
  mobileOpen?: boolean
  onMobileClose?: () => void
  /** Desktop icon-rail mode. Labels hide and tooltips take over. */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

/** Wraps a nav link in a tooltip only when the rail is collapsed (labels hidden). */
function RailTooltip({
  label,
  enabled,
  side,
  children,
}: {
  label: string
  enabled: boolean
  side: 'left' | 'right'
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8} className="hidden lg:block">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function NavGroups({
  groups,
  sectionNav,
  portal,
  collapsed,
  tooltipSide,
  onMobileClose,
}: {
  groups: AdminNavGroupResolved[]
  sectionNav: AdminShellNavState
  portal: ReturnType<typeof resolveAdminPortal>
  collapsed: boolean
  tooltipSide: 'left' | 'right'
  onMobileClose?: () => void
}) {
  const { selectedTab, canAdminTab } = sectionNav

  return (
    <>
      {groups.map((group) => {
        const visibleItems = group.items.filter((item) => canAdminTab[item.tab] !== false)
        if (visibleItems.length === 0) return null
        const hasActiveItem = visibleItems.some((item) => item.tab === selectedTab)
        const links = (
          <ul className="admin-sidebar-list">
            {visibleItems.map(({ tab, label, icon: Icon }) => {
              const active = selectedTab === tab
              return (
                <li key={tab}>
                  <RailTooltip label={label} enabled={collapsed} side={tooltipSide}>
                    <Link
                      to={adminTabPath(portal, tab)}
                      data-testid={`admin-nav-${tab}`}
                      className={cn('admin-sidebar-link', active && 'admin-sidebar-link-active')}
                      aria-current={active ? 'page' : undefined}
                      aria-label={collapsed ? label : undefined}
                      onClick={() => onMobileClose?.()}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="admin-sidebar-label">{label}</span>
                    </Link>
                  </RailTooltip>
                </li>
              )
            })}
          </ul>
        )

        // Collapsible groups stay expanded in rail mode: there is no label to click.
        if (group.collapsible && !collapsed) {
          return (
            <details
              key={group.label}
              className="admin-sidebar-group admin-sidebar-details"
              open={hasActiveItem || undefined}
            >
              <summary className="admin-sidebar-group-summary">
                <span>{group.label}</span>
                <ChevronDown className="admin-sidebar-group-chevron h-3.5 w-3.5" aria-hidden />
              </summary>
              {links}
            </details>
          )
        }

        return (
          <div key={group.label} className="admin-sidebar-group">
            <p className="admin-sidebar-group-label">{group.label}</p>
            {links}
          </div>
        )
      })}
    </>
  )
}

export function AdminSidebar({
  sectionNav,
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onToggleCollapsed,
}: AdminSidebarProps) {
  const { t, i18n } = useTranslation('admin')
  const { pathname } = useLocation()
  const isDark = useIsDarkTheme()
  const portal = resolveAdminPortal(pathname)
  const showSectionNav = Boolean(sectionNav && pathname.startsWith('/app/admin'))
  const platformNav = useAdminPlatformNav()
  const tenantPortalNav = useAdminTenantPortalNav()
  const portalLinks = useAdminPortalLinks()
  const navGroups =
    portal === 'suppliers' || portal === 'restaurants' ? tenantPortalNav : platformNav
  const tooltipSide: 'left' | 'right' = i18n.dir() === 'rtl' ? 'left' : 'right'

  return (
    <aside
      data-testid="admin-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label={t('nav.aria.navigation')}
      className={cn(
        'admin-sidebar',
        mobileOpen ? 'admin-sidebar-open' : 'admin-sidebar-closed',
        collapsed && 'admin-sidebar-collapsed'
      )}
    >
      <div className="admin-sidebar-brand">
        <span className="admin-sidebar-brand-lockup">
          <SupplifyLogo
            size={30}
            variant="lockup"
            theme={isDark ? 'dark' : 'light'}
            tagline={false}
          />
        </span>
        <span className="admin-sidebar-brand-mark" aria-hidden>
          <SupplifyLogo size={22} variant="mark" />
        </span>
        <span className="admin-sidebar-brand-badge">{t('nav.brand')}</span>
      </div>

      <nav
        className="admin-sidebar-portals"
        data-testid="admin-portal-nav"
        aria-label={t('nav.workspaces')}
      >
        {portalLinks.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <RailTooltip key={href} label={label} enabled={collapsed} side={tooltipSide}>
              <Link
                to={href}
                className={cn(
                  'admin-sidebar-portal-link',
                  active && 'admin-sidebar-portal-link-active'
                )}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? label : undefined}
                onClick={onMobileClose}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="admin-sidebar-label">{label}</span>
              </Link>
            </RailTooltip>
          )
        })}
      </nav>

      {showSectionNav && sectionNav && (
        <nav className="admin-sidebar-nav" aria-label={t('nav.aria.sections')}>
          <NavGroups
            groups={navGroups}
            sectionNav={sectionNav}
            portal={portal}
            collapsed={collapsed}
            tooltipSide={tooltipSide}
            onMobileClose={onMobileClose}
          />
        </nav>
      )}

      {!showSectionNav && <div className="admin-sidebar-nav" aria-hidden />}

      {onToggleCollapsed && (
        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-sidebar-collapse-btn"
            data-testid="admin-sidebar-collapse"
            aria-pressed={collapsed}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            onClick={onToggleCollapsed}
          >
            <ChevronsLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="admin-sidebar-label">{t('nav.collapseSidebar')}</span>
          </button>
        </div>
      )}
    </aside>
  )
}
