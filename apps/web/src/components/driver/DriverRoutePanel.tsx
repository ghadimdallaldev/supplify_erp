import { MapPin, Navigation, Package, Route } from 'lucide-react'
import { Button } from '../ui/button'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { formatOrderRef } from '../fulfillment/fulfillmentDispatchUtils'
import { formatPrice } from '../../utils/format'
import {
  driverStatusBadgeClass,
  getDriverStatusTone,
  routeStopIsComplete,
} from '../../lib/driverDeliveryUi'
import type { DeliveryRouteDetail } from '../../types'

type Props = {
  route: DeliveryRouteDetail
  notes: Record<string, string>
  onNotesChange: (orderId: string, value: string) => void
  onStopStatus: (
    stopId: string,
    orderId: string,
    status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'
  ) => void
  disabled?: boolean
}

const actionClass = 'min-h-[48px] w-full text-sm font-semibold'

export function DriverRoutePanel({ route, notes, onNotesChange, onStopStatus, disabled }: Props) {
  const completed = route.stops.filter((s) => routeStopIsComplete(s.status)).length
  const total = route.stops.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const nextStopIndex = route.stops.findIndex((s) => !routeStopIsComplete(s.status))

  return (
    <section
      data-testid="driver-active-route"
      className="overflow-hidden rounded-2xl border border-[var(--brand-mid)]/30 bg-[var(--surface)] shadow-sm"
    >
      <div className="border-b border-[var(--app-border)] bg-gradient-to-r from-[var(--brand-ultra)] to-[var(--surface)] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-mid)] text-white">
            <Route className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{route.routeLabel}</h2>
            <p className="text-xs text-[var(--text-muted)]">
              {route.routeNumber} · {formatDeliveryStatus(route.status)}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-[var(--brand-mid)]">
            {completed}/{total}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
          <div
            className="h-full rounded-full bg-[var(--brand-mid)] transition-all duration-300"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="driver-route-progress"
          />
        </div>
      </div>

      <div className="space-y-3 p-3">
        {route.stops.map((stop, index) => {
          const isNext = index === nextStopIndex
          const tone = getDriverStatusTone(stop.status)
          const showStart = stop.status === 'PLANNED'
          const showDeliver = stop.status === 'PLANNED' || stop.status === 'OUT_FOR_DELIVERY'
          const showFailed = stop.status !== 'DELIVERED' && stop.status !== 'FAILED'

          return (
            <div
              key={stop.id}
              data-testid={`driver-route-stop-${stop.id}`}
              className={`rounded-xl border p-3 ${
                isNext
                  ? 'border-[var(--brand-mid)] bg-[var(--brand-ultra)]/50 ring-1 ring-[var(--brand-mid)]/20'
                  : 'border-[var(--app-border)]'
              }`}
            >
              <div className="mb-3 flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    routeStopIsComplete(stop.status)
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : isNext
                        ? 'bg-[var(--brand-mid)] text-white'
                        : 'bg-[var(--brand-ultra)] text-[var(--text-muted)]'
                  }`}
                >
                  {stop.sequenceNumber}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {isNext ? (
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--brand-mid)]">
                      Next stop
                    </p>
                  ) : null}
                  <p className="font-semibold leading-snug">{stop.restaurantName}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatOrderRef(stop.orderId)}</p>
                  {stop.deliveryArea ? (
                    <p className="flex items-start gap-1.5 text-sm text-[var(--text-mid)]">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>{stop.deliveryArea}</span>
                    </p>
                  ) : null}
                  {stop.addressLine ? (
                    <p className="text-sm text-[var(--text)]">{stop.addressLine}</p>
                  ) : null}
                  {(stop.itemCount > 0 || stop.totalAmount > 0) && (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <Package className="h-3.5 w-3.5" aria-hidden />
                      {stop.itemCount > 0 ? `${stop.itemCount} items` : null}
                      {stop.totalAmount > 0 ? formatPrice(stop.totalAmount) : null}
                    </p>
                  )}
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${driverStatusBadgeClass(tone)}`}
                  >
                    {formatDeliveryStatus(stop.status)}
                  </span>
                </div>
              </div>

              {stop.addressLine ? (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(stop.addressLine)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] px-3 text-sm font-medium text-[var(--brand-mid)]"
                >
                  <Navigation className="h-4 w-4" aria-hidden />
                  Navigate
                </a>
              ) : null}

              {!routeStopIsComplete(stop.status) ? (
                <>
                  <textarea
                    className="mb-3 min-h-[48px] w-full rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3 text-base sm:text-sm"
                    placeholder="Notes (optional)"
                    value={notes[stop.orderId] ?? ''}
                    onChange={(e) => onNotesChange(stop.orderId, e.target.value)}
                  />
                  <div className="grid grid-cols-1 gap-2">
                    {showStart ? (
                      <Button
                        size="lg"
                        className={actionClass}
                        disabled={disabled}
                        onClick={() => onStopStatus(stop.id, stop.orderId, 'OUT_FOR_DELIVERY')}
                      >
                        Start delivery
                      </Button>
                    ) : null}
                    {showDeliver ? (
                      <Button
                        size="lg"
                        variant={showStart ? 'outline' : 'default'}
                        className={
                          showStart
                            ? actionClass
                            : `${actionClass} bg-emerald-600 hover:bg-emerald-700 text-white`
                        }
                        disabled={disabled}
                        onClick={() => onStopStatus(stop.id, stop.orderId, 'DELIVERED')}
                      >
                        Mark delivered
                      </Button>
                    ) : null}
                    {showFailed ? (
                      <Button
                        size="lg"
                        variant="outline"
                        className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300`}
                        disabled={disabled}
                        onClick={() => onStopStatus(stop.id, stop.orderId, 'FAILED')}
                      >
                        Failed
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
