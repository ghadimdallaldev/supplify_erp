import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import {
  useLogoutMutation,
  useMarkAllNotificationsReadMutation,
  useGetEntitlementsQuery,
  useRecordConversionEventMutation,
  api,
} from '../services/api'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { Button } from './ui/button'
import { Bell, X, TrendingUp, Settings, ChevronRight, Menu, Search } from 'lucide-react'
import { toast } from 'sonner'
import { BranchSwitcher } from './BranchSwitcher'
import { useNavigate, useLocation } from 'react-router-dom'
import { useNotificationBadge } from '../hooks/useNotificationBadge'
import { useImpersonation } from '../hooks/useImpersonation'
import { CommandPalette } from './search/CommandPalette'
import { cn } from '../lib/utils'
import { LanguageSwitcher } from './LanguageSwitcher'

const PAGE_NAMES: Record<string, string> = {
  '/app/dashboard': 'dashboard',
  '/app/orders': 'orders',
  '/app/products': 'products',
  '/app/fulfillment': 'fulfillment',
  '/app/restaurants': 'restaurants',
  '/app/suppliers': 'suppliers',
  '/app/cart': 'cart',
  '/app/quick-lists': 'quickLists',
  '/app/reservations': 'reservations',
  '/app/receiving': 'receiving',
  '/app/staff': 'staff',
  '/app/restaurant-inventory': 'inventory',
  '/app/invoices': 'invoices',
  '/app/chat': 'chat',
  '/app/notifications': 'notifications',
  '/app/settings': 'settings',
  '/app/branches': 'branches',
  '/app/admin': 'platform',
  '/app/admin/suppliers': 'supplierAdmin',
  '/app/admin/restaurants': 'restaurantAdmin',
  '/app/reports': 'reports',
  '/app/disputes': 'disputes',
  '/app/deals': 'deals',
  '/app/promotions': 'promotions',
  '/app/driver-deliveries': 'myDeliveries',
  '/app/onboarding': 'onboarding',
  '/app/org': 'organization',
  '/app/inventory': 'inventory',
  '/app/supplier-settings': 'supplierSettings',
  '/app/customer-growth': 'customerGrowth',
}

