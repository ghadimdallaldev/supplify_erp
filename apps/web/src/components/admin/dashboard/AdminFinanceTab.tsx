import { useTranslation } from 'react-i18next'
import { AlertCircle, DollarSign, Loader2, RefreshCw, TrendingUp } from 'lucide-react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { AppPanel, SummaryStrip } from '../../ui/app-panel'
import { TableScroll } from '../../ui/table-scroll'
import { responsiveDataListClasses } from '../../ui/responsive-data-list'
import { useGetAdminFinancialOverviewQuery } from '../../../services/api'
import { formatPlanDisplayName } from '../../../lib/planComparison'
import { formatCurrency } from '../../../utils/format'
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSkeleton,
  AdminSectionHeader,
} from '../adminUi'
import { cn } from '../../../lib/utils'

export interface AdminFinanceTabProps {
  active: boolean
}

type RevenueByPlanRow = {
  planCode?: string
  planName?: string
  tenantType?: string
  subscriptionCount?: number
  mrr?: number
}

type TenantRevenueRow = {
  tenant_id?: string
  tenant_type?: string
  revenue?: number
  overdue_amount?: number
}

function tenantTypeTone(type?: string): string {
  return type === 'SUPPLIER'
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : 'bg-sky-50 text-sky-800 border-sky-200'
}

