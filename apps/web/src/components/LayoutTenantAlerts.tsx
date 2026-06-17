import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronUp, Layers, Lock } from 'lucide-react'
import { BillingOverdueBanner } from './billing/BillingOverdueBanner'
import { LimitExceededBanner } from './LimitExceededBanner'
import { InfoBanner } from './ui/info-banner'
import { NewDealsBanner } from './deals/NewDealsBanner'
import { getLimitLabel } from '../lib/planComparison'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { showMonetizationBlock } from '../features/monetization/monetizationSlice'
import { settingsFeaturesTabPath } from '../lib/externallyControlledFeatures'
import type { Entitlements } from '../types'
import { useAppDispatch } from '../hooks/redux'

type AlertSlot = {
  id: string
  priority: number
  node: ReactNode
}

const bannerStackClass = 'mx-3 flex flex-col gap-2 pt-2 sm:mx-6'

type LayoutTenantAlertsProps = {
  showDealsBanner: boolean
  showBillingBanner: boolean
  showExternalFeaturesBanner: boolean
  externallyDisabledFeatures: Array<{ label: string }>
  entitlements: Entitlements | undefined
  atLimitEntries: Array<{ key: string; current: number; limit: number }>
  showNearLimitBanner: boolean
  primaryNearLimit: { key: string; pct: number; current: number; limit: number } | undefined
  showTierDisabledBanner: boolean
  planTierDisabledFeatures: Array<{ label: string }>
  showPlanBlockNudge: boolean
  planBlockNudgeMessage: string | null
  onRecordConversionEvent: (payload: {
    eventType: string
    metadata?: Record<string, unknown>
  }) => void
}

