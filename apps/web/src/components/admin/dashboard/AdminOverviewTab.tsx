import { useEffect, useState } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
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
} from 'lucide-react'
import { getPaidActiveSubscriptionCount, type AdminOverview } from '../../../lib/adminOverview'
import { formatCurrency } from '../../../utils/format'
import { AdminOverviewExtras } from '../AdminOverviewExtras'
import { AdminExecutiveSummary } from '../AdminExecutiveSummary'
import { AdminOperationsSnapshot } from '../AdminOperationsSnapshot'
import { AdminKpiCard } from '../AdminKpiCard'
import { AdminSectionHeader } from '../adminUi'
import { AdminTabLoading, type AdminCanTabMap } from './adminDashboardShared'

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

  if (!active) {
    return null
  }

  if (overviewLoading) {
    return <AdminTabLoading />
  }

  if (overviewError) {
    return (
      <Card className="border-red-200 bg-red-50 p-6">
        <div className="flex flex-wrap items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-red-900">Could not load dashboard metrics</p>
            <p className="text-sm text-red-800 mt-1">
              {(overviewQueryError as { data?: { message?: string } })?.data?.message ||
                'The overview API request failed. Metrics are not shown as zero to avoid a misleading empty dashboard.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <>
      <AdminExecutiveSummary
        overview={overview as AdminOverview}
        recentErrorCount={
          Array.isArray(healthData?.recentApiErrors) ? healthData.recentApiErrors.length : 0
        }
      />

      <AdminOperationsSnapshot
        overview={overview as AdminOverview}
        recentErrorCount={
          Array.isArray(healthData?.recentApiErrors) ? healthData.recentApiErrors.length : 0
        }
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

      {/* Tenants & Revenue */}
      <div>
        <AdminSectionHeader title="Tenants & Revenue" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <AdminKpiCard
            label="Suppliers"
            value={overview?.tenants?.totalSuppliers ?? 0}
            description={
              (overview?.tenants?.newSuppliers7d || 0) > 0
                ? `+${overview?.tenants?.newSuppliers7d} new this week`
                : 'No new this week'
            }
            icon={Building2}
            tone="brand"
          />
          <AdminKpiCard
            label="Restaurants"
            value={overview?.tenants?.totalRestaurants ?? 0}
            description={
              (overview?.tenants?.newRestaurants7d || 0) > 0
                ? `+${overview?.tenants?.newRestaurants7d} new this week`
                : 'No new this week'
            }
            icon={Store}
            tone="success"
          />
          <AdminKpiCard
            label="MRR"
            value={formatCurrency(overview?.revenue?.mrr)}
            description={`ARR: ${formatCurrency(overview?.revenue?.arr)}`}
            icon={DollarSign}
            tone="success"
          />
          <AdminKpiCard
            label="Active subs"
            value={getPaidActiveSubscriptionCount(overview)}
            description="Paid plans (excl. Free Trial)"
            icon={CreditCard}
            tone="brand"
          />
        </div>
      </div>

      {/* Subscription breakdown */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--text)] mb-4">
          Subscription Status Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
            <div
              key={status}
              className="flex items-center gap-2 rounded-lg p-3"
              style={{ background: bg }}
            >
              <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
              <div>
                <p className="text-xs font-semibold" style={{ color }}>
                  {status}
                </p>
                <p className="text-xl font-black text-[var(--text)]">
                  {String(
                    (overview?.subscriptionStats as Record<string, number> | undefined)?.[status] ||
                      0
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Conversion funnel */}
      {conversionStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Conversion Funnel (30d)</h3>
              <Badge variant="outline" className="text-xs">
                {conversionStats.blocksToUpgradesConversionPercent}% rate
              </Badge>
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
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--text-muted)]">{label}</span>
                        <span className="font-semibold text-[var(--text)]">{value}</span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
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
              <div className="mt-4 pt-3 border-t space-y-1">
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
          </Card>

          {conversionStats.funnelDropOff && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-4">
                7-day vs 30-day Comparison
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-[var(--text-muted)] font-medium">Step</th>
                      <th className="text-right py-2 text-[var(--text-muted)] font-medium">7d</th>
                      <th className="text-right py-2 text-[var(--text-muted)] font-medium">30d</th>
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
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
