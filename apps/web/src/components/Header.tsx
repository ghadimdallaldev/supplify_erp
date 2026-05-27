import { useState } from 'react'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import {
  useLogoutMutation,
  useMarkAllNotificationsReadMutation,
  useGetEntitlementsQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { Button } from './ui/button'
import { Bell, X, TrendingUp, Settings, ChevronRight, Menu } from 'lucide-react'
import toast from 'react-hot-toast'
import { BranchSwitcher } from './BranchSwitcher'
import { useNavigate, useLocation } from 'react-router-dom'
import { useNotificationBadge } from '../hooks/useNotificationBadge'

const PAGE_NAMES: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/orders': 'Orders',
  '/app/products': 'Products',
  '/app/fulfillment': 'Fulfillment',
  '/app/restaurants': 'Restaurants',
  '/app/suppliers': 'Suppliers',
  '/app/cart': 'Cart',
  '/app/quick-lists': 'Quick Lists',
  '/app/reservations': 'Reservations',
  '/app/receiving': 'Receiving',
  '/app/staff': 'Staff',
  '/app/restaurant-inventory': 'Inventory',
  '/app/invoices': 'Invoices',
  '/app/chat': 'Chat',
  '/app/notifications': 'Notifications',
  '/app/settings': 'Settings',
  '/app/branches': 'Branches',
  '/app/admin': 'Admin Dashboard',
  '/app/admin/suppliers': 'Supplier Admin',
  '/app/admin/restaurants': 'Restaurant Admin',
  '/app/approvals': 'Approvals',
  '/app/reports': 'Reports',
  '/app/disputes': 'Disputes',
  '/app/deals': 'Deals',
  '/app/promotions': 'Promotions',
  '/app/onboarding': 'Onboarding',
  '/app/org': 'Organization',
  '/app/inventory': 'Inventory',
  '/app/supplier-settings': 'Supplier Settings',
}

export function Header({ onOpenMobileNav }: { onOpenMobileNav?: () => void } = {}) {
  const { user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const location = useLocation()
  const [logout] = useLogoutMutation()
  const [showNotifications, setShowNotifications] = useState(false)
  const navigate = useNavigate()
  const [markAllAsRead] = useMarkAllNotificationsReadMutation()
  const [recordConversionEvent] = useRecordConversionEventMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !user || user.role === 'ADMIN',
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
  const showUpgrade = user?.role !== 'ADMIN' && user?.role !== 'PENDING'
  const hasUrgency = usagePressure.length > 0 || (blockedCountLast7d ?? 0) >= 1
  const settingsPlanTab =
    user?.role === 'SUPPLIER' ? '/app/settings?tab=plan' : '/app/settings?tab=subscription'

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

  const pageName =
    PAGE_NAMES[location.pathname] ??
    Object.entries(PAGE_NAMES).find(([key]) => location.pathname.startsWith(key + '/'))?.[1] ??
    'Dashboard'

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
      style={{
        height: 56,
        minHeight: 56,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--app-border)',
        padding: '0 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: "'Inter', system-ui, sans-serif",
        flexShrink: 0,
      }}
    >
      {onOpenMobileNav && (
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] lg:hidden"
          aria-label="Open navigation menu"
          onClick={onOpenMobileNav}
        >
          <Menu size={18} style={{ color: 'var(--text-muted)' }} />
        </button>
      )}

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>Supplify</span>
        <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{pageName}</span>
        {workspaceLabel && (
          <>
            <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
            <span
              style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}
              data-testid="workspace-context"
            >
              {workspaceLabel}
            </span>
          </>
        )}
      </div>

      {/* Right side controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BranchSwitcher />

        {showUpgrade && (
          <Button
            variant={hasUrgency ? 'default' : 'outline'}
            size="sm"
            onClick={handleNavUpgrade}
            className="relative"
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
        )}

        {/* Quick jump to catalog */}
        <button
          type="button"
          className="hidden h-[34px] min-w-[140px] items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] px-2.5 text-left transition-colors hover:border-[var(--app-border-mid)] md:flex lg:min-w-[200px] cursor-pointer"
          aria-label="Go to products catalog"
          onClick={() => navigate('/app/products')}
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
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
            Search products…
          </span>
        </button>

        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={showNotifications}
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'transparent',
              border: '1px solid var(--app-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
            }}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={16} style={{ color: 'var(--text-muted)' }} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--red)',
                  border: '1.5px solid var(--surface)',
                }}
              />
            )}
          </button>

          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 44,
                width: 320,
                background: 'var(--surface)',
                borderRadius: 12,
                border: '1px solid var(--app-border)',
                boxShadow: '0 8px 32px rgba(91,33,182,0.12)',
                zIndex: 50,
                maxHeight: 400,
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--app-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  Notifications
                </span>
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
                    onClick={() => setShowNotifications(false)}
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
                        if (notification.reference_type === 'ORDER' && notification.reference_id) {
                          navigate(`/app/orders/${notification.reference_id}`)
                          setShowNotifications(false)
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
                          {(() => {
                            const meta =
                              typeof notification.metadata === 'string'
                                ? JSON.parse(notification.metadata || '{}')
                                : notification.metadata || {}
                            const whatsappUrl = meta?.whatsappUrl
                            return whatsappUrl ? (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  marginTop: 4,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: 'var(--mint)',
                                  textDecoration: 'none',
                                }}
                                onClick={(event) => event.stopPropagation()}
                              >
                                Open in WhatsApp
                              </a>
                            ) : null
                          })()}
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

        {/* Settings icon button */}
        <button
          type="button"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: 'transparent',
            border: '1px solid var(--app-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/app/settings')}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={15} style={{ color: 'var(--text-muted)' }} />
        </button>

        {/* User avatar */}
        <button
          type="button"
          data-testid="logout-button"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--brand), var(--mint-mid))',
            border: '2px solid var(--surface)',
            outline: '1px solid var(--app-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            cursor: 'pointer',
            flexShrink: 0,
            fontFamily: 'inherit',
          }}
          title={`${user?.displayName || user?.email} — click to logout`}
          onClick={handleLogout}
        >
          {initials}
        </button>
      </div>
    </header>
  )
}