export function AdminFinanceTab({ active }: AdminFinanceTabProps) {
  const { t } = useTranslation('admin')
  const {
    data: financeData,
    isLoading: financeLoading,
    isFetching: financeFetching,
    isError: financeError,
    error: financeQueryError,
    refetch: refetchFinance,
  } = useGetAdminFinancialOverviewQuery(undefined, { skip: !active })

  const revenueByPlan = (financeData?.revenueByPlan ?? []) as RevenueByPlanRow[]
  const topTenants = (financeData?.topTenantsByRevenue ?? []) as TenantRevenueRow[]
  const overdueTenants = (financeData?.topTenantsByOverdue ?? []) as TenantRevenueRow[]
  const maxMrr = Math.max(...revenueByPlan.map((r) => Number(r.mrr) || 0), 1)

  return (
    <>
      <AdminSectionHeader
        title={t('finance.title')}
        description={t('finance.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchFinance()}
            disabled={financeFetching}
          >
            {financeFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      {financeLoading ? (
        <AdminLoadingSkeleton rows={8} />
      ) : financeError ? (
        <AdminErrorState
          title={t('finance.unavailableTitle')}
          message={
            (financeQueryError as { data?: { message?: string } })?.data?.message ||
            'The finance API request failed. Figures are not shown as zero to avoid misleading data.'
          }
          onRetry={() => refetchFinance()}
        />
      ) : (
        <>
          {financeData?.mrrExcludesFreeTrial && (
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              MRR and ARR exclude Free Trial and Enterprise plans (paid subscriptions only).
            </p>
          )}

          <div className="mb-4">
            <SummaryStrip
              testId="admin-finance-stats"
              metrics={[
                {
                  label: 'GMV (all time)',
                  value: formatCurrency(financeData?.gmv ?? 0),
                  hint: 'Total invoice value',
                  tone: 'brand',
                },
                {
                  label: 'MRR',
                  value: formatCurrency(financeData?.mrr ?? 0),
                  hint: `ARR ${formatCurrency(financeData?.arr ?? 0)} · paid plans only`,
                  tone: 'mint',
                },
                {
                  label: 'Outstanding',
                  value: formatCurrency(financeData?.outstanding ?? 0),
                  hint: 'Awaiting payment',
                  tone: 'amber',
                },
                {
                  label: 'Overdue',
                  value: formatCurrency(financeData?.overdue ?? 0),
                  hint: 'Past due date',
                  tone: (financeData?.overdue ?? 0) > 0 ? 'danger' : 'default',
                },
              ]}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AppPanel
              title={t('finance.revenueByPlan')}
              description={`${revenueByPlan.length} plan${revenueByPlan.length === 1 ? '' : 's'} with active subscriptions`}
              testId="admin-finance-revenue-by-plan"
              footer={
                financeFetching ? (
                  <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </p>
                ) : undefined
              }
            >
              {revenueByPlan.length === 0 ? (
                <AdminEmptyState
                  icon={<TrendingUp className="h-8 w-8 text-[var(--text-muted)]" />}
                  title={t('finance.noPlanRevenueTitle')}
                  description={t('finance.noPlanRevenueDescription')}
                />
              ) : (
                <div className="space-y-4">
                  {revenueByPlan.map((row, i) => (
                    <div key={`${row.planCode}-${row.tenantType}-${i}`}>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-medium text-[var(--text)]">
                            {formatPlanDisplayName(row.planCode, row.planName)}
                          </span>
                          {row.tenantType && (
                            <Badge
                              variant="outline"
                              className={cn('text-xs capitalize', tenantTypeTone(row.tenantType))}
                            >
                              {row.tenantType.toLowerCase()}
                            </Badge>
                          )}
                          <span className="text-[var(--text-muted)]">
                            {row.subscriptionCount ?? 0} subs
                          </span>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">
                          {formatCurrency(row.mrr ?? 0)}
                          <span className="font-normal text-[var(--text-muted)]">/mo</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-border)]">
                        <div
                          className="h-1.5 rounded-full bg-[var(--brand)]"
                          style={{
                            width: `${Math.min(100, Math.round((Number(row.mrr) / maxMrr) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AppPanel>

            <AppPanel
              title={t('finance.topTenantsByRevenue')}
              description={`Top ${Math.min(8, topTenants.length)} of ${topTenants.length} tenant${topTenants.length === 1 ? '' : 's'}`}
              testId="admin-finance-top-tenants"
            >
              {topTenants.length === 0 ? (
                <AdminEmptyState
                  icon={<DollarSign className="h-8 w-8 text-[var(--text-muted)]" />}
                  title={t('finance.noTenantRevenueTitle')}
                  description={t('finance.noTenantRevenueDescription')}
                />
              ) : (
                <ul className="divide-y divide-[var(--app-border)]">
                  {topTenants.slice(0, 8).map((tenant, i) => (
                    <li
                      key={`${tenant.tenant_id}-${i}`}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 text-xs font-bold text-[var(--text-muted)]">
                          #{i + 1}
                        </span>
                        <span
                          className="truncate font-mono text-sm text-[var(--text)]"
                          title={tenant.tenant_id}
                        >
                          {tenant.tenant_id?.slice(0, 8) ?? '?'}
                        </span>
                        {tenant.tenant_type && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'shrink-0 text-xs capitalize',
                              tenantTypeTone(tenant.tenant_type)
                            )}
                          >
                            {tenant.tenant_type.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-[var(--mint)]">
                        {formatCurrency(tenant.revenue ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AppPanel>
          </div>

          {overdueTenants.length > 0 && (
            <div className="mt-4">
              <AppPanel
                title={t('finance.overdueBalances')}
                description={`${overdueTenants.length} tenant${overdueTenants.length === 1 ? '' : 's'} with past-due invoices`}
                testId="admin-finance-overdue"
              >
                <div className="space-y-3 lg:hidden">
                  {overdueTenants.map((tenant, i) => (
                    <article
                      key={`${tenant.tenant_id}-${i}-card`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] p-4"
                    >
                      <div>
                        <span className="font-mono text-xs text-[var(--text)]">
                          {tenant.tenant_id?.slice(0, 8) ?? '?'}
                        </span>
                        {tenant.tenant_type && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'ml-2 text-xs capitalize',
                              tenantTypeTone(tenant.tenant_type)
                            )}
                          >
                            {tenant.tenant_type.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                      <span className="font-semibold tabular-nums text-[var(--red)]">
                        {formatCurrency(tenant.overdue_amount ?? 0)}
                      </span>
                    </article>
                  ))}
                </div>
                <TableScroll
                  aria-label={t('finance.overdueBalancesTableAriaLabel')}
                  className="hidden lg:block"
                >
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--app-border)] bg-[var(--red-pale)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--red)]">
                        <th className="px-4 py-3">{t('common.table.tenant')}</th>
                        <th
                          className={cn(
                            'hidden px-4 py-3',
                            responsiveDataListClasses.columnSecondary
                          )}
                        >
                          Type
                        </th>
                        <th className="px-4 py-3 text-right">Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {overdueTenants.map((tenant, i) => (
                        <tr
                          key={`${tenant.tenant_id}-${i}`}
                          className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                        >
                          <td className="px-4 py-3.5">
                            <span
                              className="font-mono text-xs text-[var(--text)]"
                              title={tenant.tenant_id}
                            >
                              {tenant.tenant_id?.slice(0, 8) ?? '?'}
                            </span>
                            {tenant.tenant_type && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'ml-2 text-xs capitalize sm:hidden',
                                  tenantTypeTone(tenant.tenant_type)
                                )}
                              >
                                {tenant.tenant_type.toLowerCase()}
                              </Badge>
                            )}
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {tenant.tenant_type ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs capitalize',
                                  tenantTypeTone(tenant.tenant_type)
                                )}
                              >
                                {tenant.tenant_type.toLowerCase()}
                              </Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[var(--red)]">
                            {formatCurrency(tenant.overdue_amount ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </AppPanel>
            </div>
          )}

          {(financeData?.overdue ?? 0) > 0 && overdueTenants.length === 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--amber-pale)] bg-[var(--amber-pale)]/40 px-3 py-2 text-xs text-[var(--amber)]">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Platform overdue total is {formatCurrency(financeData?.overdue ?? 0)} but no
                per-tenant breakdown is available.
              </span>
            </div>
          )}
        </>
      )}
    </>
  )
}
