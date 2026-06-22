import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/utils'
import { SupplifyLogo } from '../../SupplifyLogo'
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
}

function NavGroups({
  groups,
  sectionNav,
  portal,
  onMobileClose,
}: {
  groups: AdminNavGroupResolved[]
  sectionNav: AdminShellNavState
  portal: ReturnType<typeof resolveAdminPortal>
  onMobileClose?: () => void
}) {
  const { selectedTab, canAdminTab } = sectionNav

  return (
    <>
      {groups.map((group) => {
        const visibleItems = group.items.filter((item) => canAdminTab[item.tab] !== false)
        if (visibleItems.length === 0) return null

        return (
          <div key={group.label} className="admin-sidebar-group">
            <p className="admin-sidebar-group-label">{group.label}</p>
            <ul className="admin-sidebar-list">
              {visibleItems.map(({ tab, label, icon: Icon }) => {
                const active = selectedTab === tab
                return (
                  <li key={tab}>
                    <Link
                      to={adminTabPath(portal, tab)}
                      data-testid={`admin-nav-${tab}`}
                      className={cn('admin-sidebar-link', active && 'admin-sidebar-link-active')}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onMobileClose?.()}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </>
  )
}

export function AdminSidebar({ sectionNav, mobileOpen = false, onMobileClose }: AdminSidebarProps) {
  const { t } = useTranslation('admin')
  const { pathname } = useLocation()
  const portal = resolveAdminPortal(pathname)
  const showSectionNav = Boolean(sectionNav && pathname.startsWith('/app/admin'))
  const platformNav = useAdminPlatformNav()
  const tenantPortalNav = useAdminTenantPortalNav()
  const portalLinks = useAdminPortalLinks()
  const navGroups =
    portal === 'suppliers' || portal === 'restaurants' ? tenantPortalNav : platformNav

  return (
    <aside
      data-testid="admin-sidebar"
      aria-label={t('nav.aria.navigation')}
      className={cn('admin-sidebar', mobileOpen ? 'admin-sidebar-open' : 'admin-sidebar-closed')}
    >
      <div className="admin-sidebar-brand">
        <SupplifyLogo size={30} variant="lockup" theme="light" tagline={false} />
        <span className="admin-sidebar-brand-badge">{t('nav.brand')}</span>
      </div>

      <div className="admin-sidebar-portals" data-testid="admin-portal-nav">
        {portalLinks.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={href}
              to={href}
              className={cn(
                'admin-sidebar-portal-link',
                active && 'admin-sidebar-portal-link-active'
              )}
              aria-current={active ? 'page' : undefined}
              onClick={onMobileClose}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {label}
            </Link>
          )
        })}
      </div>

      {showSectionNav && sectionNav && (
        <nav className="admin-sidebar-nav" aria-label={t('nav.aria.sections')}>
          <NavGroups
            groups={navGroups}
            sectionNav={sectionNav}
            portal={portal}
            onMobileClose={onMobileClose}
          />
        </nav>
      )}
    </aside>
  )
}
