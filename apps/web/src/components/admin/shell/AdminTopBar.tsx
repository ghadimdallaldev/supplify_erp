import { useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, LogOut, Menu, Moon, Search, Settings, Sun } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '../../../hooks/redux'
import { useLogoutMutation, useUpdateAdminPreferencesMutation, api } from '../../../services/api'
import { toast } from 'sonner'
import { CommandPalette } from '../../search/CommandPalette'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover'
import { useIsDarkTheme } from '../../../hooks/useIsDarkTheme'
import {
  applyAdminPreferences,
  DEFAULT_ADMIN_PREFERENCES,
  type AdminThemePreference,
} from '../../../lib/adminPreferences'
import { adminPortalBasePath, resolveAdminPortal } from './adminNavConfig'
import { getAdminPageHeader } from '../../../lib/adminPageHeaders'
import type { AdminTabKey } from '../dashboard/adminDashboardShared'
import { useAdminPortalLinks, useAdminTabLabels } from './useAdminNavLabels'

type AdminTopBarProps = {
  selectedTab?: AdminTabKey
  onOpenMobileNav?: () => void
}

function initialsFor(name: string): string {
  return (
    name
      .split(/[\s@._-]/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  )
}

function formatRoleCode(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function AdminTopBar({ selectedTab, onOpenMobileNav }: AdminTopBarProps) {
  const { t } = useTranslation('admin')
  const tabLabels = useAdminTabLabels()
  const portalLinks = useAdminPortalLinks()
  const { user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const location = useLocation()
  const isDark = useIsDarkTheme()
  const [commandOpen, setCommandOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logout] = useLogoutMutation()
  const [updatePreferences] = useUpdateAdminPreferencesMutation()

  const portal = resolveAdminPortal(location.pathname)
  const isSettings = location.pathname.startsWith('/app/settings')
  const headerContext = isSettings ? 'settings' : portal
  const portalLabel =
    portalLinks.find((link) => link.id === (isSettings ? 'platform' : portal))?.label ??
    getAdminPageHeader(headerContext).title

  const pageTitle = isSettings
    ? getAdminPageHeader('settings').title
    : selectedTab
      ? tabLabels[selectedTab]
      : getAdminPageHeader(portal).title
  const pageSubtitle = getAdminPageHeader(headerContext).subtitle

  const displayName = user?.displayName || user?.email || ''
  const initials = initialsFor(displayName || 'U')
  const roleLabel = user?.adminRoles?.[0]
    ? formatRoleCode(user.adminRoles[0])
    : t('nav.userMenu.platformAdmin')

  const handleLogout = useCallback(async () => {
    try {
      const data = await logout().unwrap()
      const { stopAuthSessionRefresh } = await import('../../../lib/authSessionRefresh')
      stopAuthSessionRefresh()
      dispatch(api.util.resetApiState())
      toast.success(t('common.logoutSuccess'))
      window.location.href = data?.keycloakLogoutUrl || '/login'
    } catch {
      toast.error(t('common.logoutFailed'))
    }
  }, [dispatch, logout, t])

  const handleToggleTheme = useCallback(async () => {
    const next: AdminThemePreference = isDark ? 'light' : 'dark'
    const current = user?.adminPreferences ?? DEFAULT_ADMIN_PREFERENCES
    // Apply immediately so the switch feels instant; the server copy follows.
    applyAdminPreferences({ ...current, themePreference: next })
    try {
      await updatePreferences({ themePreference: next }).unwrap()
    } catch {
      toast.error(t('nav.theme.saveFailed'))
    }
  }, [isDark, t, updatePreferences, user?.adminPreferences])

  return (
    <header className="admin-topbar" data-testid="admin-topbar">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onOpenMobileNav && (
          <button
            type="button"
            className="admin-topbar-icon-btn lg:hidden"
            aria-label={t('nav.aria.openMenu')}
            onClick={onOpenMobileNav}
          >
            <Menu size={18} />
          </button>
        )}
        <div className="min-w-0">
          <nav
            className="admin-topbar-crumbs hidden sm:flex"
            aria-label={t('nav.aria.breadcrumb')}
            data-testid="admin-breadcrumb"
          >
            <Link to={isSettings ? '/app/admin' : adminPortalBasePath(portal)}>{portalLabel}</Link>
            {(isSettings || selectedTab) && (
              <>
                <ChevronRight
                  className="admin-topbar-crumb-sep h-3 w-3 shrink-0 rtl:rotate-180"
                  aria-hidden
                />
                <span className="truncate text-[var(--text-mid)]" aria-current="page">
                  {pageTitle}
                </span>
              </>
            )}
          </nav>
          <h1
            className="truncate text-sm font-semibold leading-tight text-[var(--text)] sm:text-[15px]"
            title={pageSubtitle}
          >
            {pageTitle}
          </h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          className="admin-topbar-icon-btn md:hidden"
          aria-label={t('nav.aria.openSearch')}
          onClick={() => setCommandOpen(true)}
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          className="admin-topbar-search hidden md:flex"
          aria-label={t('nav.aria.openSearch')}
          onClick={() => setCommandOpen(true)}
        >
          <Search size={14} className="shrink-0 text-[var(--text-mid)]" />
          <span>{t('nav.searchPlaceholder')}</span>
          <kbd className="admin-topbar-kbd">⌘K</kbd>
        </button>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

        <button
          type="button"
          className="admin-topbar-icon-btn"
          data-testid="admin-theme-toggle"
          aria-label={isDark ? t('nav.theme.switchToLight') : t('nav.theme.switchToDark')}
          aria-pressed={isDark}
          onClick={handleToggleTheme}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="admin-topbar-avatar"
              data-testid="admin-user-menu-trigger"
              aria-label={t('nav.userMenu.open')}
              aria-haspopup="menu"
            >
              {initials}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-64 p-1.5">
            <div className="flex items-center gap-3 px-2.5 py-2.5">
              <span className="admin-topbar-avatar pointer-events-none h-9 w-9 text-xs">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text)]">
                  {user?.displayName || t('nav.userMenu.platformAdmin')}
                </p>
                {user?.email && (
                  <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
                )}
              </div>
            </div>
            <div className="px-2.5 pb-2">
              <span className="inline-flex items-center rounded-md bg-[var(--brand-pale)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
                {roleLabel}
              </span>
            </div>
            <div className="my-1 border-t border-[var(--app-border)]" />
            <Link
              to="/app/settings"
              className="admin-user-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden />
              {t('nav.userMenu.settings')}
            </Link>
            <button
              type="button"
              className="admin-user-menu-item admin-user-menu-item-danger"
              data-testid="logout-button"
              onClick={() => {
                setMenuOpen(false)
                void handleLogout()
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              {t('nav.userMenu.signOut')}
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
