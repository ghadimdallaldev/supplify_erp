import { useState } from 'react'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import {
  useLogoutMutation,
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useGetEntitlementsQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { showMonetizationBlock } from '../features/monetization/monetizationSlice'
import { Button } from './ui/button'
import { LogOut, User, Bell, X, TrendingUp, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from './ui/badge'
import { useNavigate, Link } from 'react-router-dom'

export function Header() {
  const { user } = useAppSelector((state) => state.auth)
  const cartItemCount = useAppSelector((state) => state.cart.items.length)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const showCart = user?.role === 'RESTAURANT'
  const [logout] = useLogoutMutation()
  const [showNotifications, setShowNotifications] = useState(false)
  const [markAllAsRead] = useMarkAllNotificationsReadMutation()
  const [recordConversionEvent] = useRecordConversionEventMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !user || user.role === 'ADMIN',
  })
  const blockedCountLast7d = useAppSelector((state) => state.monetization.blockedCountLast7d)

  const e = entitlementsData?.entitlements
  const limits = e?.limits ?? {}
  const usage = e?.usage ?? {}
  const planCode = (e?.plan?.code ?? 'free').toLowerCase()
  const nearLimitKeys = Object.entries(limits)
    .filter(([_, limit]) => limit != null && limit !== -1)
    .map(([key]) => {
      const current = usage[key] ?? 0
      const limit = limits[key] as number
      const pct = limit > 0 ? (current / limit) * 100 : 0
      return { key, pct, current, limit }
    })
    .filter(({ pct }) => pct >= 80 && pct < 100)
    .slice(0, 3)
  const showUpgrade =
    user?.role !== 'ADMIN' &&
    (planCode === 'free' || nearLimitKeys.length > 0 || (blockedCountLast7d ?? 0) >= 1)
  const hasUrgency = nearLimitKeys.length > 0 || (blockedCountLast7d ?? 0) >= 1

  const handleNavUpgrade = () => {
    const trigger =
      nearLimitKeys.length > 0 ? 'near_limit' : (blockedCountLast7d ?? 0) >= 1 ? 'blocked' : 'free'
    recordConversionEvent({
      eventType: 'OPEN_UPGRADE',
      metadata: { source: 'nav_upgrade_cta', trigger },
    }).catch(() => {})
    if (nearLimitKeys.length > 0) {
      const first = nearLimitKeys[0]
      dispatch(
        showMonetizationBlock({
          type: 'limit',
          payload: {
            limitKey: first.key,
            limitValue: first.limit,
            currentUsage: first.current,
            currentPlan: e?.plan?.name ?? null,
            recommendedPlans: [],
            upgradeUrl: '/app/settings',
          },
        })
      )
    } else {
      dispatch(
        showMonetizationBlock({
          type: 'feature',
          payload: {
            featureKey: 'upgrade_prompt',
            currentPlan: e?.plan?.name ?? null,
            requiredPlan: null,
            recommendedPlans: [],
            upgradeUrl: '/app/settings',
          },
        })
      )
    }
  }

  // Fetch notifications
  const { data: notificationsData } = useGetNotificationsQuery(
    { limit: 10, offset: 0 },
    {
      pollingInterval: 60000, // Poll every 60 seconds (reduced from 30)
      skip: !user, // Skip if not logged in
    }
  )

  const notifications = notificationsData?.notifications || []
  const unreadCount = notifications.filter((n: { is_read?: boolean }) => !n.is_read).length

  const handleLogout = async () => {
    try {
      const data = await logout().unwrap()
      toast.success('Logged out successfully')
      // Redirect to Keycloak logout so SSO session is cleared; then Keycloak redirects back to /login
      if (data?.keycloakLogoutUrl) {
        window.location.href = data.keycloakLogoutUrl
      } else {
        window.location.href = '/login'
      }
    } catch (error) {
      toast.error('Logout failed')
    }
  }

  return (
    <header className="bg-white shadow-sm border-b" data-testid="header">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Welcome back, {user?.displayName}
            </h2>
            <p className="text-sm text-gray-600 capitalize">{user?.role?.toLowerCase()} Account</p>
          </div>

          <div className="flex items-center space-x-4">
            {showCart && (
              <Link
                to="/app/cart"
                className="relative inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                aria-label={`Cart with ${cartItemCount} items`}
              >
                <ShoppingBag className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                    {cartItemCount > 99 ? '99+' : cartItemCount}
                  </span>
                )}
              </Link>
            )}
            {showUpgrade && (
              <Button
                variant={hasUrgency ? 'default' : 'outline'}
                size="sm"
                onClick={handleNavUpgrade}
                className="relative"
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                Upgrade
                {hasUrgency && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-amber-400 rounded-full" />
                )}
              </Button>
            )}
            {/* Notifications */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold">Notifications</h3>
                    <div className="flex gap-2">
                      {unreadCount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await markAllAsRead().unwrap()
                            } catch (error) {
                              console.error('Failed to mark all as read:', error)
                            }
                          }}
                        >
                          Mark all as read
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setShowNotifications(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="divide-y">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">No notifications</div>
                    ) : (
                      notifications.map((notification: any) => (
                        <div
                          key={notification.id}
                          className={`p-4 hover:bg-gray-50 cursor-pointer ${!notification.is_read ? 'bg-blue-50' : ''}`}
                          onClick={() => {
                            if (
                              notification.reference_type === 'ORDER' &&
                              notification.reference_id
                            ) {
                              navigate(`/app/orders/${notification.reference_id}`)
                              setShowNotifications(false)
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-gray-900">
                                {notification.title}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notification.created_at).toLocaleString()}
                              </p>
                            </div>
                            {!notification.is_read && (
                              <div className="ml-2 h-2 w-2 bg-blue-500 rounded-full"></div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span>{user?.email}</span>
            </div>

            <Button
              data-testid="logout-button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
