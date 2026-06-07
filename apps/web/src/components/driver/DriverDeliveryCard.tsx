import { MapPin, Navigation, Package } from 'lucide-react'
import { Button } from '../ui/button'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { formatOrderRef } from '../fulfillment/fulfillmentDispatchUtils'
import {
  driverStatusBadgeClass,
  getDriverActionsForStatus,
  getDriverStatusTone,
} from '../../lib/driverDeliveryUi'

export type DriverDeliveryOrder = {
  orderId: string
  restaurantName: string
  deliveryArea?: string | null
  deliveryStatus: string
  scheduledAt?: string | null
  hasPod?: boolean
}

type Props = {
  order: DriverDeliveryOrder
  notes: string
  onNotesChange: (value: string) => void
  onStatus: (status: string) => void
  disabled?: boolean
  isNext?: boolean
}

const actionClass = 'min-h-[48px] w-full text-sm font-semibold'

export function DriverDeliveryCard({
  order,
  notes,
  onNotesChange,
  onStatus,
  disabled,
  isNext,
}: Props) {
  const tone = getDriverStatusTone(order.deliveryStatus)
  const actions = getDriverActionsForStatus(order.deliveryStatus)
  const primary = actions[0]
  const secondary = actions.slice(1)

  return (
    <article
      data-testid={`driver-delivery-${order.orderId}`}
      className={`overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-sm ${
        isNext
          ? 'border-[var(--brand-mid)] ring-2 ring-[var(--brand-mid)]/20'
          : 'border-[var(--app-border)]'
      }`}
    >
      <div className="border-b border-[var(--app-border)] bg-[var(--brand-ultra)]/40 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            {isNext ? (
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--brand-mid)]">
                Up next
              </p>
            ) : null}
            <h2 className="truncate text-base font-semibold text-[var(--text)]">
              {order.restaurantName}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">{formatOrderRef(order.orderId)}</p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${driverStatusBadgeClass(tone)}`}
          >
            {formatDeliveryStatus(order.deliveryStatus)}
          </span>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-[var(--text-mid)]">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
          <span>{order.deliveryArea || 'Delivery area not set'}</span>
        </p>

        {order.scheduledAt ? (
          <p className="text-xs text-[var(--text-muted)]">
            Scheduled{' '}
            {new Date(order.scheduledAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        ) : null}

        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(order.deliveryArea || order.restaurantName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--brand-mid)]"
        >
          <Navigation className="h-4 w-4" aria-hidden />
          Navigate
        </a>

        <textarea
          className="min-h-[52px] w-full rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3 text-base sm:text-sm"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />

        {primary ? (
          <Button
            size="lg"
            className={`${actionClass} ${
              primary.variant === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
            }`}
            variant={primary.variant === 'outline' ? 'outline' : 'default'}
            disabled={disabled}
            onClick={() => onStatus(primary.value)}
          >
            {primary.label}
          </Button>
        ) : null}

        {secondary.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {secondary.map((action) => (
              <Button
                key={action.value}
                size="lg"
                variant={action.variant === 'danger' ? 'outline' : 'outline'}
                className={`${actionClass} ${
                  action.variant === 'danger'
                    ? 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300'
                    : ''
                }`}
                disabled={disabled}
                onClick={() => onStatus(action.value)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        {order.hasPod ? (
          <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Package className="h-3.5 w-3.5" aria-hidden />
            Proof of delivery on file
          </p>
        ) : null}
      </div>
    </article>
  )
}
