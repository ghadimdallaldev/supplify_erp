import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '../../../hooks/redux'
import { useLogoutMutation, api } from '../../../services/api'
import { toast } from 'sonner'
import { CommandPalette } from '../../search/CommandPalette'
import { ADMIN_TAB_LABELS, resolveAdminPortal } from './adminNavConfig'
import { getAdminPageHeader } from '../../../lib/adminPageHeaders'
import type { AdminTabKey } from '../dashboard/adminDashboardShared'

type AdminTopBarProps = {
  selectedTab?: AdminTabKey
  onOpenMobileNav?: () => void
}

export function AdminTopBar({ selectedTab, onOpenMobileNav }: AdminTopBarProps) {
  const { user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const location = useLocation()
  const [commandOpen, setCommandOpen] = useState(false)
  const [logout] = useLogoutMutation()

  const portal = resolveAdminPortal(location.pathname)
  const isSettings = location.pathname.startsWith('/app/settings')

  const pageTitle = isSettings
    ? getAdminPageHeader('settings').title
    : selectedTab
      ? ADMIN_TAB_LABELS[selectedTab]
      : getAdminPageHeader(
          portal === 'suppliers'
            ? 'suppliers'
            : portal === 'restaurants'
              ? 'restaurants'
              : 'platform'
        ).title

  const pageSubtitle = isSettings
    ? getAdminPageHeader('settings').subtitle
    : getAdminPageHeader(
        portal === 'suppliers' ? 'suppliers' : portal === 'restaurants' ? 'restaurants' : 'platform'
      ).subtitle

  const initials = (user?.displayName || user?.email || 'U')
    .split(/[\s@]/)
    .filter(Boolean)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleLogout = useCallback(async () => {
    try {
      const data = await logout().unwrap()
      dispatch(api.util.resetApiState())
      toast.success('Logged out successfully')
      window.location.href = data?.keycloakLogoutUrl || '/login'
    } catch {
      toast.error('Logout failed')
    }
  }, [dispatch, logout])

  return (
    <header className="admin-topbar" data-testid="admin-topbar">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onOpenMobileNav && (
          <button
            type="button"
            className="admin-topbar-icon-btn lg:hidden"
            aria-label="Open admin menu"
            onClick={onOpenMobileNav}
          >
            <Menu size={18} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-[var(--text)] sm:text-lg">
            {pageTitle}
          </h1>
          <p className="hidden truncate text-xs text-[var(--text-mid)] sm:block">{pageSubtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          className="admin-topbar-icon-btn md:hidden"
          aria-label="Open search"
          onClick={() => setCommandOpen(true)}
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          className="admin-topbar-search hidden md:flex"
          aria-label="Open search"
          onClick={() => setCommandOpen(true)}
        >
          <Search size={14} className="shrink-0 text-[var(--text-mid)]" />
          <span>Search admin…</span>
          <kbd className="admin-topbar-kbd">⌘K</kbd>
        </button>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

        <button
          type="button"
          className="admin-topbar-avatar"
          data-testid="logout-button"
          title={`${user?.displayName || user?.email} — click to logout`}
          onClick={handleLogout}
        >
          {initials}
        </button>
      </div>
    </header>
  )
}