export function LayoutTenantAlerts(props: LayoutTenantAlertsProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [expanded, setExpanded] = useState(false)

  const {
    showDealsBanner,
    showBillingBanner,
    showExternalFeaturesBanner,
    externallyDisabledFeatures,
    entitlements: e,
    atLimitEntries,
    showNearLimitBanner,
    primaryNearLimit,
    showTierDisabledBanner,
    planTierDisabledFeatures,
    showPlanBlockNudge,
    planBlockNudgeMessage,
    onRecordConversionEvent,
  } = props

  const alerts = useMemo(() => {
    const slots: AlertSlot[] = []

    if (showBillingBanner) {
      slots.push({ id: 'billing', priority: 0, node: <BillingOverdueBanner key="billing" /> })
    }

    if (atLimitEntries.length === 1) {
      slots.push({
        id: 'limit-single',
        priority: 1,
        node: (
          <LimitExceededBanner
            key="limit-single"
            limitKey={atLimitEntries[0].key}
            currentUsage={atLimitEntries[0].current}
            limitValue={atLimitEntries[0].limit}
            currentPlan={e?.plan?.name ?? null}
            upgradeUrl={e ? settingsFeaturesTabPath(e.tenantType) : undefined}
          />
        ),
      })
    } else if (atLimitEntries.length > 1) {
      slots.push({
        id: 'limit-multi',
        priority: 1,
        node: (
          <InfoBanner
            key="limit-multi"
            tone="amber"
            icon={AlertTriangle}
            title={`${atLimitEntries.length} limits reached`}
            description={
              <>
                {atLimitEntries
                  .slice(0, 3)
                  .map(({ key }) => getLimitLabel(key))
                  .join(', ')}
                {atLimitEntries.length > 3 ? ' and more' : ''}. Review usage in settings.
              </>
            }
            action={
              <button
                type="button"
                className="font-medium text-amber-950 underline hover:no-underline"
                onClick={() =>
                  navigate(
                    e ? settingsFeaturesTabPath(e.tenantType) : '/app/settings?tab=subscription'
                  )
                }
              >
                View usage
              </button>
            }
          />
        ),
      })
    }

    if (showExternalFeaturesBanner && e) {
      slots.push({
        id: 'external-features',
        priority: 2,
        node: (
          <InfoBanner
            key="external-features"
            tone="amber"
            icon={Lock}
            title="Some features are not available on your account"
            description={
              <>
                This is set by your organization or platform administrators, not by your
                subscription plan alone. Restricted capabilities include:{' '}
                <span className="font-medium">
                  {externallyDisabledFeatures.map((x) => x.label).join(', ')}
                </span>
                .
              </>
            }
            action={
              <button
                type="button"
                className="font-medium text-amber-950 underline hover:no-underline"
                onClick={() => navigate(settingsFeaturesTabPath(e.tenantType))}
              >
                View in Settings
              </button>
            }
          />
        ),
      })
    }

    if (showNearLimitBanner && primaryNearLimit) {
      slots.push({
        id: 'near-limit',
        priority: 3,
        node: (
          <InfoBanner
            key="near-limit"
            tone="amber"
            icon={AlertTriangle}
            title={`Usage near limit: ${getLimitLabel(primaryNearLimit.key)}`}
            description={`${primaryNearLimit.current} / ${primaryNearLimit.limit} used.`}
            action={
              <div className="flex flex-col gap-1 sm:items-end">
                <button
                  type="button"
                  className="font-medium text-amber-950 underline hover:no-underline"
                  onClick={() =>
                    navigate(
                      e ? settingsFeaturesTabPath(e.tenantType) : '/app/settings?tab=subscription'
                    )
                  }
                >
                  View usage
                </button>
                <button
                  type="button"
                  className="font-medium text-amber-950 underline hover:no-underline"
                  onClick={() => {
                    onRecordConversionEvent({
                      eventType: 'OPEN_UPGRADE',
                      metadata: { source: 'near_limit', limitKey: primaryNearLimit.key },
                    })
                    dispatch(
                      showMonetizationBlock({
                        type: 'limit',
                        payload: {
                          limitKey: primaryNearLimit.key,
                          limitValue: primaryNearLimit.limit,
                          currentUsage: primaryNearLimit.current,
                          currentPlan: e?.plan?.name ?? null,
                          recommendedPlans: [],
                          upgradeUrl: e
                            ? settingsFeaturesTabPath(e.tenantType)
                            : '/app/settings?tab=subscription',
                        },
                      })
                    )
                  }}
                >
                  Upgrade
                </button>
              </div>
            }
          />
        ),
      })
    }

    if (showTierDisabledBanner && e) {
      slots.push({
        id: 'tier-disabled',
        priority: 4,
        node: (
          <InfoBanner
            key="tier-disabled"
            tone="slate"
            icon={Layers}
            title="Some features are limited by your plan tier"
            description={
              <>
                Your current subscription does not include:{' '}
                <span className="font-medium text-slate-900">
                  {planTierDisabledFeatures.map((x) => x.label).join(', ')}
                </span>
                . Upgrade to a higher tier to unlock them.
              </>
            }
            action={
              <button
                type="button"
                className="font-medium text-slate-900 underline hover:no-underline"
                onClick={() =>
                  openBrowseUpgrade(dispatch, {
                    currentPlan: e?.plan?.name,
                    upgradeUrl: settingsFeaturesTabPath(e.tenantType),
                  })
                }
              >
                Compare plans
              </button>
            }
          />
        ),
      })
    }

    if (showPlanBlockNudge && planBlockNudgeMessage) {
      slots.push({
        id: 'plan-nudge',
        priority: 5,
        node: (
          <InfoBanner
            key="plan-nudge"
            tone="neutral"
            title={planBlockNudgeMessage}
            action={
              <button
                type="button"
                className="font-medium text-[var(--text)] underline hover:no-underline"
                onClick={() => {
                  onRecordConversionEvent({ eventType: 'VIEW_PLANS' })
                  openBrowseUpgrade(dispatch, {
                    currentPlan: e?.plan?.name,
                    upgradeUrl: e ? settingsFeaturesTabPath(e.tenantType) : undefined,
                  })
                }}
              >
                View plans
              </button>
            }
          />
        ),
      })
    }

    if (showDealsBanner) {
      slots.push({ id: 'deals', priority: 6, node: <NewDealsBanner key="deals" /> })
    }

    return slots.sort((a, b) => a.priority - b.priority)
  }, [
    showBillingBanner,
    atLimitEntries,
    e,
    showExternalFeaturesBanner,
    externallyDisabledFeatures,
    showNearLimitBanner,
    primaryNearLimit,
    showTierDisabledBanner,
    planTierDisabledFeatures,
    showPlanBlockNudge,
    planBlockNudgeMessage,
    showDealsBanner,
    navigate,
    dispatch,
    onRecordConversionEvent,
  ])

  if (alerts.length === 0) return null

  if (alerts.length === 1 || expanded) {
    return (
      <div className={bannerStackClass}>
        {alerts.map((alert) => alert.node)}
        {alerts.length > 1 && expanded ? (
          <div className="flex justify-center">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-muted)] underline hover:no-underline"
              onClick={() => setExpanded(false)}
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
              Show fewer alerts
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={bannerStackClass}>
      {alerts[0].node}
      <div className="flex justify-center">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg)]"
          onClick={() => setExpanded(true)}
          data-testid="layout-view-all-alerts"
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
          View all alerts ({alerts.length})
        </button>
      </div>
    </div>
  )
}

export function isBillingAlertVisible(
  access:
    | {
        isLocked?: boolean
        isPastDue?: boolean
      }
    | null
    | undefined
): boolean {
  if (!access) return false
  return Boolean(access.isPastDue || access.isLocked)
}
