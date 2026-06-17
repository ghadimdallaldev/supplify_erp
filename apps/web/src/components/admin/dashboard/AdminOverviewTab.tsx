import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { AppPanel, SummaryStrip } from '../../ui/app-panel'
import { TableScroll } from '../../ui/table-scroll'
import {
  useGetAdminOverviewQuery,
  useGetAdminConversionStatsQuery,
  useGetAdminHealthQuery,
} from '../../../services/api'
import {
  AlertCircle,
  RefreshCw,
  Building2,
  DollarSign,
  Store,
  CreditCard,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import {
  deriveSystemHealth,
  formatSystemHealthLabel,
  getActiveSubscriptionCount,
  getPaidActiveSubscriptionCount,
  getTotalTenantCount,
  type AdminOverview,
} from '../../../lib/adminOverview'
import { formatCurrency } from '../../../utils/format'
import { AdminOverviewExtras } from '../AdminOverviewExtras'
import { AdminOperationsSnapshot } from '../AdminOperationsSnapshot'
import { AdminKpiCard } from '../AdminKpiCard'
import { AdminErrorState, AdminLoadingSkeleton, AdminSectionHeader } from '../adminUi'
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
        <AdminSectionHeader
          title="Overview"
          description="Platform health, tenant growth, and operational metrics."
        />
        <AdminLoadingSkeleton rows={10} />
      </>
    )
  }

  if (overviewError) {
    return (
      <>
        <AdminSectionHeader
          title="Overview"
          description="Platform health, tenant growth, and operational metrics."
        />
        <AdminErrorState
          title="Could not load dashboard metrics"
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
      <AdminSectionHeader
        title="Overview"
        description="Platform health, tenant growth, and operational metrics."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchOverview()}
            disabled={overviewFetching}
          >
            {overviewFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      <div className="mb-4">
        <SummaryStrip
          testId="admin-overview-summary"
          columns={6}
          metrics={[
            {
              label: 'Total tenants',
              value: getTotalTenantCount(overviewData),
              hint: 'Suppliers + restaurants',
              tone: 'brand',
              onClick: canAdminTab.tenants ? () => onNavigateTab('tenants') : undefined,
            },
            {
              label: 'Active subs',
              value: getActiveSubscriptionCount(overviewData),
              hint: 'ACTIVE + TRIALING',
              tone: 'mint',
              onClick: canAdminTab.subscriptions ? () => onNavigateTab('subscriptions') : undefined,
            },
            {
              label: 'MRR',
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
            {
              label: 'Past due',
              value: overviewData?.alerts?.pastDueSubscriptions ?? subscriptionStats.PAST_DUE ?? 0,
              hint: 'Subscriptions needing attention',
              tone:
                (overviewData?.alerts?.pastDueSubscriptions ?? subscriptionStats.PAST_DUE ?? 0) > 0
                  ? 'danger'
                  : 'default',
              onClick: canAdminTab.subscriptions ? () => onNavigateTab('subscriptions') : undefined,
            },
          ]}
        />
      </div>

      <AdminOperationsSnapshot
        overview={overviewData}
        recentErrorCount={recentErrorCount}
        onNavigateTab={onNavigateTab}
        onOperationsSubTab={onOperationsSubTab}
      />

      <AdminOverviewExtras
        overview={overview}
        onNavigateTab={onNavigateTab}
        onRefresh={() => refetchOverview()}
        refreshing={overviewFetching}
        lastUpdated={overviewLastUpdated}
        canNavigateTab={(tab) => canAdminTab[tab as keyof AdminCanTabMap] ?? false}
      />

      <AppPanel
        title="Tenants & Revenue"
        description="Registered tenants and recurring revenue snapshot"
        testId="admin-overview-tenants-revenue"
        className="mb-4"
        footer={
          overviewFetching ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing metrics…
            </p>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <AdminKpiCard
            label="Suppliers"
            value={overviewData?.tenants?.totalSuppliers ?? 0}
            description={
              (overviewData?.tenants?.newSuppliers7d || 0) > 0
                ? `+${overviewData?.tenants?.newSuppliers7d} new this week`
                : 'No new this week'
            }
            icon={Building2}
            tone="brand"
          />
          <AdminKpiCard
            label="Restaurants"
            value={overviewData?.tenants?.totalRestaurants ?? 0}
            description={
              (overviewData?.tenants?.newRestaurants7d || 0) > 0
                ? `+${overviewData?.tenants?.newRestaurants7d} new this week`
                : 'No new this week'
            }
            icon={Store}
            tone="success"
          />
          <AdminKpiCard
            label="MRR"
            value={formatCurrency(overviewData?.revenue?.mrr)}
            description={`ARR: ${formatCurrency(overviewData?.revenue?.arr)}`}
            icon={DollarSign}
            tone="success"
          />
          <AdminKpiCard
            label="Active subs"
            value={getPaidActiveSubscriptionCount(overviewData)}
            description="Paid plans (excl. Free Trial)"
            icon={CreditCard}
            tone="brand"
          />
        </div>
        {canAdminTab.finance && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onNavigateTab('finance')}
            >
              Open finance <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        )}
      </AppPanel>

      <AppPanel
        title="Subscription status breakdown"
        description="Live subscription counts by billing status"
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
      </AppPanel>

      {conversionStats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AppPanel
            title="Conversion funnel (30d)"
            description="Upgrade path from feature blocks to completed upgrades"
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
              const s30 = conversionStats.funnelDropOff?.['30d']
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
              title="7-day vs 30-day comparison"
              description="Recent upgrade funnel momentum"
              testId="admin-overview-funnel-comparison"
            >
              <TableScroll aria-label="Funnel comparison">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--app-border)]">
                      <th className="py-2 text-left font-medium text-[var(--text-muted)]">Step</th>
                      <th className="py-2 text-right font-medium text-[var(--text-muted)]">7d</th>
                      <th className="py-2 text-right font-medium text-[var(--text-muted)]">30d</th>
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
                          {(conversionStats.funnelDropOff!['7d'] as Record<string, number>)[key] ??
                            0}
                        </td>
                        <td className="py-2 text-right font-semibold text-[var(--text)]">
                          {(conversionStats.funnelDropOff!['30d'] as Record<string, number>)[key] ??
                            0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </AppPanel>
          )}
        </div>
      )}
    </>
  )
}
