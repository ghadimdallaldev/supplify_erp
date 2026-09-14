import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { AppPanel, SummaryStrip } from '../../ui/app-panel'
import { TableScroll } from '../../ui/table-scroll'
import {
  useGetAdminOverviewQuery,
  useGetAdminConversionStatsQuery,
  useGetAdminHealthQuery,
} from '../../../services/api'
import { AlertCircle, CheckCircle2, Clock, PauseCircle, XCircle, ArrowRight } from 'lucide-react'
import {
  deriveSystemHealth,
  formatSystemHealthLabel,
  getActiveSubscriptionCount,
  getTotalTenantCount,
  type AdminOverview,
} from '../../../lib/adminOverview'
import { formatCurrency } from '../../../utils/format'
import { AdminOverviewExtras } from '../AdminOverviewExtras'
import { AdminOperationsSnapshot } from '../AdminOperationsSnapshot'
import {
  AdminCollapsibleSection,
  AdminErrorState,
  AdminLoadingSkeleton,
  AdminSectionHeader,
} from '../adminUi'
import { getTranslatedStatusLabel } from '../../ui/status-badge'
import { formatLimitKeyLabel } from '../../../lib/adminLimitLabels'
import { FEATURE_KEY_LABELS } from '../../../lib/planComparison'
import { type AdminCanTabMap } from './adminDashboardShared'

export interface AdminOverviewTabProps {
  active: boolean
  canAdminTab: AdminCanTabMap
  onNavigateTab: (tab: string) => void
  onOperationsSubTab: (sub: 'summary' | 'email' | 'inventory' | 'fulfillment' | 'gps') => void
}

