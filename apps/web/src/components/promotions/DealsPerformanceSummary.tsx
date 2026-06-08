import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { useGetPromotionsAnalyticsSummaryQuery } from '../../services/api'
import { Loader2, TrendingUp } from 'lucide-react'
import { formatCurrency } from '../../utils/format'

type Props = {
  title: string
  days?: number
}

export function DealsPerformanceSummary({ title, days = 30 }: Props) {
  const { data, isLoading, isError } = useGetPromotionsAnalyticsSummaryQuery({ days })
  const summary = data?.summary as Record<string, unknown> | undefined

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </CardContent>
      </Card>
    )
  }

  if (isError || !summary) {
    return null
  }

  const topDeals = (summary.topDeals as Array<Record<string, unknown>>) || []

  return (
    <Card data-testid="deals-performance-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--brand)]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Live deals" value={summary.activeDeals} />
          <Stat label="Views" value={summary.views} />
          <Stat label="Clicks" value={summary.clicks} />
          <Stat label="Orders influenced" value={summary.ordersInfluenced} />
          <Stat
            label="Conversion"
            value={summary.conversionRate != null ? `${Number(summary.conversionRate)}%` : '—'}
          />
          <Stat label="Coupon uses" value={summary.couponUses} />
          <Stat label="Discount given" value={formatCurrency(Number(summary.totalDiscount || 0))} />
          <Stat label="Pending approval" value={summary.pendingDeals} />
        </div>
        {topDeals.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Top performing deals
            </p>
            <ul className="space-y-2 text-sm">
              {topDeals.map((deal) => (
                <li
                  key={String(deal.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2"
                >
                  <span className="font-medium">{String(deal.name)}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {Number(deal.views || 0)} views · {Number(deal.clicks || 0)} clicks ·{' '}
                    {Number(deal.orders_influenced || 0)} orders
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[var(--text)]">
        {value != null && value !== '' ? String(value) : '0'}
      </p>
    </div>
  )
}
