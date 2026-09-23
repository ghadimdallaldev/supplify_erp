import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useGetEntitlementsQuery, useGetSupplierDemandForecastQuery } from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import {
  meetsIntelligenceTier,
  resolveEntitlementFeature,
  smartReorderHasForecast,
} from '../../lib/planLimits'
import { EmptyState } from '../ui/empty-state'

export function SupplierDemandForecastPanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const entitlements = entitlementsData?.entitlements
  const allowed =
    can('ORDERS_VIEW') &&
    smartReorderHasForecast(resolveEntitlementFeature(entitlements, 'smart_reorder')) &&
    meetsIntelligenceTier(entitlements, 'scale')
  const { data, isLoading } = useGetSupplierDemandForecastQuery(undefined, { skip: !allowed })

  if (!allowed) return null

  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-demand-forecast"
    >
      <h2 className="text-[15px] font-extrabold text-[var(--text)]">
        {t('commandCenter.demandForecast.title')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.demandForecast.description', {
          horizon: data?.horizonDays ?? 14,
          observation: data?.observationDays ?? 90,
        })}
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.demandForecast.loading')}
        </p>
      ) : data?.forecasts?.length ? (
        <ul className="mt-3 list-none space-y-2 p-0">
          {data.forecasts.map((forecast) => (
            <li
              key={forecast.productId}
              className="rounded-lg border border-[var(--app-border)] p-2.5"
            >
              <Link
                to={`/app/products/${forecast.productId}`}
                className="text-sm font-semibold text-[var(--brand)] hover:underline"
              >
                {forecast.productName}
              </Link>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('commandCenter.demandForecast.item', {
                  quantity: forecast.projectedDemandQty,
                  horizon: data.horizonDays,
                  daily: forecast.forecastDailyDemand,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={t('commandCenter.demandForecast.emptyTitle')}
          description={t('commandCenter.demandForecast.emptyDescription')}
        />
      )}
    </section>
  )
}
