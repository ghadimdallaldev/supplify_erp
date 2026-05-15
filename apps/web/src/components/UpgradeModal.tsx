import { useAppSelector, useAppDispatch } from '../hooks/redux'
import {
  closeMonetizationModal,
  resetMonetizationModal,
} from '../features/monetization/monetizationSlice'
import {
  useGetRecommendationQuery,
  useGetEntitlementsQuery,
  useGetSubscriptionPlansQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, TrendingUp } from 'lucide-react'
import { useEffect, useRef } from 'react'
import {
  getLimitKeys,
  getFeatureKeys,
  LIMIT_KEY_LABELS,
  FEATURE_KEY_LABELS,
  getPlanSubtitle,
} from '../lib/planComparison'
import { RecommendedBadge } from './RecommendedBadge'

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  bronze: 'Bronze',
  gold: 'Gold',
  platinum: 'Platinum',
}

function formatLimit(val: number | null | undefined): string {
  if (val == null) return '—'
  if (val === -1 || val >= 999999) return 'Unlimited'
  return String(val)
}

function toLimitNum(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

function isBetterLimit(premium: number | null, current: number | null): boolean {
  if (premium == null) return false
  if (current == null) return premium > 0 || premium === -1
  if (premium === -1) return current !== -1
  if (current === -1) return false
  return premium > current
}

function isBetterFeature(premium: boolean, current: boolean): boolean {
  return premium && !current
}

const UPGRADE_SUPPORT_EMAIL = import.meta.env.VITE_UPGRADE_SUPPORT_EMAIL || 'admin@supplify.com'

function normalizeUpgradePath(url: string): string {
  return url.startsWith('/') ? url : `/app/${url}`
}

function isOnUpgradeDestination(
  currentPath: string,
  currentSearch: string,
  target: string
): boolean {
  const [targetPath, targetQuery] = target.split('?')
  if (currentPath !== targetPath) return false
  if (!targetQuery) return currentPath.startsWith('/app/settings')
  const normalizedSearch = currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch
  if (normalizedSearch === targetQuery) return true
  // Settings uses in-page tabs; subscription may be active without ?tab= in the URL.
  return currentPath === '/app/settings' && targetQuery.startsWith('tab=')
}

export function UpgradeModal() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { open, openRevision, type, payload } = useAppSelector((state) => state.monetization)
  const user = useAppSelector((state) => state.auth.user)
  const canUpgrade = user?.tenantPermissions?.includes('SUBSCRIPTIONS_MANAGE') ?? true

  const blocked =
    type === 'limit' && payload && 'limitKey' in payload
      ? `limit:${(payload as { limitKey: string }).limitKey}`
      : type === 'feature' && payload && 'featureKey' in payload
        ? `feature:${(payload as { featureKey: string }).featureKey}`
        : undefined

  const { data: recommendation } = useGetRecommendationQuery({ blocked }, { skip: !open })
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !open })
  const { data: plansData } = useGetSubscriptionPlansQuery(undefined, { skip: !open })
  const [recordConversionEvent] = useRecordConversionEventMutation()

  const entitlements = entitlementsData?.entitlements
  const plans = plansData?.plans ?? []
  const tenantType = entitlements?.tenantType ?? 'RESTAURANT'
  const limitKeys = getLimitKeys(tenantType)
  const featureKeys = getFeatureKeys(tenantType)
  const currentCode = (entitlements?.plan?.code ?? 'free').toLowerCase()
  const recommendedCode = recommendation?.recommendedPlanCode?.toLowerCase() ?? null
  const topPlan = plans.length > 0 ? plans[plans.length - 1] : null
  const topCode = topPlan?.code?.toLowerCase() ?? 'platinum'
  const currentPlanRow = plans.find((p) => (p.code || '').toLowerCase() === currentCode)
  const recommendedPlanRow = plans.find((p) => (p.code || '').toLowerCase() === recommendedCode)
  const mergeUpgradeColumn = Boolean(
    recommendedPlanRow &&
      topPlan &&
      (recommendedPlanRow.code || '').toLowerCase() === (topPlan.code || '').toLowerCase()
  )
  const gridCols = mergeUpgradeColumn ? 'grid-cols-3' : 'grid-cols-4'
  const highlightCell =
    'bg-[var(--brand-pale)] font-medium text-[var(--brand-mid)] border-l-2 border-l-[var(--brand-mid)]'

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

  const handleUpgrade = () => {
    if (!payload) return

    const upgradePath = normalizeUpgradePath(
      (payload as { upgradeUrl?: string }).upgradeUrl || '/app/settings?tab=subscription'
    )
    const onUpgradePage = isOnUpgradeDestination(location.pathname, location.search, upgradePath)
    const planLabel =
      recommendation?.recommendedPlanName ??
      (recommendedCode ? (PLAN_LABELS[recommendedCode] ?? recommendedCode) : 'a paid plan')
    const currentPlan =
      (payload as { currentPlan?: string }).currentPlan ??
      entitlements?.plan?.name ??
      'Current plan'

    recordConversionEvent({
      eventType: canUpgrade ? 'CLICK_UPGRADE' : 'CLOSE_UPGRADE_MODAL',
      metadata: recommendedCode ? { recommendedPlanCode: recommendedCode, source: 'modal' } : {},
    }).catch(() => {})
    if (recommendation?.recommendedPlanCode) {
      recordConversionEvent({
        eventType: 'RECOMMENDATION_CLICKED',
        metadata: { recommendedPlanCode: recommendation.recommendedPlanCode },
      }).catch(() => {})
    }

    if (!canUpgrade) return

    if (onUpgradePage) {
      const subject = encodeURIComponent(`Plan upgrade request (${planLabel})`)
      const body = encodeURIComponent(
        `Hi Supplify team,\n\nI would like to upgrade my workspace to ${planLabel}.\n\nCurrent plan: ${currentPlan}\n\nThank you.`
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
  const recommendedPlans = (payload as { recommendedPlans?: string[] }).recommendedPlans ?? []
  const recommendedPlanName =
    recommendation?.recommendedPlanName ??
    (recommendedCode ? (PLAN_LABELS[recommendedCode] ?? recommendedCode) : null)

  const topPlanName = topPlan?.name ?? (topCode === 'platinum' ? 'Platinum' : 'Top')
  const showPlatinumCta =
    canUpgrade &&
    topPlan &&
    recommendedCode &&
    topCode !== recommendedCode &&
    topCode !== currentCode

  return (
    <Dialog
      key={openRevision}
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'limit' ? (
              <TrendingUp className="h-5 w-5 text-amber-600" />
            ) : isBrowseUpgrade ? (
              <TrendingUp className="h-5 w-5 text-[var(--brand-mid)]" />
            ) : (
              <Lock className="h-5 w-5 text-amber-600" />
            )}
            {type === 'limit'
              ? 'Limit reached'
              : isBrowseUpgrade
                ? 'Upgrade your plan'
                : 'Feature not available'}
          </DialogTitle>
          <DialogDescription>
            {type === 'limit'
              ? `You've reached your plan limit. Upgrade to get more.`
              : isBrowseUpgrade
                ? 'Compare plans and choose what fits your business.'
                : `This feature isn't included in your current plan.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--bg)] p-3 text-sm">
            <p className="font-medium text-[var(--text-mid)]">Current plan: {currentPlanName}</p>
            {type === 'limit' && 'limitKey' in payload && (
              <p className="mt-1 text-[var(--text-muted)]">
                {LIMIT_KEY_LABELS[payload.limitKey] || payload.limitKey}: {payload.currentUsage} /{' '}
                {payload.limitValue}
              </p>
            )}
            {type === 'feature' && 'featureKey' in payload && !isBrowseUpgrade && (
              <p className="mt-1 text-[var(--text-muted)]">
                Feature: {payload.featureKey.replace(/_/g, ' ')}
              </p>
            )}
          </div>

          {(recommendation?.recommendedPlanCode || recommendedPlans.length > 0) && (
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3">
              {recommendation?.recommendedPlanCode ? (
                <p className="text-sm font-medium text-[var(--text-mid)]">
                  Recommended:{' '}
                  <span className="font-semibold">
                    {recommendedPlanName ?? recommendation.recommendedPlanCode}
                  </span>
                </p>
              ) : recommendedPlans.length > 0 ? (
                <p className="text-sm font-medium text-[var(--text-mid)]">
                  Upgrade to unlock:{' '}
                  <span className="font-semibold">{recommendedPlans.join(', ')}</span>
                </p>
              ) : null}
              {(recommendation?.reasonText ?? recommendation?.reason ?? '').trim() ? (
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {recommendation?.reasonText ?? recommendation?.reason}
                </p>
              ) : null}
            </div>
          )}

          {plans.length >= 2 && entitlements && (
            <div className="overflow-hidden rounded-lg border border-[var(--app-border)]">
              <div
                className={`grid ${gridCols} border-b border-[var(--app-border)] bg-[var(--bg)] text-sm`}
              >
                <div className="p-2 font-medium text-[var(--text-mid)]">Feature / Limit</div>
                <div className="p-2">
                  <div className="font-semibold">{currentPlanRow?.name ?? 'Current'}</div>
                  {currentPlanRow?.code && getPlanSubtitle(currentPlanRow.code) && (
                    <div className="text-xs font-normal text-[var(--text-muted)]">
                      {getPlanSubtitle(currentPlanRow.code)}
                    </div>
                  )}
                </div>
                {mergeUpgradeColumn ? (
                  <div className="p-2">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {recommendedPlanRow?.name ?? topPlan?.name ?? 'Upgrade'}
                      <RecommendedBadge
                        planCode={recommendedPlanRow?.code ?? topPlan?.code ?? ''}
                        recommendedPlanCode={recommendation?.recommendedPlanCode}
                        subtle={recommendation?.reasonCode === 'CURRENT_BEST'}
                      />
                    </div>
                    {(() => {
                      const code = recommendedPlanRow?.code ?? topPlan?.code
                      const sub = getPlanSubtitle(code)
                      return sub ? (
                        <div className="text-xs font-normal text-[var(--text-muted)]">{sub}</div>
                      ) : null
                    })()}
                  </div>
                ) : (
                  <>
                    <div className="p-2">
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {recommendedPlanRow?.name ?? 'Recommended'}
                        <RecommendedBadge
                          planCode={recommendedPlanRow?.code ?? ''}
                          recommendedPlanCode={recommendation?.recommendedPlanCode}
                          subtle={recommendation?.reasonCode === 'CURRENT_BEST'}
                        />
                      </div>
                      {recommendedPlanRow?.code && getPlanSubtitle(recommendedPlanRow.code) && (
                        <div className="text-xs font-normal text-[var(--text-muted)]">
                          {getPlanSubtitle(recommendedPlanRow.code)}
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="font-semibold">{topPlan?.name ?? 'Top'}</div>
                      {topPlan?.code && getPlanSubtitle(topPlan.code) && (
                        <div className="text-xs font-normal text-[var(--text-muted)]">
                          {getPlanSubtitle(topPlan.code)}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {limitKeys.map((key) => {
                const cur = currentPlanRow?.limits?.[key] ?? entitlements.limits?.[key]
                const curNum = toLimitNum(cur)
                const rec = recommendedPlanRow?.limits?.[key]
                const recNum = toLimitNum(rec)
                const top = topPlan?.limits?.[key]
                const topNum = toLimitNum(top)
                const recHighlight = isBetterLimit(recNum, curNum)
                const topHighlight = isBetterLimit(topNum, curNum)
                const upgradeHighlight = mergeUpgradeColumn
                  ? recHighlight || topHighlight
                  : recHighlight
                return (
                  <div key={key} className={`grid ${gridCols} border-b text-sm last:border-b-0`}>
                    <div className="p-2 text-[var(--text-muted)]">
                      {LIMIT_KEY_LABELS[key] ?? key}
                    </div>
                    <div className="p-2">{formatLimit(curNum)}</div>
                    <div className={`p-2 ${upgradeHighlight ? highlightCell : ''}`}>
                      {formatLimit(recNum)}
                    </div>
                    {!mergeUpgradeColumn && (
                      <div className={`p-2 ${topHighlight ? highlightCell : ''}`}>
                        {formatLimit(topNum)}
                      </div>
                    )}
                  </div>
                )
              })}
              {featureKeys.map((key) => {
                const cur = currentPlanRow?.features?.[key] ?? entitlements.features?.[key]
                const curVal = typeof cur === 'boolean' ? cur : cur !== 'false' && !!cur
                const rec = recommendedPlanRow?.features?.[key]
                const recVal = typeof rec === 'boolean' ? rec : rec !== 'false' && !!rec
                const top = topPlan?.features?.[key]
                const topVal = typeof top === 'boolean' ? top : top !== 'false' && !!top
                const recHighlight = isBetterFeature(recVal, curVal)
                const topHighlight = isBetterFeature(topVal, curVal)
                const upgradeHighlight = mergeUpgradeColumn
                  ? recHighlight || topHighlight
                  : recHighlight
                return (
                  <div key={key} className={`grid ${gridCols} border-b text-sm last:border-b-0`}>
                    <div className="p-2 text-[var(--text-muted)]">
                      {FEATURE_KEY_LABELS[key] ?? key}
                    </div>
                    <div className="p-2">{curVal ? 'Yes' : 'No'}</div>
                    <div className={`p-2 ${upgradeHighlight ? highlightCell : ''}`}>
                      {recVal ? 'Yes' : 'No'}
                    </div>
                    {!mergeUpgradeColumn && (
                      <div className={`p-2 ${topHighlight ? highlightCell : ''}`}>
                        {topVal ? 'Yes' : 'No'}
                      </div>
                    )}
                  </div>
                )
              })}
              <div
                className={`grid ${gridCols} border-t border-[var(--app-border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text-muted)]`}
              >
                <div className={`p-1 ${mergeUpgradeColumn ? 'col-span-3' : 'col-span-4'}`}>
                  Highlight = higher limit or unlocked feature vs your current plan
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-[var(--text-muted)]">
            Plan changes are applied by your workspace administrator. On the subscription page, use
            the buttons below to request an upgrade by email.
          </p>

          <div className="flex flex-col gap-2 pt-2 sticky bottom-0 bg-[var(--surface)] border-t border-[var(--app-border)] pt-4 -mx-6 px-6 -mb-2 pb-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleUpgrade} className="flex-1 min-w-[10rem]">
                {canUpgrade
                  ? onUpgradePage
                    ? recommendedPlanName
                      ? `Request ${recommendedPlanName} upgrade`
                      : 'Request plan upgrade'
                    : recommendedPlanName
                      ? `Upgrade to ${recommendedPlanName}`
                      : 'View plans in settings'
                  : 'Ask Owner to Upgrade'}
              </Button>
              {showPlatinumCta && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-w-[10rem]"
                  onClick={() => {
                    const subject = encodeURIComponent(`Plan upgrade request (${topPlanName})`)
                    const body = encodeURIComponent(
                      `Hi Supplify team,\n\nI would like to upgrade my workspace to ${topPlanName}.\n\nCurrent plan: ${currentPlanName}\n\nThank you.`
                    )
                    window.location.href = `mailto:${UPGRADE_SUPPORT_EMAIL}?subject=${subject}&body=${body}`
                  }}
                >
                  Request {topPlanName}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleClose}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
