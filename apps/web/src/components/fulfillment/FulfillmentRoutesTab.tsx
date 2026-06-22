import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { useGetFulfillmentRouteQuery, useGetFulfillmentRoutesQuery } from '../../services/api'
import { FulfillmentRouteDetailPanel } from './FulfillmentRouteDetailPanel'
import { DeliveryTrackingDrawer } from './DeliveryTrackingDrawer'

type Props = {
  warehouseId?: string
}

export function FulfillmentRoutesTab({ warehouseId: _warehouseId }: Props) {
  const { t } = useTranslation('fulfillment')
  const { data, isLoading, isError, refetch } = useGetFulfillmentRoutesQuery()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)

  const {
    data: detailData,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useGetFulfillmentRouteQuery(selectedId ?? '', { skip: !selectedId })

  const routes = data?.routes ?? []

  return (
    <div className="space-y-4" data-testid="fulfillment-routes-tab">
      <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <MapPin className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
            {t('routes.title')}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-mid)]">{t('routes.subtitle')}</p>
        </header>
        <div className="p-4 sm:p-5">
          {isLoading ? (
            <div className="space-y-3" data-testid="routes-loading">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-10 text-center" data-testid="routes-error" role="alert">
              <p className="text-sm text-[var(--text-muted)]">{t('routes.loadFailed')}</p>
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
          ) : routes.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] py-12 px-4 text-center"
              data-testid="routes-empty"
            >
              <MapPin className="mx-auto mb-3 h-10 w-10 text-[var(--text-muted)]" />
              <p className="font-medium text-[var(--text)]">{t('routes.emptyTitle')}</p>
              <p className="mt-2 text-sm text-[var(--text-muted)] max-w-md mx-auto">
                {t('routes.emptyDescriptionBefore')}{' '}
                <Link to="/app/fulfillment" className="text-[var(--brand-mid)] hover:underline">
                  {t('routes.emptyDescriptionLink')}
                </Link>{' '}
                {t('routes.emptyDescriptionAfter')}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 sm:hidden" data-testid="routes-mobile-list">
                {routes.map((route) => (
                  <article
                    key={route.id}
                    className={`rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4 ${
                      selectedId === route.id ? 'ring-2 ring-[var(--brand-mid)]/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[var(--text)]">{route.routeLabel}</p>
                        <p className="text-sm text-[var(--text-muted)]">{route.driverName}</p>
                      </div>
                      <Badge variant={route.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>
                        {route.status === 'PLANNED' ? t('routes.routePlanned') : route.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      {route.scheduledDate
                        ? new Date(route.scheduledDate).toLocaleDateString()
                        : '—'}
                      {route.area ? ` · ${route.area}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text)]">
                      {t('routes.stopsSummary', {
                        stops: Array.isArray(route.stops) ? route.stops.length : route.stops,
                        done: route.completedStops,
                      })}
                    </p>
                    <Button
                      className="mt-3 min-h-[44px] w-full"
                      size="lg"
                      variant="outline"
                      onClick={() => setSelectedId(route.id)}
                    >
                      {t('routes.viewRoute')}
                    </Button>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto -mx-1 px-1 sm:block">
                <table className="w-full min-w-[720px] text-sm" data-testid="routes-table">
                  <thead>
                    <tr className="border-b text-left text-[var(--text-muted)]">
                      <th className="p-2 font-medium">{t('routes.table.route')}</th>
                      <th className="p-2 font-medium">{t('routes.table.driver')}</th>
                      <th className="p-2 font-medium">{t('routes.table.date')}</th>
                      <th className="p-2 font-medium">{t('routes.table.area')}</th>
                      <th className="p-2 font-medium">{t('routes.table.stops')}</th>
                      <th className="p-2 font-medium">{t('routes.table.progress')}</th>
                      <th className="p-2 font-medium">{t('routes.table.status')}</th>
                      <th className="p-2 font-medium text-right">{t('routes.table.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((route) => (
                      <tr
                        key={route.id}
                        className={`border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)] ${
                          selectedId === route.id ? 'bg-[var(--brand-ultra)]' : ''
                        }`}
                      >
                        <td className="p-2 font-medium">{route.routeLabel}</td>
                        <td className="p-2">{route.driverName}</td>
                        <td className="p-2 whitespace-nowrap">
                          {route.scheduledDate
                            ? new Date(route.scheduledDate).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="p-2 text-[var(--text-muted)]">{route.area || '—'}</td>
                        <td className="p-2 tabular-nums">
                          {Array.isArray(route.stops) ? route.stops.length : route.stops}
                        </td>
                        <td className="p-2 text-xs text-[var(--text-muted)]">
                          {t('routes.table.progressSummary', {
                            done: route.completedStops,
                            failed: route.failedStops,
                          })}
                          {route.rescheduledStops > 0
                            ? t('routes.table.rescheduled', { count: route.rescheduledStops })
                            : ''}
                        </td>
                        <td className="p-2">
                          <Badge variant={route.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>
                            {route.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedId(route.id)}
                          >
                            {t('routes.table.view')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      {selectedId && detailLoading && (
        <Skeleton className="h-48 w-full rounded-xl" data-testid="routes-detail-loading" />
      )}
      {selectedId && detailError && !detailLoading && (
        <div
          className="rounded-xl border border-[var(--app-border)] py-8 text-center"
          data-testid="routes-detail-error"
          role="alert"
        >
          <p className="text-sm text-[var(--text-muted)]">{t('routes.detailLoadFailed')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetchDetail()}
          >
            {t('common:actions.retry')}
          </Button>
        </div>
      )}
      {selectedId && detailData?.route && !detailLoading && (
        <FulfillmentRouteDetailPanel
          route={detailData.route}
          onClose={() => setSelectedId(null)}
          onViewTracking={setTrackingOrderId}
        />
      )}

      <DeliveryTrackingDrawer
        orderId={trackingOrderId}
        open={!!trackingOrderId}
        onOpenChange={(open) => {
          if (!open) setTrackingOrderId(null)
        }}
      />
    </div>
  )
}
