import { useTranslation } from 'react-i18next'
import {
  useGetEntitlementsQuery,
  useGetSupplierWarehouseDemandForecastQuery,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import {
  featureEnabled,
  meetsIntelligenceTier,
  resolveEntitlementFeature,
} from '../../lib/planLimits'
import { EmptyState } from '../ui/empty-state'
export function SupplierWarehouseDemandForecastPanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: e } = useGetEntitlementsQuery()
  const entitlements = e?.entitlements
  const allowed =
    can('ORDERS_VIEW') &&
    can('WAREHOUSES_VIEW') &&
    featureEnabled(resolveEntitlementFeature(entitlements, 'multi_warehouse')) &&
    featureEnabled(resolveEntitlementFeature(entitlements, 'smart_reorder')) &&
    meetsIntelligenceTier(entitlements, 'scale')
  const { data, isLoading } = useGetSupplierWarehouseDemandForecastQuery(undefined, {
    skip: !allowed,
  })
  if (!allowed) return null
  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-warehouse-demand-forecast"
    >
      <h2 className="text-[15px] font-extrabold text-[var(--text)]">
        {t('commandCenter.warehouseForecast.title')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.warehouseForecast.description', { horizon: data?.horizonDays ?? 14 })}
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.warehouseForecast.loading')}
        </p>
      ) : data?.forecasts?.length ? (
        <ul className="mt-3 list-none space-y-2 p-0">
          {data.forecasts.map((f) => (
            <li
              key={`${f.warehouseId}:${f.productId}`}
              className="rounded-lg border border-[var(--app-border)] p-2.5"
            >
              <p className="text-sm font-semibold text-[var(--text)]">
                {f.warehouseName} — {f.productName}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('commandCenter.warehouseForecast.item', {
                  quantity: f.projectedDemandQty,
                  horizon: data.horizonDays,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={t('commandCenter.warehouseForecast.emptyTitle')}
          description={t('commandCenter.warehouseForecast.emptyDescription')}
        />
      )}
    </section>
  )
}
