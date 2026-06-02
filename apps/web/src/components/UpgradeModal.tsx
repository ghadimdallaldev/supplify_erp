import { useAppSelector, useAppDispatch } from '../hooks/redux'
import {
  closeMonetizationModal,
  resetMonetizationModal,
} from '../features/monetization/monetizationSlice'
import {
  useGetRecommendationQuery,
  useGetEntitlementsQuery,
  useGetSubscriptionPlansQuery,
  useGetBillingStatusQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { activateFreePlanFromPlans, openFreePlanCheckout } from '../lib/activateFreePlan'
import toast from 'react-hot-toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useNavigate, useLocation } from 'react-router-dom'
import { openCheckoutPayment } from '../lib/openPaymentModal'
import { Check, Lock, Minus, TrendingUp } from 'lucide-react'
import { cn } from '../lib/utils'
import { useEffect, useRef } from 'react'
import { useImpersonation } from '../hooks/useImpersonation'
import { usePermissions } from '../hooks/usePermissions'
import {
  getLimitKeys,
  getFeatureKeys,
  LIMIT_KEY_LABELS,
  FEATURE_KEY_LABELS,
  formatPlanFeatureCell,
  getPlanSubtitle,
  PLAN_TIER_ORDER,
  normalizePlanCode,
  formatPlanDisplayName,
  getV2SupplierPlanPositioningHint,
  getV2RestaurantUpgradeSubtitle,
} from '../lib/planComparison'
import { useSupplifyModel } from '../hooks/useSupplifyModel'

const PLAN_PRICE_FALLBACK: Record<string, string> = {
  free: '$0 trial',
  silver: '$49/mo',
  gold: '$149/mo',
  platinum: '$349/mo',
}

function getPlanPrice(plan: any): string {
  if (plan.price_monthly != null) {
    return plan.price_monthly === 0
      ? formatPlanDisplayName(plan.code, plan.name)
      : `$${plan.price_monthly}/mo`
  }
  return PLAN_PRICE_FALLBACK[normalizePlanCode(plan.code)] ?? '—'
}

function formatLimit(val: number | null | undefined): string {
  if (val == null) return '—'
  if (val === -1 || val >= 999999) return 'Unlimited'
  return val.toLocaleString()
}

function toLimitNum(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

function isBetterLimit(a: number | null, b: number | null): boolean {
  if (a == null) return false
  if (b == null) return a > 0 || a === -1
  if (a === -1) return b !== -1
  if (b === -1) return false
  return a > b
}

function isWorseThanCurrent(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false
  if (b === -1) return a !== -1 && a >= 0
  if (a === -1) return false
  return a < b
}

const UPGRADE_SUPPORT_EMAIL = import.meta.env.VITE_UPGRADE_SUPPORT_EMAIL || 'admin@supplify.com'

function normalizeUpgradePath(url: string): string {
  return url.startsWith('/') ? url : `/app/${url}`
}

function isOnUpgradeDestination(path: string, search: string, target: string): boolean {
  const [targetPath, targetQuery] = target.split('?')
  if (path !== targetPath) return false
  if (!targetQuery) return path.startsWith('/app/settings')
  const s = search.startsWith('?') ? search.slice(1) : search
  if (s === targetQuery) return true
  return path === '/app/settings' && targetQuery.startsWith('tab=')
}

export function UpgradeModal() {
  const { isV2 } = useSupplifyModel()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { open, openRevision, type, payload } = useAppSelector((state) => state.monetization)
  const user = useAppSelector((state) => state.auth.user)
  const { can } = usePermissions()
  const canUpgrade = user ? can('SUBSCRIPTIONS_MANAGE') : false
  const { shouldLoadTenantEntitlements } = useImpersonation()

  const blocked =
    type === 'limit' && payload && 'limitKey' in payload
      ? `limit:${(payload as { limitKey: string }).limitKey}`
      : type === 'feature' && payload && 'featureKey' in payload
        ? `feature:${(payload as { featureKey: string }).featureKey}`
        : undefined

  const { data: recommendation } = useGetRecommendationQuery({ blocked }, { skip: !open })
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const {
    data: plansData,
    isLoading: plansLoading,
    isError: plansError,
  } = useGetSubscriptionPlansQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const { data: billingStatus } = useGetBillingStatusQuery(undefined, { skip: !open })
  const [recordConversionEvent] = useRecordConversionEventMutation()
  const pendingActivation = Boolean(
    billingStatus?.access?.pendingActivation && billingStatus?.access?.isLocked
  )

  const entitlements = entitlementsData?.entitlements
  const plans = [...(plansData?.plans ?? [])]
    .filter((p) => (p.code || '').toLowerCase() !== 'enterprise')
    .sort((a, b) => {
      const ai = PLAN_TIER_ORDER.indexOf(
        normalizePlanCode(a.code) as (typeof PLAN_TIER_ORDER)[number]
      )
      const bi = PLAN_TIER_ORDER.indexOf(
        normalizePlanCode(b.code) as (typeof PLAN_TIER_ORDER)[number]
      )
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  const tenantType =
    entitlements?.tenantType ?? (user?.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT')
  const limitKeys = getLimitKeys(tenantType)
  const featureKeys = getFeatureKeys(tenantType)
  const currentCode = normalizePlanCode(entitlements?.plan?.code ?? 'free')
  const recommendedCode = recommendation?.recommendedPlanCode
    ? normalizePlanCode(recommendation.recommendedPlanCode)
    : null
  const currentPlanIndex = plans.findIndex((p) => normalizePlanCode(p.code) === currentCode)
  const currentPlanRow = plans.find((p) => normalizePlanCode(p.code) === currentCode)
  const plansLoadingState = plansLoading && plans.length === 0
  const showPlans = !plansLoadingState && plans.length >= 1
  const showComparison = showPlans && plans.length >= 2

  useEffect(() => {
    if (open)
      recordConversionEvent({
        eventType: 'OPEN_UPGRADE',
        metadata: payload as Record<string, unknown>,
      }).catch(() => {})
  }, [open, recordConversionEvent])

  useEffect(() => {
    if (open && recommendation?.recommendedPlanCode) {
      recordConversionEvent({
        eventType: 'RECOMMENDATION_SHOWN',
        metadata: { recommendedPlanCode: recommendation.recommendedPlanCode },
      }).catch(() => {})
    }
  }, [open, recommendation?.recommendedPlanCode, recordConversionEvent])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const schedulePayloadReset = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      dispatch(resetMonetizationModal())
      resetTimerRef.current = null
    }, 300)
  }

  const handleClose = () => {
    recordConversionEvent({ eventType: 'CLOSE_UPGRADE_MODAL' }).catch(() => {})
    dispatch(closeMonetizationModal())
    schedulePayloadReset()
  }

  const handleUpgrade = (targetCode?: string) => {
    if (!payload) return

    const upgradePath = normalizeUpgradePath(
      (payload as { upgradeUrl?: string }).upgradeUrl || '/app/settings?tab=subscription'
    )
    const onUpgradePage = isOnUpgradeDestination(location.pathname, location.search, upgradePath)
    const code = targetCode ?? recommendedCode ?? null
    const planLabel = code
      ? formatPlanDisplayName(code, plans.find((p) => normalizePlanCode(p.code) === code)?.name)
      : (recommendation?.recommendedPlanName ?? 'a paid plan')
    const currentPlan =
      (payload as { currentPlan?: string }).currentPlan ??
      entitlements?.plan?.name ??
      'Current plan'

    recordConversionEvent({
      eventType: canUpgrade ? 'CLICK_UPGRADE' : 'CLOSE_UPGRADE_MODAL',
      metadata: code ? { recommendedPlanCode: code, source: 'modal' } : {},
    }).catch(() => {})
    if (code) {
      recordConversionEvent({
        eventType: 'RECOMMENDATION_CLICKED',
        metadata: { recommendedPlanCode: code },
      }).catch(() => {})
    }

    if (!canUpgrade) return

    const targetPlan = code
      ? plans.find((p) => normalizePlanCode(p.code) === code)
      : plans.find((p) => normalizePlanCode(p.code) === (recommendedCode ?? ''))

    if (targetPlan?.id && (targetPlan.code || '').toLowerCase() === 'free') {
      dispatch(closeMonetizationModal())
      schedulePayloadReset()
      void activateFreePlanFromPlans(dispatch, plans).then((result) => {
        if (result.ok) {
          toast.success(
            pendingActivation
              ? 'Your free plan is active.'
              : 'You are now on the Free testing plan. Upgrade anytime for production use.'
          )
          if (pendingActivation) navigate('/app', { replace: true })
        } else {
          toast.error(result.message)
        }
      })
      return
    }

    if (targetPlan && targetPlan.id) {
      const monthly = Number(targetPlan.price_per_month ?? 0)
      const yearly =
        targetPlan.price_per_year != null ? Number(targetPlan.price_per_year) : monthly * 12
      dispatch(closeMonetizationModal())
      schedulePayloadReset()
      openCheckoutPayment(dispatch, {
        planId: targetPlan.id,
        planCode: (targetPlan.code || '').toLowerCase(),
        planName: targetPlan.name || planLabel,
        priceMonthly: monthly,
        priceYearly: yearly,
      })
      return
    }

    if (onUpgradePage) {
      const subject = encodeURIComponent(`Plan change request (${planLabel})`)
      const body = encodeURIComponent(
        `Hi Supplify team,\n\nI would like to change my workspace plan to ${planLabel}.\n\nCurrent plan: ${currentPlan}\n\nThank you.`
      )
      window.location.href = `mailto:${UPGRADE_SUPPORT_EMAIL}?subject=${subject}&body=${body}`
      return
    }

    dispatch(closeMonetizationModal())
    schedulePayloadReset()
    navigate(upgradePath)
  }

  if (!payload) return null

  const isBrowseUpgrade =
    type === 'feature' &&
    'featureKey' in payload &&
    (payload as { featureKey: string }).featureKey === 'upgrade_prompt'

  const upgradePath = normalizeUpgradePath(
    (payload as { upgradeUrl?: string }).upgradeUrl || '/app/settings?tab=subscription'
  )
  const onUpgradePage = isOnUpgradeDestination(location.pathname, location.search, upgradePath)

  const currentPlanName =
    (payload as { currentPlan?: string }).currentPlan ?? entitlements?.plan?.name ?? 'Current plan'
  const recommendedPlanName =
    recommendation?.recommendedPlanName ??
    (recommendedCode ? formatPlanDisplayName(recommendedCode) : null)

  const colCount = Math.max(plans.length, 1)

  return (
    <Dialog
      key={openRevision}
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'limit' || (!isBrowseUpgrade && type === 'feature') ? (
              <TrendingUp className="h-5 w-5 text-amber-600" />
            ) : (
              <TrendingUp className="h-5 w-5 text-[var(--brand-mid)]" />
            )}
            {type === 'limit'
              ? 'Upgrade your plan'
              : isBrowseUpgrade
                ? 'Plans & Pricing'
                : 'Feature not available on your plan'}
          </DialogTitle>
          <DialogDescription>
            {type === 'limit'
              ? `You've reached your ${LIMIT_KEY_LABELS[(payload as any).limitKey] ?? 'plan'} limit. Upgrade to continue.`
              : isBrowseUpgrade
                ? isV2
                  ? getV2SupplierPlanPositioningHint() ||
                    'Compare plans and upgrade or downgrade at any time.'
                  : 'Compare plans and upgrade or downgrade at any time.'
                : isV2
                  ? getV2RestaurantUpgradeSubtitle() || 'This feature requires a higher plan tier.'
                  : 'This feature requires a higher plan tier.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Context banner */}
          {type === 'limit' && 'limitKey' in payload && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="font-medium text-amber-900">
                {LIMIT_KEY_LABELS[(payload as any).limitKey] || (payload as any).limitKey}:{' '}
                {(payload as any).currentUsage} / {(payload as any).limitValue} used
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                You're on the <span className="font-semibold">{currentPlanName}</span> plan.
              </p>
            </div>
          )}
          {type === 'feature' && 'featureKey' in payload && !isBrowseUpgrade && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="font-medium text-amber-900">
                <span className="font-semibold">
                  {FEATURE_KEY_LABELS[(payload as any).featureKey] ??
                    (payload as any).featureKey.replace(/_/g, ' ')}
                </span>{' '}
                is not included in your <span className="font-semibold">{currentPlanName}</span>{' '}
                plan.
              </p>
            </div>
          )}

          {/* Recommendation banner */}
          {recommendation?.recommendedPlanCode &&
            recommendation.reasonCode !== 'CURRENT_BEST' &&
            recommendedCode !== currentCode && (
              <div className="rounded-lg border border-[var(--brand-pale)] bg-[var(--brand-ultra)] px-4 py-3 text-sm">
                <p className="font-medium text-[var(--brand-mid)]">
                  We recommend: <span className="font-semibold">{recommendedPlanName}</span>
                </p>
                {(recommendation.reasonText ?? (recommendation as any).reason ?? '').trim() && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {recommendation.reasonText ?? (recommendation as any).reason}
                  </p>
                )}
              </div>
            )}

          {/* Loading / error states */}
          {plansLoadingState && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-[var(--text-muted)]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-mid)] border-t-transparent" />
              Loading plans…
            </div>
          )}
          {!plansLoadingState && plansError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              We could not load plan options. Try again in a moment or contact support.
            </p>
          )}
          {!plansLoadingState && !plansError && plans.length === 0 && (
            <p className="rounded-lg border border-[var(--app-border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-muted)]">
              No plans are available for your account type yet.
            </p>
          )}

          {/* Plan cards */}
          {showPlans && (
            <div
              className={cn(
                'grid gap-3 grid-cols-1 min-w-0',
                colCount >= 2 && 'sm:grid-cols-2',
                colCount >= 3 && 'lg:grid-cols-3',
                colCount >= 4 && 'xl:grid-cols-4'
              )}
            >
              {plans.map((plan, i) => {
                const code = (plan.code || '').toLowerCase()
                const isCurrent = code === currentCode
                const isRecommended = code === recommendedCode && recommendedCode !== currentCode
                const isAbove = i > currentPlanIndex
                const isBelow = i < currentPlanIndex && !isCurrent

                return (
                  <div
                    key={plan.id ?? plan.code}
                    className={`flex flex-col gap-2 rounded-lg border p-3 sm:p-4 ${
                      isCurrent
                        ? 'border-[var(--brand-mid)] bg-[var(--brand-ultra)] ring-1 ring-[var(--brand-mid)]'
                        : isRecommended
                          ? 'border-[var(--brand)] bg-[var(--surface)]'
                          : 'border-[var(--app-border)] bg-[var(--surface)]'
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isCurrent ? 'text-[var(--brand-mid)]' : 'text-[var(--text-mid)]'
                          }`}
                        >
                          {plan.name}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-[var(--brand)] px-2 py-0.5 text-[10px] font-semibold text-white">
                            Your plan
                          </span>
                        )}
                        {isRecommended && (
                          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {getPlanSubtitle(plan.code)}
                      </p>
                    </div>

                    <p className="text-lg font-bold text-[var(--text)]">{getPlanPrice(plan)}</p>

                    <div className="flex-1" />

                    {isCurrent ? (
                      pendingActivation && code === 'free' && canUpgrade ? (
                        <button
                          type="button"
                          className="w-full cursor-pointer rounded-md py-2 text-xs font-semibold text-white"
                          style={{ background: 'var(--brand-mid)' }}
                          onClick={() => handleUpgrade(code)}
                        >
                          Activate free plan
                        </button>
                      ) : (
                        <button
                          disabled
                          className="w-full cursor-default rounded-md border border-[var(--app-border)] bg-[var(--bg)] py-2 text-xs text-[var(--text-muted)]"
                        >
                          Current plan
                        </button>
                      )
                    ) : !canUpgrade ? (
                      <button
                        disabled
                        className="w-full cursor-default rounded-md border border-[var(--app-border)] py-2 text-xs text-[var(--text-muted)]"
                      >
                        Ask owner
                      </button>
                    ) : isAbove ? (
                      <button
                        className="w-full cursor-pointer rounded-md py-1.5 text-xs font-semibold text-white"
                        style={{
                          background: isRecommended ? 'var(--brand)' : 'var(--brand-mid)',
                        }}
                        onClick={() => handleUpgrade(code)}
                      >
                        Upgrade to {plan.name}
                      </button>
                    ) : isBelow ? (
                      <button
                        className="w-full cursor-pointer rounded-md border border-[var(--app-border)] py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg)]"
                        onClick={() => handleUpgrade(code)}
                      >
                        Downgrade to {plan.name}
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {/* Comparison table */}
          {showComparison && (
            <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
              <div className="min-w-[520px]">
                {/* Header row */}
                <div
                  className="grid border-b border-[var(--app-border)] bg-[var(--bg)]"
                  style={{ gridTemplateColumns: `1.4fr repeat(${colCount}, 1fr)` }}
                >
                  <div className="p-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    Plan details
                  </div>
                  {plans.map((plan) => {
                    const code = (plan.code || '').toLowerCase()
                    const isCurrent = code === currentCode
                    return (
                      <div
                        key={plan.code}
                        className={`p-2 text-center ${isCurrent ? 'bg-[var(--brand-ultra)]' : ''}`}
                      >
                        <div
                          className={`text-xs font-semibold ${
                            isCurrent ? 'text-[var(--brand-mid)]' : 'text-[var(--text-mid)]'
                          }`}
                        >
                          {plan.name}
                          {isCurrent && ' ✓'}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Limit rows */}
                {limitKeys.map((key) => (
                  <div
                    key={key}
                    className="grid border-b border-[var(--app-border)] last:border-b-0"
                    style={{ gridTemplateColumns: `1.4fr repeat(${colCount}, 1fr)` }}
                  >
                    <div className="p-2 text-xs text-[var(--text-muted)]">
                      {LIMIT_KEY_LABELS[key] ?? key}
                    </div>
                    {plans.map((plan) => {
                      const code = (plan.code || '').toLowerCase()
                      const isCurrent = code === currentCode
                      const rawVal = isCurrent
                        ? (currentPlanRow?.limits?.[key] ?? entitlements?.limits?.[key])
                        : plan.limits?.[key]
                      const val = toLimitNum(rawVal)
                      const curVal = toLimitNum(
                        currentPlanRow?.limits?.[key] ?? entitlements?.limits?.[key]
                      )
                      const better = !isCurrent && isBetterLimit(val, curVal)
                      const worse = !isCurrent && isWorseThanCurrent(val, curVal)
                      return (
                        <div
                          key={plan.code}
                          className={`p-2 text-center text-xs ${
                            isCurrent
                              ? 'bg-[var(--brand-ultra)] font-semibold text-[var(--brand-mid)]'
                              : better
                                ? 'font-medium text-emerald-700'
                                : worse
                                  ? 'text-[var(--text-muted)]'
                                  : 'text-[var(--text)]'
                          }`}
                        >
                          {formatLimit(val)}
                        </div>
                      )
                    })}
                  </div>
                ))}

                {/* Feature rows */}
                {featureKeys.map((key) => (
                  <div
                    key={key}
                    className="grid border-b border-[var(--app-border)] last:border-b-0"
                    style={{ gridTemplateColumns: `1.4fr repeat(${colCount}, 1fr)` }}
                  >
                    <div className="p-2 text-xs text-[var(--text-muted)]">
                      {FEATURE_KEY_LABELS[key] ?? key}
                    </div>
                    {plans.map((plan) => {
                      const code = (plan.code || '').toLowerCase()
                      const isCurrent = code === currentCode
                      const rawVal = isCurrent
                        ? (currentPlanRow?.features?.[key] ?? entitlements?.features?.[key])
                        : plan.features?.[key]
                      const cell = formatPlanFeatureCell(key, rawVal)
                      const curRaw =
                        currentPlanRow?.features?.[key] ?? entitlements?.features?.[key]
                      const curCell = formatPlanFeatureCell(key, curRaw)
                      const better = !isCurrent && cell.enabled && !curCell.enabled
                      return (
                        <div
                          key={plan.code}
                          className={`flex flex-col items-center justify-center gap-0.5 p-2 ${
                            isCurrent ? 'bg-[var(--brand-ultra)]' : ''
                          }`}
                        >
                          {cell.enabled ? (
                            <>
                              <Check
                                className={`h-3.5 w-3.5 ${
                                  isCurrent
                                    ? 'text-[var(--brand-mid)]'
                                    : better
                                      ? 'text-emerald-600'
                                      : 'text-[var(--text-muted)]'
                                }`}
                              />
                              {cell.caption && (
                                <span className="text-[9px] leading-tight text-[var(--text-muted)] text-center">
                                  {cell.caption}
                                </span>
                              )}
                            </>
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-[var(--app-border-mid)]" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!canUpgrade && (
            <p className="text-xs text-[var(--text-muted)]">
              Plan changes require workspace owner permissions. Ask your account owner to upgrade.
            </p>
          )}

          {/* Bottom actions */}
          <div className="-mb-2 -mx-4 action-bar border-t border-[var(--app-border)] bg-[var(--surface)] px-4 pb-2 pt-4 sticky bottom-0 sm:-mx-6 sm:px-6">
            {canUpgrade && recommendedCode && recommendedCode !== currentCode && (
              <Button
                type="button"
                onClick={() => handleUpgrade()}
                className="w-full sm:w-auto sm:min-w-[10rem]"
              >
                {onUpgradePage
                  ? `Request ${recommendedPlanName ?? 'upgrade'}`
                  : `Upgrade to ${recommendedPlanName ?? 'recommended plan'}`}
              </Button>
            )}
            {canUpgrade &&
              (!recommendedCode || recommendedCode === currentCode) &&
              !isBrowseUpgrade && (
                <Button
                  type="button"
                  onClick={() => handleUpgrade()}
                  className="w-full sm:w-auto sm:min-w-[10rem]"
                >
                  {onUpgradePage ? 'Request plan upgrade' : 'View plans in settings'}
                </Button>
              )}
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleClose}
            >
              {isBrowseUpgrade ? 'Close' : 'Dismiss'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
