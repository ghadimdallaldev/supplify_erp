import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { formatPrice } from '../../utils/format'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import type { DispatchOrderCard } from '../../types'
import { formatOrderRef, formatScheduledAt } from './fulfillmentDispatchUtils'
import { MapPin, Package, Phone, Truck, Navigation } from 'lucide-react'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'

type Props = {
  order: DispatchOrderCard
  showDriver?: boolean
  actions?: React.ReactNode
  children?: React.ReactNode
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  selectDisabledReason?: string
  onViewTracking?: (orderId: string) => void
}

function deliveryStatusVariant(
  status?: string | null
): 'default' | 'secondary' | 'outline' | 'destructive' {
  const s = (status || 'pending').toLowerCase()
  if (s === 'delivered') return 'default'
  if (s === 'failed') return 'destructive'
  if (s === 'out_for_delivery' || s === 'picked_up') return 'secondary'
  if (s === 'rescheduled') return 'outline'
  return 'outline'
}

function TruncatedDriverName({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0 truncate">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function DispatchOrderRow({
  order,
  showDriver,
  actions,
  children,
  selectable,
  selected,
  onToggleSelect,
  selectDisabledReason,
  onViewTracking,
}: Props) {
  const { t } = useTranslation('fulfillment')
  const driver = order.assignment?.driver
  const assignmentStatus = order.assignment?.status ?? order.delivery_status ?? 'pending'
  const scheduledDeliveryDate = order.assignment?.scheduled_delivery_date ?? null
  const rolledOver = Boolean(order.assignment?.rolled_over_at)
  const area = order.delivery_area?.trim()
  const areaLabel = area || t('dispatch.orderRow.areaNotSet')
  const tracking = order.tracking ?? null
  const gpsLabel = getGpsStatusLabel(tracking)
  const driverLabel = driver
    ? `${driver.full_name}${driver.vehicle_type ? ` · ${driver.vehicle_type}` : ''}`
    : null

  return (
    <article
      data-testid={`dispatch-order-${order.id}`}
      className="p-3 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {selectable && (
          <div className="flex items-start pt-1">
            <input
              type="checkbox"
              data-testid={`dispatch-select-${order.id}`}
              className="h-4 w-4 rounded border-[var(--app-border)]"
              checked={selected}
              disabled={!!selectDisabledReason}
              title={selectDisabledReason}
              onChange={onToggleSelect}
            />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-[var(--text)]">
              {order.restaurant_name || t('dispatch.orderRow.restaurantFallback')}
            </h4>
            <Badge
              variant={deliveryStatusVariant(assignmentStatus)}
              data-testid="dispatch-order-status"
            >
              {formatDeliveryStatus(assignmentStatus)}
            </Badge>
            <Badge
              variant={tracking?.isStale ? 'outline' : 'secondary'}
              data-testid="dispatch-gps-status"
              className="text-[10px]"
            >
              {gpsLabel}
            </Badge>
            {order.route_planning_label ? (
              <Badge variant="outline" data-testid="dispatch-planned-route-badge">
                {order.route_planning_label}
                {order.active_route_number ? ` · ${order.active_route_number}` : ''}
              </Badge>
            ) : order.active_route_number && order.active_route_status === 'PLANNED' ? (
              <Badge variant="outline" data-testid="dispatch-planned-route-badge">
                {t('dispatch.orderRow.plannedRoute', { routeNumber: order.active_route_number })}
              </Badge>
            ) : null}
            {assignmentStatus === 'rescheduled' && rolledOver ? (
              <Badge
                variant="outline"
                className="border-[var(--amber)] text-[var(--amber)]"
                data-testid="dispatch-rollover-badge"
              >
                {t('dispatch.orderRow.movedToTomorrow')}
                {scheduledDeliveryDate
                  ? ` · ${new Date(scheduledDeliveryDate).toLocaleDateString()}`
                  : ''}
              </Badge>
            ) : null}
          </div>

          <p className="text-xs text-[var(--text-mid)]">
            <Link
              to={`/app/orders/${order.id}`}
              className="font-medium text-[var(--brand-mid)] hover:underline"
            >
              {formatOrderRef(order.id)}
            </Link>
            <span className="mx-1.5 text-[var(--app-border)]">·</span>
            <span className="inline-flex items-center gap-1">
              <Package className="h-3 w-3 shrink-0" aria-hidden />
              {t('dispatch.orderRow.items', { count: order.item_count ?? 0 })}
            </span>
            <span className="mx-1.5 text-[var(--app-border)]">·</span>
            {formatPrice(order.total_amount)}
          </p>

          <div className="flex flex-col gap-1 text-xs text-[var(--text-mid)]">
            <p className="inline-flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-mid)]" aria-hidden />
              <span>{areaLabel}</span>
            </p>
            <p>
              {t('dispatch.orderRow.scheduled', {
                date: formatScheduledAt(order.scheduled_at ?? order.created_at),
              })}
            </p>
          </div>

          {showDriver && (
            <div className="text-xs text-[var(--text-mid)]">
              {driver && driverLabel ? (
                <div className="space-y-1">
                  <p className="inline-flex min-w-0 max-w-full items-center gap-1 font-medium text-[var(--text)]">
                    <Truck className="h-3 w-3 shrink-0" aria-hidden />
                    <TruncatedDriverName label={driverLabel} />
                  </p>
                  {driver.phone && (
                    <a
                      href={`tel:${driver.phone}`}
                      className="inline-flex items-center gap-1 text-[var(--brand-mid)] hover:underline"
                    >
                      <Phone className="h-3 w-3" aria-hidden />
                      {driver.phone}
                    </a>
                  )}
                </div>
              ) : (
                <p className="font-medium text-[var(--amber)]">
                  {t('dispatch.orderRow.unassigned')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
          {actions}
          {onViewTracking && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              data-testid={`dispatch-view-tracking-${order.id}`}
              onClick={() => onViewTracking(order.id)}
            >
              <Navigation className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('dispatch.orderRow.trackDelivery')}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="whitespace-nowrap" asChild>
            <Link to={`/app/orders/${order.id}`}>{t('dispatch.orderRow.viewOrder')}</Link>
          </Button>
        </div>
      </div>

      {children ? (
        <div className="mt-3 border-t border-[var(--app-border)] pt-3">{children}</div>
      ) : null}
    </article>
  )
}