export function AdminOverviewTab({
  active,
  canAdminTab,
  onNavigateTab,
  onOperationsSubTab,
}: AdminOverviewTabProps) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewError,
    error: overviewQueryError,
    refetch: refetchOverview,
    isFetching: overviewFetching,
  } = useGetAdminOverviewQuery(undefined, { skip: !active })
  const [overviewLastUpdated, setOverviewLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (overview && !overviewLoading) {
      setOverviewLastUpdated(new Date())
    }
  }, [overview, overviewLoading])

  const { data: conversionStats } = useGetAdminConversionStatsQuery({ days: 30 }, { skip: !active })
  const { data: healthData } = useGetAdminHealthQuery(undefined, { skip: !active })

  const recentErrorCount = Array.isArray(healthData?.recentApiErrors)
    ? healthData.recentApiErrors.length
    : 0

  const systemHealth = deriveSystemHealth(overview as AdminOverview | undefined, recentErrorCount)

  const subscriptionStats = useMemo(
    () => (overview?.subscriptionStats as Record<string, number> | undefined) ?? {},
    [overview?.subscriptionStats]
  )

  if (!active) {
    return null
  }

  if (overviewLoading) {
    return (
      <>
        <AdminLoadingSkeleton rows={10} />
      </>
    )
  }

  if (overviewError) {
    return (
      <>
        <AdminErrorState
          title={t('overview.loadFailedTitle')}
          message={
            (overviewQueryError as { data?: { message?: string } })?.data?.message ||
            t('overview.loadFailedMessage')
          }
          onRetry={() => refetchOverview()}
        />
      </>
    )
  }

  const overviewData = overview as AdminOverview

  return (
    <>
      <AdminSectionHeader title={t('overview.title')} description={t('overview.description')} />
      <div className="mb-4">
        <SummaryStrip
          testId="admin-overview-summary"
          columns={5}
          metrics={[
            {
              label: t('overview.totalTenants'),
              value: getTotalTenantCount(overviewData),
              hint: t('overview.totalTenantsHint'),
              tone: 'brand',
              onClick: canAdminTab.tenants ? () => onNavigateTab('tenants') : undefined,
            },
            {
              label: t('overview.activeSubscriptions'),
              value: getActiveSubscriptionCount(overviewData),
              hint: t('executiveSummary.activeSubscriptionsDescription'),
              tone: 'mint',
              onClick: canAdminTab.subscriptions ? () => onNavigateTab('subscriptions') : undefined,
            },
            {
              label: t('overview.mrr'),
              value: formatCurrency(overviewData?.revenue?.mrr),
              hint: t('overview.arrHint', { value: formatCurrency(overviewData?.revenue?.arr) }),
              tone: 'brand',
              onClick: canAdminTab.finance ? () => onNavigateTab('finance') : undefined,
            },
            {
              label: t('overview.ordersToday'),
              value: overviewData?.orders?.today ?? 0,
              hint: t('executiveSummary.ordersThisWeek', {
                count: overviewData?.orders?.week ?? 0,
              }),
              tone: 'default',
            },
            {
              label: t('overview.systemHealth'),
              value: t(`executiveSummary.health.${systemHealth}`, {
                defaultValue: formatSystemHealthLabel(systemHealth),
              }),
              hint:
                recentErrorCount > 0
                  ? t('executiveSummary.recentErrors', { count: recentErrorCount })
                  : t('executiveSummary.platformOperational'),
              tone:
                systemHealth === 'healthy'
                  ? 'mint'
                  : systemHealth === 'degraded'
                    ? 'amber'
                    : 'danger',
              onClick: canAdminTab.health ? () => onNavigateTab('health') : undefined,
            },
          ]}
        />
      </div>
      <AdminOverviewExtras
        overview={overview}
        onNavigateTab={onNavigateTab}
        onRefresh={() => refetchOverview()}
        refreshing={overviewFetching}
        lastUpdated={overviewLastUpdated}
        canNavigateTab={(tab) => canAdminTab[tab as keyof AdminCanTabMap] ?? false}
        recentApiErrors={
          Array.isArray(healthData?.recentApiErrors) ? healthData.recentApiErrors : []
        }
      />

      <AdminOperationsSnapshot
        overview={overviewData}
        recentErrorCount={recentErrorCount}
        onNavigateTab={onNavigateTab}
        onOperationsSubTab={onOperationsSubTab}
      />

      <AdminCollapsibleSection
        title={t('overview.subscriptionBreakdownTitle')}
        description={t('overview.subscriptionBreakdownDescription')}
        testId="admin-overview-subscription-breakdown"
        className="mb-4"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            {
              status: 'ACTIVE',
              icon: CheckCircle2,
              color: 'var(--mint)',
              bg: 'var(--mint-pale)',
            },
            {
              status: 'TRIALING',
              icon: Clock,
              color: 'var(--brand)',
              bg: 'var(--brand-ultra)',
            },
            {
              status: 'PAST_DUE',
              icon: AlertCircle,
              color: 'var(--red)',
              bg: 'var(--red-pale)',
            },
            {
              status: 'SUSPENDED',
              icon: PauseCircle,
              color: 'var(--amber)',
              bg: 'var(--amber-pale)',
            },
            {
              status: 'CANCELLED',
              icon: XCircle,
              color: 'var(--text-muted)',
              bg: 'var(--surface-mid)',
            },
          ].map(({ status, icon: Icon, color, bg }) => (
            <button
              key={status}
              type="button"
              className="flex items-center gap-2 rounded-lg p-3 text-left transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-100"
              style={{ background: bg }}
              disabled={!canAdminTab.subscriptions}
              onClick={() => canAdminTab.subscriptions && onNavigateTab('subscriptions')}
            >
              <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
              <div>
                <p className="text-xs font-semibold" style={{ color }}>
                  {getTranslatedStatusLabel(status, tCommon)}
                </p>
                <p className="text-xl font-black text-[var(--text)]">
                  {String(subscriptionStats[status] ?? 0)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </AdminCollapsibleSection>

      {conversionStats && (
        <AdminCollapsibleSection
          title={t('overview.growthInsightsTitle')}
          description={t('overview.growthInsightsDescription')}
          className="mb-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AppPanel
              title={t('overview.conversionFunnelTitle')}
              description={t('overview.conversionFunnelDescription')}
              testId="admin-overview-conversion-funnel"
            >
              <div className="mb-4 flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {t('overview.conversionRate', {
                    percent: conversionStats.blocksToUpgradesConversionPercent,
                  })}
                </Badge>
                {canAdminTab.plans && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onNavigateTab('plans')}
                  >
                    {t('overview.extras.planLimits')} <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
              {(() => {
                const windowKey = `${conversionStats.days ?? 30}d`
                const s30 = conversionStats.funnelDropOff?.[windowKey]
                const funnelSteps = [
                  {
                    label: t('overview.funnel.blocks'),
                    value: Number(conversionStats.totalBlocks),
                  },
                  {
                    label: t('overview.funnel.openUpgrade'),
                    value: Number(s30?.openUpgrade ?? 0),
                  },
                  {
                    label: t('overview.funnel.clickUpgrade'),
                    value: Number(s30?.clickUpgrade ?? 0),
                  },
                  {
                    label: t('overview.funnel.upgradesCompleted'),
                    value: Number(conversionStats.totalUpgrades),
                  },
                ]
                const topValue = Math.max(...funnelSteps.map((s) => s.value), 1)
                return (
                  <div className="space-y-3">
                    {funnelSteps.map(({ label, value }) => (
                      <div key={label}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-[var(--text-muted)]">{label}</span>
                          <span className="font-semibold text-[var(--text)]">{value}</span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full"
                          style={{ background: 'var(--app-border)' }}
                        >
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.round((value / topValue) * 100))}%`,
                              background: 'var(--brand)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {(conversionStats.mostBlockedFeature || conversionStats.mostBlockedLimit) && (
                <div className="mt-4 space-y-1 border-t border-[var(--app-border)] pt-3">
                  {conversionStats.mostBlockedFeature && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {t('overview.topBlockedFeature')}{' '}
                      <span className="font-medium text-[var(--text)]">
                        {t(`featureKeys.${conversionStats.mostBlockedFeature}`, {
                          defaultValue:
                            FEATURE_KEY_LABELS[conversionStats.mostBlockedFeature] ??
                            String(conversionStats.mostBlockedFeature).replace(/_/g, ' '),
                        })}
                      </span>
                    </p>
                  )}
                  {conversionStats.mostBlockedLimit && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {t('overview.topBlockedLimit')}{' '}
                      <span className="font-medium text-[var(--text)]">
                        {t(`limitKeys.${conversionStats.mostBlockedLimit}`, {
                          defaultValue: formatLimitKeyLabel(
                            String(conversionStats.mostBlockedLimit)
                          ),
                        })}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </AppPanel>

            {conversionStats.funnelDropOff && (
              <AppPanel
                title={t('overview.funnelComparisonTitle')}
                description={t('overview.funnelComparisonDescription')}
                testId="admin-overview-funnel-comparison"
              >
                <TableScroll aria-label={t('overview.funnelComparisonTableAriaLabel')}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--app-border)]">
                        <th className="py-2 text-left font-medium text-[var(--text-muted)]">
                          {t('overview.funnel.step')}
                        </th>
                        <th className="py-2 text-right font-medium text-[var(--text-muted)]">
                          {t('overview.funnel.window7d')}
                        </th>
                        <th className="py-2 text-right font-medium text-[var(--text-muted)]">
                          {t('overview.funnel.windowNd', {
                            days: conversionStats.days ?? 30,
                          })}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {[
                        { labelKey: 'overview.funnel.blocked', key: 'blocked' },
                        { labelKey: 'overview.funnel.openUpgrade', key: 'openUpgrade' },
                        { labelKey: 'overview.funnel.clickUpgrade', key: 'clickUpgrade' },
                        { labelKey: 'overview.funnel.upgradeSuccess', key: 'upgradeSuccess' },
                      ].map(({ labelKey, key }) => (
                        <tr key={key}>
                          <td className="py-2 text-[var(--text)]">{t(labelKey)}</td>
                          <td className="py-2 text-right font-semibold text-[var(--text)]">
                            {(conversionStats.funnelDropOff!['7d'] as Record<string, number>)[
                              key
                            ] ?? 0}
                          </td>
                          <td className="py-2 text-right font-semibold text-[var(--text)]">
                            {(
                              conversionStats.funnelDropOff![
                                `${conversionStats.days ?? 30}d`
                              ] as Record<string, number>
                            )?.[key] ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </AppPanel>
            )}
          </div>
        </AdminCollapsibleSection>
      )}
    </>
  )
}
