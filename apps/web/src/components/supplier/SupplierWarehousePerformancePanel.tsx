import { useTranslation } from 'react-i18next'
import {
  useGetEntitlementsQuery,
  useGetSupplierWarehousePerformanceQuery,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import {
  featureEnabled,
  meetsIntelligenceTier,
  resolveEntitlementFeature,
} from '../../lib/planLimits'
import { EmptyState } from '../ui/empty-state'

export function SupplierWarehousePerformancePanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: entitlementData } = useGetEntitlementsQuery()
  const entitlements = entitlementData?.entitlements
  const allowed =
    can('WAREHOUSES_VIEW') &&
    can('FULFILLMENT_VIEW') &&
    featureEnabled(resolveEntitlementFeature(entitlements, 'warehouses')) &&
    featureEnabled(resolveEntitlementFeature(entitlements, 'fulfillment')) &&
    meetsIntelligenceTier(entitlements, 'scale')
  const { data, isLoading } = useGetSupplierWarehousePerformanceQuery(undefined, {
    skip: !allowed,
  })

  if (!allowed) return null

  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-warehouse-performance"
    >
      <h2 className="text-[15px] font-extrabold text-[var(--text)]">
        {t('commandCenter.warehousePerformance.title')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.warehousePerformance.description', { days: data?.windowDays ?? 30 })}
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.warehousePerformance.loading')}
        </p>
      ) : data?.warehouses?.length ? (
        <ul className="mt-3 list-none space-y-2 p-0">
          {data.warehouses.map((warehouse) => (
            <li
              key={warehouse.warehouseId}
              className="rounded-lg border border-[var(--app-border)] p-2.5"
            >
              <p className="text-sm font-semibold text-[var(--text)]">{warehouse.warehouseName}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('commandCenter.warehousePerformance.item', {
                  assignments: warehouse.assignmentCount,
                  delivered: warehouse.deliveredCount,
                  active: warehouse.activeCount,
                  failed: warehouse.failedCount,
                  lowStock: warehouse.lowStockProducts,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={t('commandCenter.warehousePerformance.emptyTitle')}
          description={t('commandCenter.warehousePerformance.emptyDescription')}
        />
      )}
    </section>
  )
}
