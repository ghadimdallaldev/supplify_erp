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
  tenantId?: string
  tenantType?: string
  tenantName?: string
  revenue?: number
  overdueAmount?: number
}

function tenantTypeTone(type?: string): string {
  return type === 'SUPPLIER'
    ? 'bg-[var(--app-bg-subtle)] text-[var(--text)] border-[var(--app-border-mid)]'
    : 'bg-[var(--brand-ultra)] text-[var(--brand-mid)] border-[var(--app-border-mid)]'
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
            t('finance.apiFailedMessage')
          }
          onRetry={() => refetchFinance()}
        />
      ) : (
        <>
          {financeData?.mrrExcludesFreeTrial && (
            <p className="mb-3 text-xs text-[var(--text-muted)]">{t('finance.mrrDisclaimer')}</p>
          )}

          <div className="mb-4">
            <SummaryStrip
              testId="admin-finance-stats"
              metrics={[
                {
                  label: t('finance.metrics.gmv'),
                  value: formatCurrency(financeData?.gmv ?? 0),
                  hint: t('finance.metrics.gmvHint'),
                  tone: 'brand',
                },
                {
                  label: t('finance.metrics.mrr'),
                  value: formatCurrency(financeData?.mrr ?? 0),
                  hint: t('finance.metrics.mrrHint', {
                    arr: formatCurrency(financeData?.arr ?? 0),
                  }),
                  tone: 'mint',
                },
                {
                  label: t('finance.metrics.outstanding'),
                  value: formatCurrency(financeData?.outstanding ?? 0),
                  hint: t('finance.metrics.outstandingHint'),
                  tone: 'amber',
                },
                {
                  label: t('finance.metrics.overdue'),
                  value: formatCurrency(financeData?.overdue ?? 0),
                  hint: t('finance.metrics.overdueHint'),
                  tone: (financeData?.overdue ?? 0) > 0 ? 'danger' : 'default',
                },
              ]}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AppPanel
              title={t('finance.revenueByPlan')}
              description={t('finance.plansWithSubscriptions', { count: revenueByPlan.length })}
              testId="admin-finance-revenue-by-plan"
              footer={
                financeFetching ? (
                  <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('common.updating')}
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
                            {t('finance.subsAbbrev', { count: row.subscriptionCount ?? 0 })}
                          </span>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">
                          {formatCurrency(row.mrr ?? 0)}
                          <span className="font-normal text-[var(--text-muted)]">
                            {t('finance.perMonth')}
                          </span>
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
              description={t('finance.topTenantsDescription', {
                shown: Math.min(8, topTenants.length),
                total: topTenants.length,
                count: topTenants.length,
              })}
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
                      key={`${tenant.tenantId}-${tenant.tenantType}-${i}`}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 text-xs font-bold text-[var(--text-muted)]">
                          #{i + 1}
                        </span>
                        <span
                          className="truncate text-sm text-[var(--text)]"
                          title={tenant.tenantId}
                        >
                          {tenant.tenantName || tenant.tenantId?.slice(0, 8) || '?'}
                        </span>
                        {tenant.tenantType && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'shrink-0 text-xs capitalize',
                              tenantTypeTone(tenant.tenantType)
                            )}
                          >
                            {tenant.tenantType.toLowerCase()}
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
                description={t('finance.overdueTenantsDescription', {
                  count: overdueTenants.length,
                })}
                testId="admin-finance-overdue"
              >
                <div className="space-y-3 lg:hidden">
                  {overdueTenants.map((tenant, i) => (
                    <article
                      key={`${tenant.tenantId}-${tenant.tenantType}-${i}-card`}
                      className="flex items-center justify-between gap-3 rounded-md border border-[var(--app-border)] p-4"
                    >
                      <div>
                        <span className="text-xs text-[var(--text)]" title={tenant.tenantId}>
                          {tenant.tenantName || tenant.tenantId?.slice(0, 8) || '?'}
                        </span>
                        {tenant.tenantType && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'ml-2 text-xs capitalize',
                              tenantTypeTone(tenant.tenantType)
                            )}
                          >
                            {tenant.tenantType.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                      <span className="font-semibold tabular-nums text-[var(--red)]">
                        {formatCurrency(tenant.overdueAmount ?? 0)}
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
                          {t('common.table.type')}
                        </th>
                        <th className="px-4 py-3 text-right">{t('common.table.overdue')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {overdueTenants.map((tenant, i) => (
                        <tr
                          key={`${tenant.tenantId}-${tenant.tenantType}-${i}`}
                          className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                        >
                          <td className="px-4 py-3.5">
                            <span className="text-xs text-[var(--text)]" title={tenant.tenantId}>
                              {tenant.tenantName || tenant.tenantId?.slice(0, 8) || '?'}
                            </span>
                            {tenant.tenantType && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'ml-2 text-xs capitalize sm:hidden',
                                  tenantTypeTone(tenant.tenantType)
                                )}
                              >
                                {tenant.tenantType.toLowerCase()}
                              </Badge>
                            )}
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {tenant.tenantType ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs capitalize',
                                  tenantTypeTone(tenant.tenantType)
                                )}
                              >
                                {tenant.tenantType.toLowerCase()}
                              </Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[var(--red)]">
                            {formatCurrency(tenant.overdueAmount ?? 0)}
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
                {t('finance.overdueBreakdownUnavailable', {
                  amount: formatCurrency(financeData?.overdue ?? 0),
                })}
              </span>
            </div>
          )}
        </>
      )}
    </>
  )
}
