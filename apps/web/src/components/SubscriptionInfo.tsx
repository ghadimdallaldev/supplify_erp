import { useMemo } from 'react'
import { useAppDispatch } from '../hooks/redux'
import { showMonetizationBlock } from '../features/monetization/monetizationSlice'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import {
  useGetEntitlementsQuery,
  useGetRecommendationQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Skeleton } from './ui/skeleton'
import { AlertCircle, AlertTriangle, Infinity, Layers, Lock, TrendingUp } from 'lucide-react'
import { RecommendedBadge } from './RecommendedBadge'
import { getPlanSubtitle } from '../lib/planComparison'
import { getUsageMeterDisplay } from '../lib/usageDisplay'
import {
  getExternallyDisabledFeatures,
  getPlanTierDisabledFeatures,
} from '../lib/externallyControlledFeatures'

const LIMIT_LABELS: Record<string, string> = {
  branches: 'Branches',
  users: 'Users',
  orders_per_day: 'Orders (Today)',
  suppliers_per_restaurant: 'Suppliers',
  restaurant_inventory_skus: 'Inventory SKUs',
  warehouses: 'Warehouses',
  supplier_products_skus: 'Products',
  chats_per_day: 'Chats (Today)',
  storage_mb: 'Storage (MB)',
}

export function SubscriptionInfo() {
  const dispatch = useAppDispatch()
  const [recordConversionEvent] = useRecordConversionEventMutation()
  const { data, isLoading, error } = useGetEntitlementsQuery()
  const { data: recommendation } = useGetRecommendationQuery({})

  const e = data?.entitlements ?? null
  const externallyDisabled = useMemo(() => (e ? getExternallyDisabledFeatures(e) : []), [e])
  const planTierDisabled = useMemo(() => (e ? getPlanTierDisabledFeatures(e) : []), [e])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Loading subscription details...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    )
  }

  if (error || !e) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>We could not load your plan details yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Compare available plans and choose an upgrade when you are ready.
          </p>
          <Button
            type="button"
            onClick={() => {
              recordConversionEvent({
                eventType: 'OPEN_UPGRADE',
                metadata: { source: 'subscription_settings_fallback' },
              }).catch(() => {})
              openBrowseUpgrade(dispatch)
            }}
          >
            Compare plans &amp; upgrade
          </Button>
        </CardContent>
      </Card>
    )
  }

  const plan = e.plan
  const limits = e.limits
  const usage = e.usage
  const features = e.features
  const featureSources = e.featureSources

  const getFeatureDisplay = (value: boolean) => (value ? 'Enabled' : 'Disabled')

  function featureOffNote(featureKey: string): string | null {
    if (features[featureKey as keyof typeof features]) return null
    const src = featureSources?.[featureKey]
    if (src === 'tenant_override') {
      return 'Turned off for your account by an administrator.'
    }
    if (src === 'global') {
      return 'Turned off platform-wide by an administrator.'
    }
    return null
  }

  function planTierOffNote(featureKey: string): string | null {
    if (features[featureKey as keyof typeof features]) return null
    const src = featureSources?.[featureKey]
    if (src === 'plan' || src === 'default') {
      return 'Not included on your current plan tier.'
    }
    return null
  }

  const keyFeatureOffNotes = {
    chat: featureOffNote('chat'),
    smart_reorder: featureOffNote('smart_reorder'),
    reports: featureOffNote('reports'),
    multi_branch: featureOffNote('multi_branch'),
    custom_branding: featureOffNote('custom_branding'),
  } as const

  const keyFeatureTierNotes = {
    chat: planTierOffNote('chat'),
    smart_reorder: planTierOffNote('smart_reorder'),
    reports: planTierOffNote('reports'),
    multi_branch: planTierOffNote('multi_branch'),
    custom_branding: planTierOffNote('custom_branding'),
  } as const

  const limitEntries = Object.entries(limits).filter(
    ([_, limit]) => limit !== null && limit !== undefined
  ) as [string, number][]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription & Usage</CardTitle>
        <CardDescription>
          {e.tenantType === 'RESTAURANT' ? 'Restaurant' : 'Supplier'} plan limits and usage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan Info */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg">{plan.name || 'Free'}</h3>
                <RecommendedBadge
                  planCode={plan.code ?? 'free'}
                  recommendedPlanCode={recommendation?.recommendedPlanCode}
                  subtle={recommendation?.reasonCode === 'CURRENT_BEST'}
                />
              </div>
              {getPlanSubtitle(plan.code) && (
                <p className="text-sm text-[var(--text-muted)]">{getPlanSubtitle(plan.code)}</p>
              )}
              <p className="text-sm text-[var(--text-muted)]">Current Plan</p>
            </div>
            <Badge variant="outline">
              {e.tenantType === 'RESTAURANT' ? 'Restaurant' : 'Supplier'}
            </Badge>
          </div>
          {plan.price_monthly != null && (
            <p className="text-sm text-[var(--text-muted)]">
              ${plan.price_monthly}/mo
              {plan.price_yearly != null && plan.price_yearly > 0 && ` · $${plan.price_yearly}/yr`}
            </p>
          )}
          {e.overrides.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              {e.overrides.length} limit override{e.overrides.length !== 1 ? 's' : ''} applied
            </p>
          )}
        </div>

        {/* Usage — top 3 near-limit highlighted */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Usage
          </h4>
          {(() => {
            const withPct = limitEntries
              .map(([limitKey, limit]) => {
                const current = usage[limitKey] ?? 0
                const effectiveLimit: number | null = limit === -1 ? null : limit
                if (effectiveLimit === null) return null
                const meter = getUsageMeterDisplay(current, effectiveLimit)
                return { limitKey, limit: meter.limit, current: meter.actual, pct: meter.pct }
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
            const topNearLimit = [...withPct]
              .filter(({ pct, current, limit }) => {
                const meter = getUsageMeterDisplay(current, limit)
                return !meter.atCap && pct >= 50 && pct < 100
              })
              .sort((a, b) => b.pct - a.pct)
              .slice(0, 3)
            if (topNearLimit.length > 0) {
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
                  <p className="text-sm font-medium text-amber-800 mb-2">Near limit (top 3)</p>
                  <ul className="space-y-1 text-sm text-amber-700">
                    {topNearLimit.map(({ limitKey, current, limit, pct }) => (
                      <li key={limitKey} className="flex items-center justify-between gap-2">
                        <span>
                          {LIMIT_LABELS[limitKey] ?? limitKey.replace(/_/g, ' ')}: {current} /{' '}
                          {limit} ({Math.round(pct)}%)
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-amber-800 border-amber-300 hover:bg-amber-100"
                          onClick={() => {
                            recordConversionEvent({
                              eventType: 'OPEN_UPGRADE',
                              metadata: { source: 'near_limit', limitKey },
                            }).catch(() => {})
                            dispatch(
                              showMonetizationBlock({
                                type: 'limit',
                                payload: {
                                  limitKey,
                                  limitValue: limit,
                                  currentUsage: current,
                                  currentPlan: e.plan?.name ?? null,
                                  recommendedPlans: [],
                                  upgradeUrl: '/app/settings',
                                },
                              })
                            )
                          }}
                        >
                          Upgrade
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
            return null
          })()}

          {limitEntries.map(([limitKey, limit]) => {
            const current = usage[limitKey] ?? 0
            const effectiveLimit: number | null = limit === -1 ? null : limit
            if (effectiveLimit === null) return null
            const meter = getUsageMeterDisplay(current, effectiveLimit)
            const isWarning = meter.pct >= 80 && !meter.atCap
            const label = LIMIT_LABELS[limitKey] ?? limitKey.replace(/_/g, ' ')
            return (
              <div key={limitKey} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span
                    className={
                      meter.atCap ? 'text-amber-700 font-medium' : isWarning ? 'text-amber-600' : ''
                    }
                  >
                    {meter.display} / {meter.limit}
                  </span>
                </div>
                <Progress
                  value={meter.pct}
                  className={meter.atCap ? 'bg-amber-100' : isWarning ? 'bg-amber-100' : ''}
                />
                {meter.atCap && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-amber-800">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      At plan limit
                    </div>
                    {meter.grandfathered && (
                      <p className="text-xs text-[var(--text-muted)] pl-6">
                        {meter.actual} on file; your plan allows {meter.limit}. Remove an extra
                        account or upgrade to add more.
                      </p>
                    )}
                  </div>
                )}
                {isWarning && !meter.atCap && (
                  <div className="flex items-center justify-between gap-2 text-sm text-amber-600">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Near limit
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-amber-800 border-amber-300 hover:bg-amber-100"
                      onClick={() => {
                        recordConversionEvent({
                          eventType: 'OPEN_UPGRADE',
                          metadata: { source: 'near_limit', limitKey },
                        }).catch(() => {})
                        dispatch(
                          showMonetizationBlock({
                            type: 'limit',
                            payload: {
                              limitKey,
                              limitValue: meter.limit,
                              currentUsage: meter.actual,
                              currentPlan: e.plan?.name ?? null,
                              recommendedPlans: [],
                              upgradeUrl: '/app/settings',
                            },
                          })
                        )
                      }}
                    >
                      Upgrade
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          {limitEntries.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-[var(--mint)]">
              <Infinity className="w-4 h-4" />
              Unlimited access on this plan
            </div>
          )}
        </div>

        {/* Key Features */}
        <div className="space-y-4">
          <h4 className="font-semibold">Key Features</h4>
          {externallyDisabled.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                Administrator access controls
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900/95">
                {externallyDisabled.map(({ key, label, source }) => (
                  <li key={key}>
                    <span className="font-medium">{label}</span>
                    {source === 'tenant_override'
                      ? ' is disabled specifically for your account by an administrator.'
                      : ' is disabled platform-wide for all accounts.'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {planTierDisabled.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
              <p className="font-medium flex items-center gap-2">
                <Layers className="h-4 w-4 shrink-0" aria-hidden />
                Plan tier
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                {planTierDisabled.map(({ key, label, source }) => (
                  <li key={key}>
                    <span className="font-medium text-slate-900">{label}</span>
                    {source === 'plan'
                      ? ' is turned off for your current plan tier (see your plan details above).'
                      : ' is not included on your current plan tier.'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:gap-2">
            <div>
              <div>
                <span className="text-[var(--text-muted)]">Chat:</span>{' '}
                <Badge variant={features.chat ? 'default' : 'secondary'} className="ml-2">
                  {getFeatureDisplay(features.chat)}
                </Badge>
              </div>
              {keyFeatureOffNotes.chat && (
                <p className="mt-1 text-xs text-amber-900">{keyFeatureOffNotes.chat}</p>
              )}
              {!keyFeatureOffNotes.chat && keyFeatureTierNotes.chat && (
                <p className="mt-1 text-xs text-slate-700">{keyFeatureTierNotes.chat}</p>
              )}
            </div>
            <div>
              <div>
                <span className="text-[var(--text-muted)]">Smart Reorder:</span>{' '}
                <Badge variant={features.smart_reorder ? 'default' : 'secondary'} className="ml-2">
                  {getFeatureDisplay(features.smart_reorder)}
                </Badge>
              </div>
              {keyFeatureOffNotes.smart_reorder && (
                <p className="mt-1 text-xs text-amber-900">{keyFeatureOffNotes.smart_reorder}</p>
              )}
              {!keyFeatureOffNotes.smart_reorder && keyFeatureTierNotes.smart_reorder && (
                <p className="mt-1 text-xs text-slate-700">{keyFeatureTierNotes.smart_reorder}</p>
              )}
            </div>
            <div>
              <div>
                <span className="text-[var(--text-muted)]">Analytics:</span>{' '}
                <Badge variant={features.reports ? 'default' : 'secondary'} className="ml-2">
                  {getFeatureDisplay(features.reports)}
                </Badge>
              </div>
              {keyFeatureOffNotes.reports && (
                <p className="mt-1 text-xs text-amber-900">{keyFeatureOffNotes.reports}</p>
              )}
              {!keyFeatureOffNotes.reports && keyFeatureTierNotes.reports && (
                <p className="mt-1 text-xs text-slate-700">{keyFeatureTierNotes.reports}</p>
              )}
            </div>
            <div>
              <div>
                <span className="text-[var(--text-muted)]">Multi-Branch:</span>{' '}
                <Badge variant={features.multi_branch ? 'default' : 'secondary'} className="ml-2">
                  {getFeatureDisplay(features.multi_branch)}
                </Badge>
              </div>
              {keyFeatureOffNotes.multi_branch && (
                <p className="mt-1 text-xs text-amber-900">{keyFeatureOffNotes.multi_branch}</p>
              )}
              {!keyFeatureOffNotes.multi_branch && keyFeatureTierNotes.multi_branch && (
                <p className="mt-1 text-xs text-slate-700">{keyFeatureTierNotes.multi_branch}</p>
              )}
            </div>
            <div>
              <div>
                <span className="text-[var(--text-muted)]">Custom branding:</span>{' '}
                <Badge
                  variant={features.custom_branding ? 'default' : 'secondary'}
                  className="ml-2"
                >
                  {getFeatureDisplay(features.custom_branding)}
                </Badge>
              </div>
              {keyFeatureOffNotes.custom_branding && (
                <p className="mt-1 text-xs text-amber-900">{keyFeatureOffNotes.custom_branding}</p>
              )}
              {!keyFeatureOffNotes.custom_branding && keyFeatureTierNotes.custom_branding && (
                <p className="mt-1 text-xs text-slate-700">
                  {keyFeatureTierNotes.custom_branding} Available on Gold and Platinum.
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
