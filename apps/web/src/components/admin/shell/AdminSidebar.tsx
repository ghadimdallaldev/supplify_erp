import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../../lib/utils'
import { SupplifyLogo } from '../../SupplifyLogo'
import {
  ADMIN_PLATFORM_NAV,
  ADMIN_PORTAL_LINKS,
  ADMIN_TENANT_PORTAL_NAV,
  adminTabPath,
  resolveAdminPortal,
  type AdminNavGroup,
} from './adminNavConfig'
import type { AdminShellNavState } from './adminShellContext'

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
  groups: AdminNavGroup[]
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
  const { pathname } = useLocation()
  const portal = resolveAdminPortal(pathname)
  const showSectionNav = Boolean(sectionNav && pathname.startsWith('/app/admin'))
  const navGroups =
    portal === 'suppliers' || portal === 'restaurants'
      ? ADMIN_TENANT_PORTAL_NAV
      : ADMIN_PLATFORM_NAV

  return (
    <aside
      data-testid="admin-sidebar"
      aria-label="Admin navigation"
      className={cn('admin-sidebar', mobileOpen ? 'admin-sidebar-open' : 'admin-sidebar-closed')}
    >
      <div className="admin-sidebar-brand">
        <SupplifyLogo size={30} variant="lockup" theme="light" tagline={false} />
        <span className="admin-sidebar-brand-badge">Admin</span>
      </div>

      <div className="admin-sidebar-portals" data-testid="admin-portal-nav">
        {ADMIN_PORTAL_LINKS.map(({ href, label, icon: Icon, match }) => {
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
        <nav className="admin-sidebar-nav" aria-label="Admin sections">
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
