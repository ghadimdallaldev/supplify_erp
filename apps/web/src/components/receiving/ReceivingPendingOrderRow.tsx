import { Link } from 'react-router-dom'
import { PackageCheck, Loader2, Clock, AlertCircle, Truck, CheckCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatPrice } from '../../utils/format'
import { isOrderReadyForReceiving } from '../../lib/orderReceiving'

type ReceivingOrder = {
  id: string
  status?: string
  supplier_name?: string
  created_at?: string
  has_receiving_report?: boolean
  items?: Array<{
    product_name?: string
    sku?: string
    ordered_quantity?: number | string
    unit?: string
    unit_price?: number | string
  }>
}

type Props = {
  order: ReceivingOrder
  isProcessing: boolean
  canReceive: boolean
  isCreating: boolean
  onReceive: (order: ReceivingOrder) => void
}

function OrderStatusCallout({ status }: { status: string }) {
  const readyToReceive = isOrderReadyForReceiving(status)

  if (readyToReceive) {
    return (
      <p className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--mint-pale)] px-3 py-2 text-sm text-[var(--text)]">
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mint)]" aria-hidden />
        <span>
          {status === 'DELIVERED'
            ? 'Supplier marked delivered — confirm quantities on site.'
            : 'Ready to confirm receipt and quantities.'}
        </span>
      </p>
    )
  }

  const messages: Record<string, { icon: typeof Clock; text: string }> = {
    PLACED: { icon: Clock, text: 'Waiting for supplier to acknowledge order' },
    ACKNOWLEDGED: { icon: CheckCircle, text: 'Supplier acknowledged. Order is being prepared.' },
    PROCESSING: { icon: PackageCheck, text: 'Supplier is processing your order' },
    SHIPPED: { icon: Truck, text: 'In transit — waiting for supplier to mark as delivered.' },
  }

  const fallback = {
    icon: AlertCircle,
    text: `Status: ${status || 'unknown'}. Waiting for supplier to mark as delivered.`,
  }
  const { icon: Icon, text } = messages[status] ?? fallback

  return (
    <p className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--amber-pale)] px-3 py-2 text-sm text-[var(--text)]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" aria-hidden />
      <span>{text}</span>
    </p>
  )
}

export function ReceivingPendingOrderRow({
  order,
  isProcessing,
  canReceive,
  isCreating,
  onReceive,
}: Props) {
  const status = (order.status?.toUpperCase() || order.status || '') as string
  const readyToReceive = isOrderReadyForReceiving(status)
  const itemCount = order.items?.length ?? 0

  return (
    <article
      data-testid={`receiving-pending-order-${order.id}`}
      className="px-4 py-4 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-[var(--text)]">
              #{order.id.slice(0, 8).toUpperCase()}
            </h3>
            {order.supplier_name ? <Badge variant="outline">{order.supplier_name}</Badge> : null}
            <Badge
              variant={
                readyToReceive
                  ? 'default'
                  : status === 'SHIPPED' || status === 'PROCESSING'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {order.status || 'UNKNOWN'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--text-mid)]">
            Placed {order.created_at ? new Date(order.created_at).toLocaleString() : '—'}
            {itemCount > 0 ? (
              <>
                <span className="mx-1.5 text-[var(--app-border)]">·</span>
                {itemCount} line{itemCount === 1 ? '' : 's'}
              </>
            ) : null}
          </p>
          <OrderStatusCallout status={status} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-end">
          {order.has_receiving_report || isProcessing ? (
            <Button disabled variant="outline" className="opacity-75">
              <PackageCheck className="mr-2 h-4 w-4" />
              Received
            </Button>
          ) : readyToReceive && canReceive ? (
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => onReceive(order)}
              disabled={isCreating || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <PackageCheck className="mr-2 h-4 w-4" />
                  Receive now
                </>
              )}
            </Button>
          ) : (
            <Button
              disabled
              variant="outline"
              className="opacity-75"
              title="Order must be marked delivered by the supplier before receiving"
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              Not delivered yet
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/app/orders/${order.id}`}>View order</Link>
          </Button>
        </div>
      </div>

      {order.items && order.items.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]">
          {order.items.map((item, idx) => (
            <li
              key={idx}
              className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--text)]">
                  {item.product_name}
                </p>
                <p className="text-xs text-[var(--text-mid)]">
                  {item.sku}
                  <span className="mx-1.5 text-[var(--app-border)]">·</span>
                  {item.ordered_quantity} {item.unit}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium tabular-nums text-[var(--text)]">
                {formatPrice(Number(item.unit_price ?? 0))}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export function ReceivingSummaryStrip({
  pendingCount,
  readyCount,
  historyCount,
}: {
  pendingCount: number
  readyCount: number
  historyCount: number
}) {
  if (pendingCount === 0 && historyCount === 0) return null

  return (
    <section
      data-testid="receiving-summary"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-xs text-[var(--text-mid)]">Awaiting receipt</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--text)]">
            {pendingCount}
          </p>
        </div>
        {readyCount > 0 ? (
          <div>
            <p className="text-xs text-[var(--text-mid)]">Ready to receive</p>
            <p className="mt-0.5 font-medium tabular-nums text-[var(--mint)]">{readyCount}</p>
          </div>
        ) : null}
        <div>
          <p className="text-xs text-[var(--text-mid)]">Completed reports</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--text)]">{historyCount}</p>
        </div>
      </div>
    </section>
  )
}
