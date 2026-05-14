import { useAppSelector, useAppDispatch } from '../hooks/redux'
import { closeMonetizationModal } from '../features/monetization/monetizationSlice'
import {
  useGetRecommendationQuery,
  useGetEntitlementsQuery,
  useGetSubscriptionPlansQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useNavigate } from 'react-router-dom'
import { Lock, TrendingUp } from 'lucide-react'
import { useEffect } from 'react'
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

export function UpgradeModal() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { open, type, payload } = useAppSelector((state) => state.monetization)
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

  const handleClose = () => {
    recordConversionEvent({ eventType: 'CLOSE_UPGRADE_MODAL' }).catch(() => {})
    dispatch(closeMonetizationModal())
  }

  const handleUpgrade = () => {
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
    if (canUpgrade) {
      dispatch(closeMonetizationModal())
      const path = (payload as { upgradeUrl?: string })?.upgradeUrl || '/app/settings'
      navigate(path.startsWith('/') ? path : `/app/${path}`)
    }
  }

  if (!payload) return null

  const isBrowseUpgrade =
    type === 'feature' &&
    'featureKey' in payload &&
    (payload as { featureKey: string }).featureKey === 'upgrade_prompt'

  const currentPlanName =
    (payload as { currentPlan?: string }).currentPlan ?? entitlements?.plan?.name ?? 'Current plan'
  const recommendedPlans = (payload as { recommendedPlans?: string[] }).recommendedPlans ?? []
  const recommendedPlanName =
    recommendation?.recommendedPlanName ??
    (recommendedCode ? (PLAN_LABELS[recommendedCode] ?? recommendedCode) : null)

  return (
    <Dialog
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
              <TrendingUp className="h-5 w-5 text-primary" />
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
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-700">Current plan: {currentPlanName}</p>
            {type === 'limit' && 'limitKey' in payload && (
              <p className="mt-1 text-gray-600">
                {LIMIT_KEY_LABELS[payload.limitKey] || payload.limitKey}: {payload.currentUsage} /{' '}
                {payload.limitValue}
              </p>
            )}
            {type === 'feature' && 'featureKey' in payload && !isBrowseUpgrade && (
              <p className="mt-1 text-gray-600">Feature: {payload.featureKey.replace(/_/g, ' ')}</p>
            )}
          </div>

          {(recommendation?.recommendedPlanCode || recommendedPlans.length > 0) && (
            <div>
              <p className="text-sm font-medium text-gray-700">
                {recommendation?.recommendedPlanCode ? (
                  <>
                    Recommended:{' '}
                    <span className="font-semibold">
                      {recommendedPlanName ?? recommendation.recommendedPlanCode}
                    </span>
                  </>
                ) : (
                  'Upgrade to unlock:'
                )}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {recommendation?.reasonText ?? recommendation?.reason ?? ''}
              </p>
              {recommendedPlans.length > 0 && !recommendation?.recommendedPlanCode && (
                <p className="text-sm text-gray-600">{recommendedPlans.join(', ')}</p>
              )}
            </div>
          )}

          {plans.length >= 2 && entitlements && (
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-4 text-sm bg-gray-100 border-b">
                <div className="p-2 text-gray-600 font-medium">Feature / Limit</div>
                <div className="p-2">
                  <div className="font-semibold">{currentPlanRow?.name ?? 'Current'}</div>
                  {currentPlanRow?.code && getPlanSubtitle(currentPlanRow.code) && (
                    <div className="text-xs text-gray-500 font-normal">
                      {getPlanSubtitle(currentPlanRow.code)}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                    {recommendedPlanRow?.name ?? 'Recommended'}
                    <RecommendedBadge
                      planCode={recommendedPlanRow?.code ?? ''}
                      recommendedPlanCode={recommendation?.recommendedPlanCode}
                      subtle={recommendation?.reasonCode === 'CURRENT_BEST'}
                    />
                  </div>
                  {recommendedPlanRow?.code && getPlanSubtitle(recommendedPlanRow.code) && (
                    <div className="text-xs text-gray-500 font-normal">
                      {getPlanSubtitle(recommendedPlanRow.code)}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="font-semibold">{topPlan?.name ?? 'Top'}</div>
                  {topPlan?.code && getPlanSubtitle(topPlan.code) && (
                    <div className="text-xs text-gray-500 font-normal">
                      {getPlanSubtitle(topPlan.code)}
                    </div>
                  )}
                </div>
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
                return (
                  <div key={key} className="grid grid-cols-4 text-sm border-b last:border-b-0">
                    <div className="p-2 text-gray-600">{LIMIT_KEY_LABELS[key] ?? key}</div>
                    <div className="p-2">{formatLimit(curNum)}</div>
                    <div className={`p-2 ${recHighlight ? 'bg-green-50 font-medium text-green-900' : ''}`}>
                      {formatLimit(recNum)}
                    </div>
                    <div className={`p-2 ${topHighlight ? 'bg-green-50 font-medium text-green-900' : ''}`}>
                      {formatLimit(topNum)}
                    </div>
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
                return (
                  <div key={key} className="grid grid-cols-4 text-sm border-b last:border-b-0">
                    <div className="p-2 text-gray-600">{FEATURE_KEY_LABELS[key] ?? key}</div>
                    <div className="p-2">{curVal ? 'Yes' : 'No'}</div>
                    <div className={`p-2 ${recHighlight ? 'bg-green-50 font-medium text-green-900' : ''}`}>
                      {recVal ? 'Yes' : 'No'}
                    </div>
                    <div className={`p-2 ${topHighlight ? 'bg-green-50 font-medium text-green-900' : ''}`}>
                      {topVal ? 'Yes' : 'No'}
                    </div>
                  </div>
                )
              })}
              <div className="grid grid-cols-4 text-xs text-gray-500 bg-gray-50 border-t px-2 py-1">
                <div className="p-1 col-span-4">
                  Green = higher limit or unlocked feature vs your current plan
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-white border-t pt-4 -mx-6 px-6 -mb-2 pb-2">
            <Button onClick={handleUpgrade} className="flex-1">
              {canUpgrade
                ? recommendedPlanName
                  ? `Upgrade to ${recommendedPlanName}`
                  : 'Upgrade'
                : 'Ask Owner to Upgrade'}
            </Button>
            <Button variant="outline" onClick={handleClose}>
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
