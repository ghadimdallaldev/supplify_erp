import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ImpersonationBanner } from './ImpersonationBanner'
import { UpgradeModal } from './UpgradeModal'
import { PaymentModal } from './billing/PaymentModal'
import { BillingOverdueBanner } from './billing/BillingOverdueBanner'
import { BranchProvider } from '../contexts/BranchContext'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import {
  refreshBlockedCount,
  showMonetizationBlock,
} from '../features/monetization/monetizationSlice'
import {
  api,
  useGetEntitlementsQuery,
  useGetBillingStatusQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { AlertTriangle, Layers, Lock } from 'lucide-react'
import {
  getExternallyDisabledFeatures,
  getPlanTierDisabledFeatures,
  settingsFeaturesTabPath,
} from '../lib/externallyControlledFeatures'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { useCartActions } from '../hooks/useCartActions'
import { formatPlanBlockNudgeMessage, getLimitLabel } from '../lib/planComparison'
import { isAtEntitlementLimit, shouldShowEntitlementLimit } from '../lib/planLimits'
import { getAppSocket, releaseAppSocket } from '../lib/appSocket'
import { useImpersonation } from '../hooks/useImpersonation'
import { shouldLoadBillingStatus, shouldRedirectToActivate } from '../lib/billingActivationRedirect'
import { LimitExceededBanner } from './LimitExceededBanner'
import { OfflineBanner } from './OfflineBanner'
import { useNotificationAlerts } from '../hooks/useNotificationAlerts'

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { rehydrateCart } = useCartActions()

  useNotificationAlerts()

  // Prefetch the most-visited route chunks after auth so first navigation is instant.
  // Runs once on mount with a 2 s delay to avoid competing with the initial page load.
  useEffect(() => {
    const t = setTimeout(() => {
      import('../pages/DashboardPage')
      import('../pages/OrdersPage')
      import('../pages/StaffPage')
      import('../pages/InventoryPage')
      import('../pages/disputes/DisputesPage')
      import('../pages/reports/ReportsPage')
      import('../pages/ProductsPage')
      import('../pages/ReservationsPage')
    }, 500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    dispatch(refreshBlockedCount())
  }, [dispatch])

  useEffect(() => {
    if (user?.email) {
      rehydrateCart()
    }
  }, [user?.email, rehydrateCart])
  const { isImpersonating, isPlatformAdmin, shouldLoadTenantEntitlements } = useImpersonation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
    refetchOnFocus: false,
    refetchOnMountOrArgChange: false,
  })
  const { data: billingStatus } = useGetBillingStatusQuery(undefined, {
    skip: !shouldLoadBillingStatus(isPlatformAdmin, isImpersonating),
    refetchOnFocus: false,
    refetchOnMountOrArgChange: false,
  })

  // Keep shell caches warm on the server (entitlements TTL) without refetching on tab focus.
  useEffect(() => {
    if (!shouldLoadTenantEntitlements) return
    dispatch(api.endpoints.getEntitlements.initiate(undefined, { subscribe: false }))
  }, [dispatch, shouldLoadTenantEntitlements])
  const [recordConversionEvent] = useRecordConversionEventMutation()

  useEffect(() => {
    if (
      !shouldRedirectToActivate({
        isPlatformAdmin,
        isImpersonating,
        pathname: location.pathname,
        access: billingStatus?.access,
      })
    ) {
      return
    }
    navigate('/app/activate', { replace: true })
  }, [isPlatformAdmin, isImpersonating, billingStatus?.access, location.pathname, navigate])
  const blockedCountLast7d = useAppSelector((state) => state.monetization.blockedCountLast7d)
  const recentBlockedSummary = useAppSelector((state) => state.monetization.recentBlockedSummary)

  const entitlementsRef = useRef(entitlementsData?.entitlements)
  useEffect(() => {
    entitlementsRef.current = entitlementsData?.entitlements
  }, [entitlementsData?.entitlements])

  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    if (!user?.id) {
      releaseAppSocket()
      return
    }

    const socket = getAppSocket(user.id)

    const onEntitlementsRefresh = (payload: {
      reason?: string
      featureName?: string
      featureKey?: string
      mode?: string
      enabled?: boolean
      tenantType?: string
      tenantId?: string
    }) => {
      dispatch(api.util.invalidateTags(['Subscription']))

      const label = payload.featureName || payload.featureKey || 'Feature access'

      if (payload.reason === 'global_feature') {
        const state =
          payload.mode === 'inherit'
            ? `now follows each account's plan`
            : payload.mode === 'on'
              ? 'turned on for everyone on the platform'
              : 'turned off for everyone on the platform'
        toast.success(`Platform update: ${label} was ${state}.`)
        return
      }

      if (
        (payload.reason === 'tenant_feature_override' ||
          payload.reason === 'tenant_feature_override_clear') &&
        payload.tenantId &&
        payload.tenantType
      ) {
        const u = userRef.current
        const e = entitlementsRef.current
        const applies = Boolean(
          u && e && u.role === payload.tenantType && e.tenantId === payload.tenantId
        )

        if (applies) {
          if (payload.reason === 'tenant_feature_override_clear') {
            toast.success(
              `Your plan now controls ${label} (an administrator removed a manual override).`
            )
          } else {
            const onOff = payload.enabled ? 'enabled' : 'disabled'
            toast.success(`Your account: ${label} was ${onOff} by an administrator.`)
          }
        }
      }
    }

    socket.on('entitlements_refresh', onEntitlementsRefresh)
    return () => {
      socket.off('entitlements_refresh', onEntitlementsRefresh)
    }
  }, [user?.id, dispatch])

  useEffect(() => {
    if (isImpersonating && location.pathname.startsWith('/app/admin')) {
      navigate('/app/dashboard', { replace: true })
    }
  }, [isImpersonating, location.pathname, navigate])

  const e = entitlementsData?.entitlements
  const externallyDisabledFeatures = useMemo(() => (e ? getExternallyDisabledFeatures(e) : []), [e])
  const planTierDisabledFeatures = useMemo(() => (e ? getPlanTierDisabledFeatures(e) : []), [e])
  const limits = e?.limits ?? {}
  const usage = e?.usage ?? {}
  const nearLimitKeys = Object.entries(limits)
    .filter(([key, limit]) => shouldShowEntitlementLimit(key) && limit != null && limit !== -1)
    .map(([key]) => {
      const current = usage[key] ?? 0
      const limit = limits[key] as number
      const pct = limit > 0 ? (current / limit) * 100 : 0
      return { key, pct, current, limit }
    })
    .filter(({ pct }) => pct >= 80 && pct < 100)
    .slice(0, 3)

  const atLimitEntries = Object.entries(limits)
    .filter(([key, limit]) => shouldShowEntitlementLimit(key) && limit != null && limit !== -1)
    .map(([key, limit]) => ({
      key,
      current: usage[key] ?? 0,
      limit: limit as number,
    }))
    .filter(({ current, limit }) => isAtEntitlementLimit(current, limit))
    .slice(0, 3)

  const recentBlockLimitKeys = recentBlockedSummary.limitKeys.map((x) => x.key)
  const recentBlockFeatureKeys = recentBlockedSummary.featureKeys.map((x) => x.key)
  const planBlockNudgeMessage =
    formatPlanBlockNudgeMessage(recentBlockLimitKeys, recentBlockFeatureKeys) ??
    (blockedCountLast7d >= 3
      ? "You've hit your plan limits several times this week. Check usage in settings and upgrade for more room."
      : null)

  const isAdminPortalRoute =
    isPlatformAdmin && !isImpersonating && location.pathname.startsWith('/app/admin')

  return (
    <BranchProvider>
      <div className="min-h-screen min-h-[100dvh]" style={{ background: 'var(--bg)' }}>
        <ImpersonationBanner />
        <OfflineBanner />
        <UpgradeModal />
        <PaymentModal />
        <div className="flex">
          {mobileNavOpen && !isAdminPortalRoute && (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
              aria-label="Close navigation menu"
              onClick={() => setMobileNavOpen(false)}
            />
          )}
          {!isAdminPortalRoute && (
            <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
            {(!isPlatformAdmin || isImpersonating) && <BillingOverdueBanner />}
            {(!isPlatformAdmin || isImpersonating) &&
              externallyDisabledFeatures.length > 0 &&
              e && (
                <div className="mx-3 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-2">
                      <Lock className="h-4 w-4 shrink-0 text-amber-800 mt-0.5" aria-hidden />
                      <div>
                        <p className="font-medium text-amber-950">
                          Some features are not available on your account
                        </p>
                        <p className="mt-1 text-amber-900/90">
                          This is set by your organization or platform administrators, not by your
                          subscription plan alone. Restricted capabilities include:{' '}
                          <span className="font-medium">
                            {externallyDisabledFeatures.map((x) => x.label).join(', ')}
                          </span>
                          .
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 self-start font-medium text-amber-950 underline hover:no-underline sm:ml-4"
                      onClick={() => navigate(settingsFeaturesTabPath(e.tenantType))}
                    >
                      View in Settings
                    </button>
                  </div>
                </div>
              )}
            {(!isPlatformAdmin || isImpersonating) && planTierDisabledFeatures.length > 0 && e && (
              <div className="mx-3 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 sm:mx-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-slate-600 mt-0.5" aria-hidden />
                    <div>
                      <p className="font-medium text-slate-900">
                        Some features are limited by your plan tier
                      </p>
                      <p className="mt-1 text-slate-700">
                        Your current subscription does not include:{' '}
                        <span className="font-medium text-slate-900">
                          {planTierDisabledFeatures.map((x) => x.label).join(', ')}
                        </span>
                        . Upgrade to a higher tier to unlock them.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 self-start font-medium text-slate-900 underline hover:no-underline sm:ml-4"
                    onClick={() => openBrowseUpgrade(dispatch, { currentPlan: e?.plan?.name })}
                  >
                    Compare plans
                  </button>
                </div>
              </div>
            )}
            {(!isPlatformAdmin || isImpersonating) && atLimitEntries.length > 0 && (
              <div className="mx-3 mt-4 space-y-2 sm:mx-6">
                {atLimitEntries.map(({ key, current, limit }) => (
                  <LimitExceededBanner
                    key={key}
                    limitKey={key}
                    currentUsage={current}
                    limitValue={limit}
                    currentPlan={e?.plan?.name ?? null}
                    upgradeUrl="/app/settings?tab=subscription"
                  />
                ))}
              </div>
            )}
            {(!isPlatformAdmin || isImpersonating) && nearLimitKeys.length > 0 && (
              <div className="mx-3 mt-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Usage near limit: {nearLimitKeys
                    .map(({ key }) => getLimitLabel(key))
                    .join(', ')}.{' '}
                  <button
                    type="button"
                    className="font-medium underline hover:no-underline"
                    onClick={() => navigate('/app/settings')}
                  >
                    View usage
                  </button>
                </span>
                <button
                  type="button"
                  className="font-medium underline hover:no-underline shrink-0"
                  onClick={() => {
                    const first = nearLimitKeys[0]
                    if (first) {
                      recordConversionEvent({
                        eventType: 'OPEN_UPGRADE',
                        metadata: { source: 'near_limit', limitKey: first.key },
                      }).catch(() => {})
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
                    }
                  }}
                >
                  Upgrade
                </button>
              </div>
            )}
            {(!isPlatformAdmin || isImpersonating) &&
              blockedCountLast7d >= 3 &&
              planBlockNudgeMessage && (
                <div className="mx-3 mt-4 flex flex-col gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text-mid)] sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span>{planBlockNudgeMessage}</span>
                  <button
                    type="button"
                    className="font-medium underline hover:no-underline shrink-0"
                    onClick={() => {
                      recordConversionEvent({ eventType: 'VIEW_PLANS' }).catch(() => {})
                      openBrowseUpgrade(dispatch, { currentPlan: e?.plan?.name })
                    }}
                  >
                    View plans
                  </button>
                </div>
              )}
            <main
              className={
                isAdminPortalRoute ? 'flex min-h-0 flex-1 flex-col' : 'flex-1 p-3 sm:p-4 md:p-6'
              }
            >
              {isAdminPortalRoute ? (
                <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col bg-[var(--surface)]">
                  <Outlet />
                </div>
              ) : (
                <div className="min-h-[calc(100vh-5rem)] rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3 shadow-sm sm:rounded-2xl sm:p-4 md:p-6">
                  <Outlet />
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </BranchProvider>
  )
}
