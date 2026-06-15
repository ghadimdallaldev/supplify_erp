import { useGetPromotionsAnalyticsSummaryQuery } from '../../services/api'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { Skeleton } from '../ui/skeleton'

type Props = {
  title: string
  days?: number
}

export function DealsPerformanceSummary({ title, days = 30 }: Props) {
  const { data, isLoading, isError } = useGetPromotionsAnalyticsSummaryQuery({ days })
  const summary = data?.summary as Record<string, unknown> | undefined

  if (isLoading) {
    return (
      <div
        className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4 sm:p-5"
        data-testid="deals-performance-summary"
      >
        <Skeleton className="mb-4 h-5 w-48" />
        <div className="flex flex-wrap gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !summary) {
    return null
  }

  const topDeals = (summary.topDeals as Array<Record<string, unknown>>) || []

  const primaryMetrics = [
    { label: 'Live deals', value: summary.activeDeals },
    { label: 'Views', value: summary.views },
    { label: 'Clicks', value: summary.clicks },
    { label: 'Orders influenced', value: summary.ordersInfluenced },
  ]

  const secondaryMetrics = [
    {
      label: 'Conversion',
      value: summary.conversionRate != null ? `${Number(summary.conversionRate)}%` : '—',
    },
    { label: 'Coupon uses', value: summary.couponUses },
    { label: 'Discount given', value: formatCurrency(Number(summary.totalDiscount || 0)) },
    { label: 'Pending approval', value: summary.pendingDeals },
  ]

  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4 sm:p-5"
      data-testid="deals-performance-summary"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <TrendingUp className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-mid)]">Last {days} days</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {primaryMetrics.map((metric) => (
            <Metric key={metric.label} label={metric.label} value={metric.value} emphasis />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--app-border)] pt-4 text-sm">
        {secondaryMetrics.map((metric) => (
          <span key={metric.label} className="text-[var(--text-mid)]">
            <span className="text-[var(--text-muted)]">{metric.label}</span>{' '}
            <span className="font-medium tabular-nums text-[var(--text)]">
              {metric.value != null && metric.value !== '' ? String(metric.value) : '0'}
            </span>
          </span>
        ))}
      </div>

      {topDeals.length > 0 ? (
        <div className="mt-4 border-t border-[var(--app-border)] pt-4">
          <p className="mb-2 text-sm font-medium text-[var(--text)]">Top performers</p>
          <ul className="divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]">
            {topDeals.map((deal, index) => (
              <li
                key={String(deal.id)}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--text)]">
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[10px] font-semibold text-[var(--brand-mid)]"
                  >
                    {index + 1}
                  </span>
                  <span className="truncate">{String(deal.name)}</span>
                </span>
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                  {Number(deal.views || 0)} views · {Number(deal.clicks || 0)} clicks ·{' '}
                  {Number(deal.orders_influenced || 0)} orders
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: unknown
  emphasis?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-[var(--text-mid)]">{label}</p>
      <p
        className={
          emphasis
            ? 'mt-0.5 text-xl font-semibold tabular-nums text-[var(--text)]'
            : 'mt-0.5 font-medium tabular-nums text-[var(--text)]'
        }
      >
        {value != null && value !== '' ? String(value) : '0'}
      </p>
    </div>
  )
}
