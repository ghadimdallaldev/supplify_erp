import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ImpersonationBanner } from './ImpersonationBanner'
import { UpgradeModal } from './UpgradeModal'
import { PaymentModal } from './billing/PaymentModal'
import { BranchProvider } from '../contexts/BranchContext'
import { TenantBrandingProvider } from './TenantBrandingProvider'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import { refreshBlockedCount } from '../features/monetization/monetizationSlice'
import {
  api,
  useGetEntitlementsQuery,
  useGetBillingStatusQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import {
  getExternallyDisabledFeatures,
  getPlanTierDisabledFeatures,
} from '../lib/externallyControlledFeatures'
import { useCartActions } from '../hooks/useCartActions'
import { formatPlanBlockNudgeMessage } from '../lib/planComparison'
import { isAtEntitlementLimit, shouldShowEntitlementLimit, featureEnabled } from '../lib/planLimits'
import { getAppSocket, releaseAppSocket } from '../lib/appSocket'
import { useImpersonation } from '../hooks/useImpersonation'
import { shouldLoadBillingStatus, shouldRedirectToActivate } from '../lib/billingActivationRedirect'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { RestaurantMobileNav } from './RestaurantMobileNav'
import { SupplierMobileNav } from './SupplierMobileNav'
import { isBillingAlertVisible, LayoutTenantAlerts } from './LayoutTenantAlerts'
import { useNotificationAlerts } from '../hooks/useNotificationAlerts'
import { TooltipProvider } from './ui/tooltip'
import { AdminShell } from './admin/shell'
import { AssistantFab } from './assistant/AssistantFab'

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

  // Prefetch common route chunks after initial load settles (idle + delay).
  useEffect(() => {
    const prefetch = () => {
      import('../pages/DashboardPage')
      import('../pages/OrdersPage')
      import('../pages/StaffPage')
      import('../pages/InventoryPage')
    }
    const schedule =
      typeof requestIdleCallback === 'function'
        ? (cb: () => void) => requestIdleCallback(cb, { timeout: 4000 })
        : (cb: () => void) => window.setTimeout(cb, 2500)
    const t = window.setTimeout(() => schedule(prefetch), 2500)
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
  const { isImpersonating, isPlatformAdmin, shouldLoadTenantEntitlements, isEffectiveRestaurant } =
    useImpersonation()
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
    .sort((a, b) => b.pct - a.pct)

  const atLimitEntries = Object.entries(limits)
    .filter(([key, limit]) => shouldShowEntitlementLimit(key) && limit != null && limit !== -1)
    .map(([key, limit]) => ({
      key,
      current: usage[key] ?? 0,
      limit: limit as number,
    }))
    .filter(({ current, limit }) => isAtEntitlementLimit(current, limit))

  const recentBlockLimitKeys = recentBlockedSummary.limitKeys.map((x) => x.key)
  const recentBlockFeatureKeys = recentBlockedSummary.featureKeys.map((x) => x.key)
  const planBlockNudgeMessage =
    formatPlanBlockNudgeMessage(recentBlockLimitKeys, recentBlockFeatureKeys) ??
    (blockedCountLast7d >= 3
      ? "You've hit your plan limits several times this week. Check usage in settings and upgrade for more room."
      : null)

  const showTenantBanners = !isPlatformAdmin || isImpersonating
  const primaryNearLimit = nearLimitKeys[0]
  const showNearLimitBanner = showTenantBanners && atLimitEntries.length === 0 && primaryNearLimit
  const showTierDisabledBanner =
    showTenantBanners &&
    atLimitEntries.length === 0 &&
    !showNearLimitBanner &&
    planTierDisabledFeatures.length > 0 &&
    e
  const showPlanBlockNudge =
    showTenantBanners &&
    atLimitEntries.length === 0 &&
    !showNearLimitBanner &&
    planTierDisabledFeatures.length === 0 &&
    blockedCountLast7d >= 3 &&
    planBlockNudgeMessage

  const isOnline = useOnlineStatus()

  const isAdminExperience =
    isPlatformAdmin &&
    !isImpersonating &&
    (location.pathname.startsWith('/app/admin') || location.pathname.startsWith('/app/settings'))

  return (
    <TenantBrandingProvider>
      <TooltipProvider delayDuration={400} skipDelayDuration={0}>
        <BranchProvider>
          <div className="min-h-screen min-h-[100dvh]" style={{ background: 'var(--bg)' }}>
            <ImpersonationBanner />
            <UpgradeModal />
            <PaymentModal />
            {isAdminExperience ? (
              <AdminShell>
                <Outlet />
              </AdminShell>
            ) : (
              <div className="flex">
                {mobileNavOpen && (
                  <button
                    type="button"
                    className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
                    aria-label="Close navigation menu"
                    onClick={() => setMobileNavOpen(false)}
                  />
                )}
                <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
                  {showTenantBanners && (
                    <LayoutTenantAlerts
                      showOfflineBanner={!isOnline}
                      showDealsBanner={
                        isEffectiveRestaurant && featureEnabled(e?.features?.supplier_deals)
                      }
                      showBillingBanner={isBillingAlertVisible(billingStatus?.access)}
                      showExternalFeaturesBanner={externallyDisabledFeatures.length > 0}
                      externallyDisabledFeatures={externallyDisabledFeatures}
                      entitlements={e}
                      atLimitEntries={atLimitEntries}
                      showNearLimitBanner={Boolean(showNearLimitBanner)}
                      primaryNearLimit={primaryNearLimit}
                      showTierDisabledBanner={Boolean(showTierDisabledBanner)}
                      planTierDisabledFeatures={planTierDisabledFeatures}
                      showPlanBlockNudge={Boolean(showPlanBlockNudge)}
                      planBlockNudgeMessage={planBlockNudgeMessage}
                      onRecordConversionEvent={(payload) => {
                        recordConversionEvent(payload).catch(() => {})
                      }}
                    />
                  )}
                  <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-4 lg:pb-6 xl:p-6">
                    <Outlet />
                  </main>
                </div>
              </div>
            )}
            {!isAdminExperience && (
              <>
                <RestaurantMobileNav />
                <SupplierMobileNav />
              </>
            )}
            <AssistantFab />
          </div>
        </BranchProvider>
      </TooltipProvider>
    </TenantBrandingProvider>
  )
}
