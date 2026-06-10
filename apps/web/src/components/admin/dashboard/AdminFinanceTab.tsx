import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { useGetAdminFinancialOverviewQuery } from '../../../services/api'
import { formatPlanDisplayName } from '../../../lib/planComparison'
import { formatCurrency } from '../../../utils/format'
import { AlertCircle, DollarSign } from 'lucide-react'
import { AdminTabLoading } from './adminDashboardShared'

export interface AdminFinanceTabProps {
  active: boolean
}

export function AdminFinanceTab({ active }: AdminFinanceTabProps) {
  const {
    data: financeData,
    isLoading: financeLoading,
    isError: financeError,
    error: financeQueryError,
    refetch: refetchFinance,
  } = useGetAdminFinancialOverviewQuery(undefined, { skip: !active })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-[var(--text)]">Finance Dashboard</h2>
        <p className="text-sm text-[var(--text-muted)]">
          GMV, recurring revenue, invoices, and top tenants
        </p>
      </div>
      {financeLoading ? (
        <AdminTabLoading />
      ) : financeError ? (
        <Card className="p-6 border-red-200 bg-red-50/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[var(--text)]">Finance data unavailable</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {(financeQueryError as { data?: { message?: string } })?.data?.message ||
                  'The finance API request failed. Figures are not shown as zero to avoid misleading data.'}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchFinance()}>
                Retry
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {financeData?.mrrExcludesFreeTrial && (
            <p className="text-xs text-[var(--text-muted)] -mt-2">
              MRR and ARR exclude Free Trial and Enterprise plans (paid subscriptions only).
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: 'GMV (all time)',
                value: financeData?.gmv ?? 0,
                color: 'var(--brand)',
                bg: 'var(--brand-ultra)',
                note: 'Total invoice value',
              },
              {
                label: 'MRR',
                value: financeData?.mrr ?? 0,
                color: 'var(--mint)',
                bg: 'var(--mint-pale)',
                note: `ARR: ${formatCurrency(financeData?.arr ?? 0)} · paid plans only`,
              },
              {
                label: 'Outstanding',
                value: financeData?.outstanding ?? 0,
                color: '#f59e0b',
                bg: '#fffbeb',
                note: 'Awaiting payment',
              },
              {
                label: 'Overdue',
                value: financeData?.overdue ?? 0,
                color: '#ef4444',
                bg: '#fef2f2',
                note: 'Past due date',
              },
            ].map(({ label, value, color, bg, note }) => (
              <Card key={label} className="p-5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: bg }}
                >
                  <DollarSign className="h-4 w-4" style={{ color }} />
                </div>
                <p className="text-xs text-[var(--text-muted)] font-medium mb-1">{label}</p>
                <p className="text-2xl font-black" style={{ color }}>
                  {formatCurrency(value)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{note}</p>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <Card className="p-5">
              <p className="text-sm font-semibold text-[var(--text)] mb-4">Revenue by Plan</p>
              {!financeData?.revenueByPlan?.length ? (
                <p className="text-sm text-[var(--text-muted)]">No data</p>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const maxMrr = Math.max(
                      ...financeData.revenueByPlan.map((r: { mrr?: number }) => Number(r.mrr) || 0),
                      1
                    )
                    return financeData.revenueByPlan.map(
                      (
                        r: {
                          planCode?: string
                          planName?: string
                          tenantType?: string
                          subscriptionCount?: number
                          mrr?: number
                        },
                        i: number
                      ) => (
                        <div key={i}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[var(--text)]">
                                {formatPlanDisplayName(r.planCode, r.planName)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {r.tenantType}
                              </Badge>
                              <span className="text-[var(--text-muted)]">
                                {r.subscriptionCount} subs
                              </span>
                            </div>
                            <span className="font-semibold text-[var(--text)]">
                              {formatCurrency(r.mrr ?? 0)}
                              <span className="text-[var(--text-muted)] font-normal">/mo</span>
                            </span>
                          </div>
                          <div
                            className="h-1.5 rounded-full overflow-hidden"
                            style={{ background: 'var(--app-border)' }}
                          >
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: `${Math.min(100, Math.round((Number(r.mrr) / maxMrr) * 100))}%`,
                                background: 'var(--brand)',
                              }}
                            />
                          </div>
                        </div>
                      )
                    )
                  })()}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <p className="text-sm font-semibold text-[var(--text)] mb-4">
                Top Tenants by Revenue
              </p>
              {!financeData?.topTenantsByRevenue?.length ? (
                <p className="text-sm text-[var(--text-muted)]">No data</p>
              ) : (
                <div className="space-y-2">
                  {financeData.topTenantsByRevenue
                    .slice(0, 8)
                    .map(
                      (
                        t: { tenant_id?: string; tenant_type?: string; revenue?: number },
                        i: number
                      ) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--app-border)] last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-muted)] w-5">
                              #{i + 1}
                            </span>
                            <span className="text-[var(--text)] truncate max-w-[160px]">
                              {t.tenant_id?.slice(0, 8) ?? '?'}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {t.tenant_type}
                            </Badge>
                          </div>
                          <span className="font-semibold" style={{ color: 'var(--mint)' }}>
                            {formatCurrency(t.revenue ?? 0)}
                          </span>
                        </div>
                      )
                    )}
                </div>
              )}
            </Card>
          </div>

          {(financeData?.topTenantsByOverdue?.length ?? 0) > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <p className="text-sm font-semibold text-red-700">Overdue Balances</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#fef2f2' }}>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-red-700">
                        Tenant
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-red-700">
                        Type
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-red-700">
                        Overdue Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {financeData!.topTenantsByOverdue.map(
                      (
                        t: { tenant_id?: string; tenant_type?: string; overdue_amount?: number },
                        i: number
                      ) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-xs text-[var(--text)]">
                            {t.tenant_id?.slice(0, 8) ?? '?'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">
                              {t.tenant_type}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-red-600">
                            {formatCurrency(t.overdue_amount ?? 0)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
