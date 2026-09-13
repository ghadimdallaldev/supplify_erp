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
import { AdminCollapsibleSection, AdminErrorState, AdminLoadingSkeleton } from '../adminUi'
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
            'The overview API request failed. Metrics are not shown as zero to avoid a misleading empty dashboard.'
          }
          onRetry={() => refetchOverview()}
        />
      </>
    )
  }

  const overviewData = overview as AdminOverview

  return (
    <>
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
              hint: `ARR ${formatCurrency(overviewData?.revenue?.arr)}`,
              tone: 'brand',
              onClick: canAdminTab.finance ? () => onNavigateTab('finance') : undefined,
            },
            {
              label: 'Orders today',
              value: overviewData?.orders?.today ?? 0,
              hint: `${overviewData?.orders?.week ?? 0} this week`,
              tone: 'default',
            },
            {
              label: 'System health',
              value: formatSystemHealthLabel(systemHealth),
              hint:
                recentErrorCount > 0
                  ? `${recentErrorCount} recent error${recentErrorCount > 1 ? 's' : ''}`
                  : 'Platform operational status',
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
            { status: 'PAST_DUE', icon: AlertCircle, color: '#ef4444', bg: '#fef2f2' },
            { status: 'SUSPENDED', icon: PauseCircle, color: '#f59e0b', bg: '#fffbeb' },
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
                  {status}
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
          title="Growth insights"
          description="Understand upgrade demand and conversion momentum."
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
                  {conversionStats.blocksToUpgradesConversionPercent}% conversion rate
                </Badge>
                {canAdminTab.plans && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onNavigateTab('plans')}
                  >
                    Plan limits <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
              {(() => {
                const windowKey = `${conversionStats.days ?? 30}d`
                const s30 = conversionStats.funnelDropOff?.[windowKey]
                const funnelSteps = [
                  {
                    label: 'Feature / limit blocks',
                    value: Number(conversionStats.totalBlocks),
                  },
                  { label: 'Upgrade modal opens', value: Number(s30?.openUpgrade ?? 0) },
                  { label: 'Upgrade clicked', value: Number(s30?.clickUpgrade ?? 0) },
                  {
                    label: 'Upgrades completed',
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
                <div className="mt-4 space-y-1 border-t pt-3">
                  {conversionStats.mostBlockedFeature && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Top blocked feature:{' '}
                      <span className="font-medium text-[var(--text)]">
                        {conversionStats.mostBlockedFeature}
                      </span>
                    </p>
                  )}
                  {conversionStats.mostBlockedLimit && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Top blocked limit:{' '}
                      <span className="font-medium text-[var(--text)]">
                        {conversionStats.mostBlockedLimit}
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
                          Step
                        </th>
                        <th className="py-2 text-right font-medium text-[var(--text-muted)]">7d</th>
                        <th className="py-2 text-right font-medium text-[var(--text-muted)]">
                          {`${conversionStats.days ?? 30}d`}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {[
                        { label: 'Blocked', key: 'blocked' },
                        { label: 'Open upgrade', key: 'openUpgrade' },
                        { label: 'Click upgrade', key: 'clickUpgrade' },
                        { label: 'Upgrade success', key: 'upgradeSuccess' },
                      ].map(({ label, key }) => (
                        <tr key={key}>
                          <td className="py-2 text-[var(--text)]">{label}</td>
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
