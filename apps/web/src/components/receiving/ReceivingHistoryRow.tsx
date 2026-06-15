import { Link } from 'react-router-dom'
import { History, Star } from 'lucide-react'
import { Badge } from '../ui/badge'
import { formatPrice } from '../../utils/format'

type ReceivingReport = {
  id: string
  order_id?: string
  supplier_name?: string
  received_at?: string
  quality_score?: number | string | null
  status?: string
  total_items_ordered?: number | string
  total_items_received?: number | string
  total_actual_cost?: number | string
  delivery_notes?: string | null
}

export function ReceivingHistoryRow({ report }: { report: ReceivingReport }) {
  const ordered = Number(report.total_items_ordered ?? 0)
  const received = Number(report.total_items_received ?? 0)
  const hasShortage = ordered > received

  return (
    <article
      data-testid={`receiving-history-${report.id}`}
      className="px-4 py-4 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-[var(--text)]">
              #{report.order_id?.slice(0, 8).toUpperCase() || 'N/A'}
            </h3>
            {report.supplier_name ? <Badge variant="outline">{report.supplier_name}</Badge> : null}
            {report.status ? (
              <Badge variant={report.status === 'ACCEPTED' ? 'default' : 'secondary'}>
                {report.status}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[var(--text-mid)]">
            Received {report.received_at ? new Date(report.received_at).toLocaleString() : '—'}
          </p>
          <p className="mt-2 text-sm text-[var(--text-mid)]">
            <span className="font-medium tabular-nums text-[var(--text)]">{ordered}</span> ordered
            <span className="mx-1.5 text-[var(--app-border)]">·</span>
            <span
              className={
                hasShortage
                  ? 'font-medium tabular-nums text-[var(--amber)]'
                  : 'font-medium tabular-nums text-[var(--text)]'
              }
            >
              {received}
            </span>{' '}
            received
            <span className="mx-1.5 text-[var(--app-border)]">·</span>
            <span className="font-medium tabular-nums text-[var(--text)]">
              {formatPrice(Number(report.total_actual_cost ?? 0))}
            </span>
          </p>
          {report.delivery_notes ? (
            <p className="mt-2 text-sm text-[var(--text-mid)]">
              <span className="font-medium text-[var(--text)]">Notes:</span> {report.delivery_notes}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {report.quality_score != null && report.quality_score !== '' ? (
            <div className="flex items-center gap-1 rounded-lg bg-[var(--brand-pale)] px-2.5 py-1.5">
              <Star className="h-4 w-4 fill-[var(--amber)] text-[var(--amber)]" aria-hidden />
              <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
                {report.quality_score}
              </span>
              <span className="sr-only">Quality score</span>
            </div>
          ) : null}
          {report.order_id ? (
            <Link
              to={`/app/orders/${report.order_id}`}
              className="text-sm font-medium text-[var(--brand-mid)] hover:underline"
            >
              View order
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function ReceivingHistoryEmptyIcon() {
  return <History className="h-6 w-6" aria-hidden />
}
