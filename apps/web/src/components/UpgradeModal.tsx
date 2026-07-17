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
import { activateFreePlanFromPlans } from '../lib/activateFreePlan'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from './ui/dialog'
import { Button } from './ui/button'
import { useNavigate, useLocation } from 'react-router-dom'
import { openCheckoutPayment } from '../lib/openPaymentModal'
import { Check, Minus, TrendingUp } from 'lucide-react'
import { cn } from '../lib/utils'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
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
} from '../lib/planComparison'
import { resolveUpgradeUrl } from '../lib/externallyControlledFeatures'
import type { AppDispatch } from '../store'

function getPlanDisplayName(plan: any): string {
  return plan?.display_name || formatPlanDisplayName(plan?.code, plan?.name)
}

function getPlanPrice(plan: any): string {
  if (plan.price_monthly != null) {
    return plan.price_monthly === 0
      ? getPlanDisplayName(plan)
      : '$' + Number(plan.price_monthly).toLocaleString() + '/mo'
  }
  if (plan.price_per_month != null) {
    const monthly = Number(plan.price_per_month)
    return monthly === 0 ? getPlanDisplayName(plan) : '$' + monthly.toLocaleString() + '/mo'
  }
  return 'Pricing unavailable'
}

function formatLimit(val: number | null | undefined): string {
  if (val == null) return '-'
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

function findPlanByCode(plans: any[], code: string | null | undefined) {
  if (!code) return undefined
  return plans.find((p) => normalizePlanCode(p.code) === normalizePlanCode(code))
}

function findNextUpgradePlan(plans: any[], currentCode: string, recommendedCode: string | null) {
  if (recommendedCode && recommendedCode !== currentCode) {
    const recommended = findPlanByCode(plans, recommendedCode)
    if (recommended) return recommended
  }
  const currentPlanIndex = plans.findIndex((p) => normalizePlanCode(p.code) === currentCode)
  if (currentPlanIndex >= 0 && currentPlanIndex < plans.length - 1) {
    return plans[currentPlanIndex + 1]
  }
  return plans.find((p) => normalizePlanCode(p.code) !== currentCode)
}

export function getVisibleUpgradePlans(plansInput: any[] | undefined) {
  return [...(plansInput ?? [])]
    .filter((p) => {
      const code = (p.code || '').toLowerCase()
      return code !== 'enterprise' && code !== 'free'
    })
    .sort((a, b) => {
      const ai = PLAN_TIER_ORDER.indexOf(
        normalizePlanCode(a.code) as (typeof PLAN_TIER_ORDER)[number]
      )
      const bi = PLAN_TIER_ORDER.indexOf(
        normalizePlanCode(b.code) as (typeof PLAN_TIER_ORDER)[number]
      )
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
}

export function getUpgradeModalPlanAction(targetPlan: any | undefined, pendingActivation: boolean) {
  if (!targetPlan?.id) return null
  return pendingActivation
    ? ({ kind: 'trial', trialTargetPlanId: targetPlan.id } as const)
    : ({ kind: 'checkout', plan: targetPlan } as const)
}

function openPlanCheckout(dispatch: AppDispatch, plan: any, planLabel: string, onDone: () => void) {
  const monthly = Number(plan.price_per_month ?? 0)
  const yearly = plan.price_per_year != null ? Number(plan.price_per_year) : monthly * 12
  onDone()
  openCheckoutPayment(dispatch, {
    planId: plan.id,
    planCode: (plan.code || '').toLowerCase(),
    planName: plan.display_name || planLabel,
    priceMonthly: monthly,
    priceYearly: yearly,
  })
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
  const { t } = useTranslation('common')
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
    skip: !open || !shouldLoadTenantEntitlements,
  })
  const { data: billingStatus } = useGetBillingStatusQuery(undefined, { skip: !open })
  const [recordConversionEvent] = useRecordConversionEventMutation()
  const pendingActivation = Boolean(
    billingStatus?.access?.pendingActivation && billingStatus?.access?.isLocked
  )

  const entitlements = entitlementsData?.entitlements
  const currentCode = normalizePlanCode(entitlements?.plan?.code ?? 'free')
  const plans = getVisibleUpgradePlans(plansData?.plans)
  const tenantType =
    entitlements?.tenantType ?? (user?.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT')
  const limitKeys = getLimitKeys(tenantType)
  const featureKeys = getFeatureKeys(tenantType)
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
  }, [open, payload, recordConversionEvent])

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
      resolveUpgradeUrl((payload as { upgradeUrl?: string }).upgradeUrl, tenantType)
    )
    const onUpgradePage = isOnUpgradeDestination(location.pathname, location.search, upgradePath)
    const code = targetCode ?? recommendedCode ?? null
    const selectedPlan = code ? findPlanByCode(plans, code) : undefined
    const planLabel = selectedPlan
      ? getPlanDisplayName(selectedPlan)
      : code
        ? formatPlanDisplayName(code)
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

    const finishAndClose = () => {
      dispatch(closeMonetizationModal())
      schedulePayloadReset()
    }

    const targetPlan =
      findPlanByCode(plans, code) ??
      (showPlans ? findNextUpgradePlan(plans, currentCode, recommendedCode) : undefined)

    const planAction = getUpgradeModalPlanAction(targetPlan, pendingActivation)
    if (planAction?.kind === 'trial') {
      finishAndClose()
      void activateFreePlanFromPlans(dispatch, plansData?.plans, planAction.trialTargetPlanId).then(
        (result) => {
          if (result.ok) {
            toast.success(t('toast.freePlanActive'))
            navigate('/app', { replace: true })
          } else {
            toast.error(result.message)
          }
        }
      )
      return
    }

    if (planAction?.kind === 'checkout') {
      openPlanCheckout(dispatch, planAction.plan, planLabel, finishAndClose)
      return
    }

    if (showPlans) {
      toast.error(t('toast.checkoutStartFailed'))
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

    finishAndClose()
    navigate(upgradePath)
  }

  if (!payload) return null

  const isBrowseUpgrade =
    type === 'feature' &&
    'featureKey' in payload &&
    (payload as { featureKey: string }).featureKey === 'upgrade_prompt'

  const upgradePath = normalizeUpgradePath(
    resolveUpgradeUrl((payload as { upgradeUrl?: string }).upgradeUrl, tenantType)
  )
  const onUpgradePage = isOnUpgradeDestination(location.pathname, location.search, upgradePath)
  const nextUpgradePlan = showPlans
    ? findNextUpgradePlan(plans, currentCode, recommendedCode)
    : undefined
  const nextUpgradeCode = nextUpgradePlan ? normalizePlanCode(nextUpgradePlan.code) : null
  const nextUpgradeName = nextUpgradePlan ? getPlanDisplayName(nextUpgradePlan) : null

  const currentPlanName =
    (payload as { currentPlan?: string }).currentPlan ?? entitlements?.plan?.name ?? 'Current plan'
  const recommendedPlan = recommendedCode ? findPlanByCode(plans, recommendedCode) : undefined
  const recommendedPlanName =
    recommendation?.recommendedPlanName ??
    (recommendedPlan
      ? getPlanDisplayName(recommendedPlan)
      : recommendedCode
        ? formatPlanDisplayName(recommendedCode)
        : null)

  const colCount = Math.max(plans.length, 1)

  return (
    <Dialog
      key={openRevision}
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
      }}
    >
      <DialogContent size="wide" scroll="split">
        <DialogBody>
          <DialogHeader className="pe-8">
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
                  ? 'Compare plans and upgrade or downgrade at any time.'
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
                Loading plans...
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

            {/* Single aligned compare grid: headers + limits + features share columns */}
            {showPlans && (
              <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
                <div
                  className="w-full"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `minmax(9rem, 11.5rem) repeat(${colCount}, minmax(0, 1fr))`,
                  }}
                >
                  {/* Corner + plan headers */}
                  <div className="sticky start-0 z-[1] border-b border-[var(--app-border)] bg-[var(--bg)] p-3 sm:p-4">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Compare
                    </p>
                  </div>
                  {plans.map((plan, i) => {
                    const code = (plan.code || '').toLowerCase()
                    const isCurrent = code === currentCode
                    const isRecommended =
                      code === recommendedCode && recommendedCode !== currentCode
                    const isAbove = i > currentPlanIndex
                    const isBelow = i < currentPlanIndex && !isCurrent
                    const planLabel = getPlanDisplayName(plan)
                    const blurb = getPlanSubtitle(plan.code, plan.display_name || plan.name)

                    return (
                      <div
                        key={plan.id ?? plan.code}
                        className={cn(
                          'flex flex-col gap-2 border-b border-s border-[var(--app-border)] p-3 sm:p-4',
                          isCurrent && 'bg-[var(--brand-ultra)]',
                          isRecommended && !isCurrent && 'bg-[var(--surface)]'
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'text-sm font-semibold leading-tight',
                              isCurrent ? 'text-[var(--brand-mid)]' : 'text-[var(--text)]'
                            )}
                          >
                            {planLabel}
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
                        {blurb ? (
                          <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                            {blurb}
                          </p>
                        ) : null}
                        <p className="text-xl font-bold tracking-tight text-[var(--text)]">
                          {getPlanPrice(plan)}
                        </p>
                        <div className="mt-auto pt-1">
                          {isCurrent ? (
                            <button
                              type="button"
                              disabled
                              className="touch-target w-full cursor-default rounded-md border border-[var(--app-border)] bg-[var(--bg)] py-2 text-xs text-[var(--text-muted)]"
                            >
                              Current plan
                            </button>
                          ) : !canUpgrade ? (
                            <button
                              type="button"
                              disabled
                              className="touch-target w-full cursor-default rounded-md border border-[var(--app-border)] py-2 text-xs text-[var(--text-muted)]"
                            >
                              Ask owner
                            </button>
                          ) : isAbove ? (
                            <button
                              type="button"
                              className="touch-target relative z-10 w-full cursor-pointer rounded-md py-2 text-xs font-semibold text-white"
                              style={{
                                background: isRecommended ? 'var(--brand)' : 'var(--brand-mid)',
                              }}
                              onClick={() => handleUpgrade(code)}
                            >
                              {pendingActivation
                                ? t('upgradeModal.startTrialOf', { planName: planLabel })
                                : `Upgrade to ${planLabel}`}
                            </button>
                          ) : isBelow ? (
                            <button
                              type="button"
                              className="touch-target relative z-10 w-full cursor-pointer rounded-md border border-[var(--app-border)] py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg)]"
                              onClick={() => handleUpgrade(code)}
                            >
                              Downgrade to {planLabel}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}

                  {showComparison &&
                    limitKeys.map((key) => (
                      <div key={`limit-${key}`} className="contents">
                        <div className="sticky start-0 z-[1] border-b border-[var(--app-border)] bg-[var(--surface)] p-2.5 text-xs font-medium text-[var(--text-mid)] sm:p-3">
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
                              key={`${plan.code}-${key}`}
                              className={cn(
                                'border-b border-s border-[var(--app-border)] p-2.5 text-center text-sm tabular-nums sm:p-3',
                                isCurrent &&
                                  'bg-[var(--brand-ultra)] font-semibold text-[var(--brand-mid)]',
                                better && 'font-medium text-emerald-700',
                                worse && !isCurrent && 'text-[var(--text-muted)]',
                                !isCurrent && !better && !worse && 'text-[var(--text)]'
                              )}
                            >
                              {formatLimit(val)}
                            </div>
                          )
                        })}
                      </div>
                    ))}

                  {showComparison &&
                    featureKeys.map((key) => (
                      <div key={`feature-${key}`} className="contents">
                        <div className="sticky start-0 z-[1] border-b border-[var(--app-border)] bg-[var(--surface)] p-2.5 text-xs font-medium text-[var(--text-mid)] last:border-b-0 sm:p-3">
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
                              key={`${plan.code}-f-${key}`}
                              className={cn(
                                'flex flex-col items-center justify-center gap-0.5 border-b border-s border-[var(--app-border)] p-2.5 last:border-b-0 sm:p-3',
                                isCurrent && 'bg-[var(--brand-ultra)]'
                              )}
                            >
                              {cell.enabled ? (
                                <>
                                  <Check
                                    className={cn(
                                      'h-4 w-4',
                                      isCurrent ? 'text-[var(--brand-mid)]' : 'text-emerald-600'
                                    )}
                                    strokeWidth={2.5}
                                  />
                                  {cell.caption && (
                                    <span className="max-w-[6.5rem] text-center text-[10px] leading-tight text-[var(--text-muted)]">
                                      {cell.caption}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <Minus className="h-4 w-4 text-[var(--app-border-mid)]" />
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
          </div>
        </DialogBody>

        {/* Bottom actions outside scroll so taps are not blocked on mobile */}
        <div className="action-bar shrink-0 flex-col border-t border-[var(--app-border)] bg-[var(--surface)] px-4 py-4 sm:flex-row sm:px-6">
          {canUpgrade && recommendedCode && recommendedCode !== currentCode && (
            <Button
              type="button"
              onClick={() => handleUpgrade()}
              className="touch-target w-full sm:w-auto sm:min-w-[10rem]"
            >
              {pendingActivation
                ? t('upgradeModal.startTrialOf', {
                    planName: recommendedPlanName ?? t('upgradeModal.recommendedPlanFallback'),
                  })
                : onUpgradePage
                  ? `Request ${recommendedPlanName ?? 'upgrade'}`
                  : `Upgrade to ${recommendedPlanName ?? 'recommended plan'}`}
            </Button>
          )}
          {canUpgrade &&
            (!recommendedCode || recommendedCode === currentCode) &&
            !isBrowseUpgrade &&
            showPlans &&
            nextUpgradeCode &&
            nextUpgradeCode !== currentCode && (
              <Button
                type="button"
                onClick={() => handleUpgrade(nextUpgradeCode)}
                className="touch-target w-full sm:w-auto sm:min-w-[10rem]"
              >
                {pendingActivation
                  ? t('upgradeModal.startTrialOf', {
                      planName: nextUpgradeName ?? t('upgradeModal.nextPlanFallback'),
                    })
                  : onUpgradePage
                    ? `Request ${nextUpgradeName ?? 'upgrade'}`
                    : `Upgrade to ${nextUpgradeName ?? 'next plan'}`}
              </Button>
            )}
          {canUpgrade &&
            (!recommendedCode || recommendedCode === currentCode) &&
            !isBrowseUpgrade &&
            !showPlans && (
              <Button
                type="button"
                onClick={() => handleUpgrade()}
                className="touch-target w-full sm:w-auto sm:min-w-[10rem]"
              >
                {onUpgradePage ? 'Request plan upgrade' : 'View plans in settings'}
              </Button>
            )}
          <Button
            type="button"
            variant="outline"
            className="touch-target w-full sm:w-auto"
            onClick={handleClose}
          >
            {isBrowseUpgrade ? 'Close' : 'Dismiss'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
