import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, Map, Truck, Navigation } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { TableScroll } from '../ui/table-scroll'
import { responsiveDataListClasses } from '../ui/responsive-data-list'
import { useGetSupplierDeliveryBoardQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'
import { formatOrderRef, formatScheduledAt } from './fulfillmentDispatchUtils'
import { cn } from '../../lib/utils'
import { DeliveryTrackingDrawer } from './DeliveryTrackingDrawer'
import { LazyActiveDeliveriesMap } from '../maps/LazyActiveDeliveriesMap'

type ViewMode = 'board' | 'map'

export function FulfillmentTrackingTab() {
  const { t } = useTranslation('fulfillment')
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const { data, isLoading, isError, refetch } = useGetSupplierDeliveryBoardQuery(
    { status: 'active_delivery' },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true }
  )

  const orders = data?.orders ?? []

  return (
    <>
      <section
        data-testid="fulfillment-tracking-tab"
        className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
      >
        <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Truck className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
                {t('tracking.title')}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-mid)]">{t('tracking.subtitle')}</p>
            </div>
            <div
              className="flex rounded-lg border border-[var(--app-border)] bg-[var(--bg)] p-0.5"
              data-testid="fulfillment-tracking-view-toggle"
            >
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'board' ? 'default' : 'ghost'}
                className="h-8 gap-1"
                data-testid="fulfillment-tracking-board-view"
                onClick={() => setViewMode('board')}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                {t('tracking.board')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'map' ? 'default' : 'ghost'}
                className="h-8 gap-1"
                data-testid="fulfillment-tracking-map-view"
                onClick={() => setViewMode('map')}
              >
                <Map className="h-3.5 w-3.5" aria-hidden />
                {t('tracking.mapView')}
              </Button>
            </div>
          </div>
        </header>
        <div className="p-4 sm:p-5">
          {isLoading ? (
            <div className="space-y-3" data-testid="tracking-loading">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-10 text-center" data-testid="tracking-error" role="alert">
              <p className="text-sm text-[var(--text-muted)]">{t('tracking.loadFailed')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => refetch()}
              >
                {t('common:actions.retry')}
              </Button>
            </div>
          ) : orders.length === 0 ? (
            <div
              className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] py-12 text-center"
              data-testid="tracking-empty"
            >
              <Truck className="mx-auto mb-3 h-9 w-9 text-[var(--text-muted)]" aria-hidden />
              <p className="text-sm text-[var(--text-mid)]">{t('tracking.empty')}</p>
            </div>
          ) : viewMode === 'map' ? (
            <LazyActiveDeliveriesMap orders={orders} onSelectOrder={setTrackingOrderId} />
          ) : (
            <>
              <div className="space-y-3 lg:hidden" data-testid="tracking-cards">
                {orders.map((o) => (
                  <article
                    key={o.orderId}
                    className="rounded-xl border border-[var(--app-border)] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-[var(--text-muted)]">
                          {formatOrderRef(o.orderId)}
                        </p>
                        <p className="font-medium">{o.restaurantName}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {o.driverName || t('tracking.table.unassigned')}
                        </p>
                      </div>
                      <Badge variant="secondary">{formatDeliveryStatus(o.deliveryStatus)}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {t('tracking.table.area')}
                        </p>
                        <p>{o.deliveryArea?.trim() || t('tracking.table.areaNotSet')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {t('tracking.table.scheduled')}
                        </p>
                        <p>{formatScheduledAt(o.scheduledAt)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-[var(--text-muted)]">
                          {t('tracking.table.gps')}
                        </p>
                        <p
                          className={
                            o.tracking?.isStale ? 'text-amber-700 dark:text-amber-400' : ''
                          }
                        >
                          {getGpsStatusLabel(o.tracking)}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      data-testid={`tracking-view-${o.orderId}`}
                      onClick={() => setTrackingOrderId(o.orderId)}
                    >
                      <Navigation className="mr-1 h-3.5 w-3.5" aria-hidden />
                      {t('tracking.table.viewTracking')}
                    </Button>
                  </article>
                ))}
              </div>
              <TableScroll aria-label={t('tracking.title')} className="hidden lg:block">
                <table className="w-full min-w-[720px] text-sm" data-testid="tracking-table">
                  <thead>
                    <tr className="border-b text-left text-[var(--text-muted)]">
                      <th className="p-2 font-medium">{t('tracking.table.order')}</th>
                      <th
                        className={cn('p-2 font-medium', responsiveDataListClasses.columnSecondary)}
                      >
                        {t('tracking.table.restaurant')}
                      </th>
                      <th
                        className={cn('p-2 font-medium', responsiveDataListClasses.columnSecondary)}
                      >
                        {t('tracking.table.driver')}
                      </th>
                      <th
                        className={cn('p-2 font-medium', responsiveDataListClasses.columnTertiary)}
                      >
                        {t('tracking.table.area')}
                      </th>
                      <th
                        className={cn('p-2 font-medium', responsiveDataListClasses.columnTertiary)}
                      >
                        {t('tracking.table.scheduled')}
                      </th>
                      <th
                        className={cn('p-2 font-medium', responsiveDataListClasses.columnTertiary)}
                      >
                        {t('tracking.table.gps')}
                      </th>
                      <th
                        className={cn('p-2 font-medium', responsiveDataListClasses.columnSecondary)}
                      >
                        {t('tracking.table.status')}
                      </th>
                      <th className="p-2 font-medium text-right">{t('tracking.table.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr
                        key={o.orderId}
                        className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                      >
                        <td className="p-2 font-mono text-xs">{formatOrderRef(o.orderId)}</td>
                        <td className={cn('p-2', responsiveDataListClasses.columnSecondary)}>
                          {o.restaurantName}
                        </td>
                        <td className={cn('p-2', responsiveDataListClasses.columnSecondary)}>
                          {o.driverName || t('tracking.table.unassigned')}
                        </td>
                        <td
                          className={cn(
                            'p-2 text-[var(--text-muted)]',
                            responsiveDataListClasses.columnTertiary
                          )}
                        >
                          {o.deliveryArea?.trim() || t('tracking.table.areaNotSet')}
                        </td>
                        <td
                          className={cn(
                            'p-2 text-[var(--text-muted)]',
                            responsiveDataListClasses.columnTertiary
                          )}
                        >
                          {formatScheduledAt(o.scheduledAt)}
                        </td>
                        <td
                          className={cn(
                            'p-2 text-[var(--text-muted)]',
                            responsiveDataListClasses.columnTertiary
                          )}
                          data-testid="tracking-gps-status"
                        >
                          <span
                            className={
                              o.tracking?.isStale ? 'text-amber-700 dark:text-amber-400' : ''
                            }
                          >
                            {getGpsStatusLabel(o.tracking)}
                          </span>
                        </td>
                        <td className={cn('p-2', responsiveDataListClasses.columnSecondary)}>
                          <Badge variant="secondary">
                            {formatDeliveryStatus(o.deliveryStatus)}
                          </Badge>
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`tracking-view-${o.orderId}`}
                            onClick={() => setTrackingOrderId(o.orderId)}
                            title={t('tracking.table.viewTracking')}
                          >
                            <Navigation className="h-3.5 w-3.5 xl:hidden" aria-hidden />
                            <span className={responsiveDataListClasses.actionLabel}>
                              {t('tracking.table.viewTracking')}
                            </span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </>
          )}
        </div>
      </section>

      <DeliveryTrackingDrawer
        orderId={trackingOrderId}
        open={!!trackingOrderId}
        onOpenChange={(open) => {
          if (!open) setTrackingOrderId(null)
        }}
      />
    </>
  )
}