export function Header({ onOpenMobileNav }: { onOpenMobileNav?: () => void } = {}) {
  const { t } = useTranslation(['navigation', 'common'])
  const { user } = useAppSelector((state) => state.auth)
  const { isImpersonating, isPlatformAdmin, isEffectiveSupplier, shouldLoadTenantEntitlements } =
    useImpersonation()
  const dispatch = useAppDispatch()
  const location = useLocation()
  const [logout] = useLogoutMutation()
  const [commandOpen, setCommandOpen] = useState(false)
  const [notificationsMounted, setNotificationsMounted] = useState(false)
  const [notificationsVisible, setNotificationsVisible] = useState(false)
  const navigate = useNavigate()

  const openCommandPalette = useCallback(() => setCommandOpen(true), [])

  const openNotifications = useCallback(() => {
    setNotificationsMounted(true)
    requestAnimationFrame(() => setNotificationsVisible(true))
  }, [])

  const closeNotifications = useCallback(() => {
    setNotificationsVisible(false)
    window.setTimeout(() => setNotificationsMounted(false), 150)
  }, [])

  const toggleNotifications = useCallback(() => {
    if (notificationsMounted && notificationsVisible) {
      closeNotifications()
    } else {
      openNotifications()
    }
  }, [notificationsMounted, notificationsVisible, closeNotifications, openNotifications])

  useEffect(() => {
    if (!notificationsVisible) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeNotifications()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [notificationsVisible, closeNotifications])
  const [markAllAsRead] = useMarkAllNotificationsReadMutation()
  const [recordConversionEvent] = useRecordConversionEventMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const blockedCountLast7d = useAppSelector((state) => state.monetization.blockedCountLast7d)

  const e = entitlementsData?.entitlements
  const limits = e?.limits ?? {}
  const usage = e?.usage ?? {}
  const usagePressure = Object.entries(limits)
    .filter(([_, limit]) => limit != null && limit !== -1)
    .map(([key]) => {
      const current = usage[key] ?? 0
      const limit = limits[key] as number
      const pct = limit > 0 ? (current / limit) * 100 : 0
      return { key, pct, current, limit }
    })
    .filter(({ pct }) => pct >= 80)
    .slice(0, 3)
  const workspace = user?.workspace
  const workspaceLabel =
    workspace?.tenantName &&
    `${workspace.tenantType === 'SUPPLIER' ? 'Supplier' : 'Restaurant'}: ${workspace.tenantName}${
      workspace.roleName ? ` · ${workspace.roleName}` : ''
    }`
  const showUpgrade = (!isPlatformAdmin || isImpersonating) && user?.role !== 'PENDING'
  const isAdminPortalRoute =
    isPlatformAdmin && !isImpersonating && location.pathname.startsWith('/app/admin')
  const hasUrgency = usagePressure.length > 0 || (blockedCountLast7d ?? 0) >= 1
  const settingsPlanTab = isEffectiveSupplier
    ? '/app/settings?tab=plan'
    : '/app/settings?tab=subscription'

  const handleNavUpgrade = () => {
    const trigger =
      usagePressure.length > 0
        ? 'near_limit'
        : (blockedCountLast7d ?? 0) >= 1
          ? 'blocked'
          : 'browse'
    recordConversionEvent({
      eventType: 'OPEN_UPGRADE',
      metadata: { source: 'nav_upgrade_cta', trigger },
    }).catch(() => {})
    openBrowseUpgrade(dispatch, {
      currentPlan: e?.plan?.name ?? null,
      upgradeUrl: settingsPlanTab,
    })
  }

  const { notifications, unreadCount } = useNotificationBadge()

  const handleLogout = async () => {
    try {
      const data = await logout().unwrap()
      dispatch(api.util.resetApiState())
      toast.success('Logged out successfully')
      if (data?.keycloakLogoutUrl) {
        window.location.href = data.keycloakLogoutUrl
      } else {
        window.location.href = '/login'
      }
    } catch (error) {
      toast.error('Logout failed')
    }
  }

  const pageKey =
    PAGE_NAMES[location.pathname] ??
    Object.entries(PAGE_NAMES).find(([key]) => location.pathname.startsWith(key + '/'))?.[1] ??
    'dashboard'
  const pageName = t(pageKey, { ns: 'navigation', defaultValue: pageKey })

  const initials = (user?.displayName || user?.email || 'U')
    .split(/[\s@]/)
    .filter(Boolean)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header
      data-testid="header"
      className="flex h-14 min-h-14 shrink-0 items-center gap-2 border-b border-[var(--app-border)]/40 bg-[var(--surface)] px-3 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-5 lg:px-6"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {onOpenMobileNav && !isAdminPortalRoute && (
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-ultra)]/50 hover:text-[var(--text)] lg:hidden"
          aria-label={t('openMenu', { ns: 'navigation' })}
          onClick={onOpenMobileNav}
        >
          <Menu size={18} />
        </button>
      )}

      {/* Breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <span className="hidden text-[13px] font-normal text-[var(--text-muted)]/80 xs:inline">
          {t('brand', { ns: 'common' })}
        </span>
        <ChevronRight
          size={13}
          className="hidden shrink-0 text-[var(--text-muted)]/50 xs:block rtl:rotate-180"
        />
        <span className="truncate text-[13px] font-medium text-[var(--text)]">{pageName}</span>
        {workspaceLabel && (
          <>
            <ChevronRight
              size={13}
              className="hidden shrink-0 text-[var(--text-muted)]/50 sm:block rtl:rotate-180"
            />
            <span
              className="hidden max-w-[8rem] truncate text-xs font-normal text-[var(--text-muted)]/80 sm:inline md:max-w-[14rem]"
              data-testid="workspace-context"
            >
              {workspaceLabel}
            </span>
          </>
        )}
      </div>

      {/* Right side controls */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <BranchSwitcher />

        {showUpgrade && (
          <>
            <Button
              variant={hasUrgency ? 'default' : 'outline'}
              size="sm"
              onClick={handleNavUpgrade}
              className="relative hidden min-h-9 sm:inline-flex"
              style={
                hasUrgency
                  ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' }
                  : { borderColor: 'var(--app-border-mid)', color: 'var(--text-mid)' }
              }
            >
              <TrendingUp style={{ width: 14, height: 14, marginRight: 4 }} />
              {hasUrgency ? 'Upgrade' : 'Plans'}
              {hasUrgency && (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--amber-mid)',
                    border: '2px solid var(--surface)',
                  }}
                />
              )}
            </Button>
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-ultra)]/50 hover:text-[var(--text)] sm:hidden"
              aria-label={hasUrgency ? 'Upgrade plan' : 'View plans'}
              onClick={handleNavUpgrade}
            >
              <TrendingUp size={16} className={hasUrgency ? 'text-[var(--brand)]' : undefined} />
              {hasUrgency && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--amber-mid)]" />
              )}
            </button>
          </>
        )}

        {/* Command palette */}
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-ultra)]/50 hover:text-[var(--text)] md:hidden"
          aria-label="Open command palette"
          onClick={openCommandPalette}
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          className="hidden h-8 min-w-[140px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--app-border)]/50 bg-[var(--brand-ultra)]/30 px-2.5 text-start transition-colors hover:border-[var(--app-border)]/70 hover:bg-[var(--brand-ultra)]/50 md:flex lg:min-w-[200px]"
          aria-label="Open command palette"
          onClick={openCommandPalette}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <circle cx="5.5" cy="5.5" r="4" stroke="var(--text-muted)" strokeWidth="1.3" />
            <path
              d="M9 9l2.5 2.5"
              stroke="var(--text-muted)"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <span className="flex-1 text-xs text-[var(--text-muted)]">
            {isAdminPortalRoute ? 'Search admin…' : 'Search products…'}
          </span>
          <kbd className="hidden rounded border border-[var(--app-border)]/40 bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]/80 lg:inline">
            ⌘K
          </kbd>
        </button>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

        {/* Notification bell */}
        <div className="relative">
          <button
            type="button"
            className="erp-pressable relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-ultra)]/50 hover:text-[var(--text)]"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={notificationsVisible}
            onClick={toggleNotifications}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border border-[var(--surface)] bg-[var(--red)]" />
            )}
          </button>

          {notificationsMounted && (
            <div
              data-testid="notifications-dropdown"
              className={cn(
                'fixed inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top))] z-50 max-h-[min(70vh,24rem)] overflow-y-auto rounded-lg border border-[var(--app-border)]/50 bg-[var(--surface)] shadow-sm transition-opacity duration-150 ease-out motion-reduce:transition-none sm:absolute sm:inset-x-auto sm:end-0 sm:top-10 sm:w-[min(100vw-1.5rem,20rem)]',
                notificationsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
              )}
            >
              <div className="flex items-center justify-between border-b border-[var(--app-border)]/40 px-4 py-3">
                <span className="text-[13px] font-semibold text-[var(--text)]">Notifications</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {unreadCount > 0 && (
                    <button
                      style={{
                        fontSize: 11,
                        color: 'var(--brand)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      onClick={async () => {
                        try {
                          await markAllAsRead().unwrap()
                        } catch (error) {
                          console.error('Failed to mark all as read:', error)
                        }
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text-muted)',
                    }}
                    onClick={closeNotifications}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm font-medium text-[var(--text)]">
                      You&apos;re all caught up
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Order updates and alerts will appear here.
                    </p>
                  </div>
                ) : (
                  notifications.map((notification: any) => (
                    <div
                      key={notification.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--app-border)',
                        cursor: 'pointer',
                        background: !notification.is_read ? 'var(--brand-ultra)' : 'transparent',
                      }}
                      onClick={() => {
                        const meta =
                          typeof notification.metadata === 'string'
                            ? (() => {
                                try {
                                  return JSON.parse(notification.metadata || '{}')
                                } catch {
                                  return {}
                                }
                              })()
                            : notification.metadata || {}
                        const link = typeof meta.link === 'string' ? meta.link : null
                        if (link) {
                          navigate(link)
                          closeNotifications()
                          return
                        }
                        if (notification.reference_type === 'ORDER' && notification.reference_id) {
                          navigate(`/app/orders/${notification.reference_id}`)
                          closeNotifications()
                        }
                        if (notification.reference_type === 'DEAL' && notification.reference_id) {
                          navigate(`/app/deals?highlight=${notification.reference_id}`)
                          closeNotifications()
                        }
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                            {notification.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {notification.message}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                            {new Date(notification.created_at).toLocaleString()}
                          </div>
                        </div>
                        {!notification.is_read && (
                          <div
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: 'var(--brand)',
                              marginLeft: 8,
                              marginTop: 3,
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <LanguageSwitcher compact />

        {/* Settings icon button */}
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-ultra)]/50 hover:text-[var(--text)]"
          onClick={() => navigate('/app/settings')}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={15} />
        </button>

        {/* User avatar */}
        <button
          type="button"
          data-testid="logout-button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--mint-mid)] text-[11px] font-semibold text-white ring-1 ring-[var(--app-border)]/30 transition-opacity hover:opacity-90"
          title={`${user?.displayName || user?.email} — click to logout`}
          onClick={handleLogout}
        >
          {initials}
        </button>
      </div>
    </header>
  )
}
