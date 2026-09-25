import { useTranslation } from 'react-i18next'
import {
  useGetEntitlementsQuery,
  useGetSupplierWeeklyIntelligenceSummaryQuery,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import {
  featureEnabled,
  meetsIntelligenceTier,
  resolveEntitlementFeature,
} from '../../lib/planLimits'
export function SupplierWeeklyIntelligenceSummaryPanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: e } = useGetEntitlementsQuery()
  const f = e?.entitlements
  const ok =
    can('ORDERS_VIEW') &&
    can('WAREHOUSES_VIEW') &&
    can('FULFILLMENT_VIEW') &&
    featureEnabled(resolveEntitlementFeature(f, 'inventory_management')) &&
    featureEnabled(resolveEntitlementFeature(f, 'warehouses')) &&
    featureEnabled(resolveEntitlementFeature(f, 'fulfillment')) &&
    featureEnabled(resolveEntitlementFeature(f, 'multi_warehouse')) &&
    featureEnabled(resolveEntitlementFeature(f, 'smart_reorder')) &&
    meetsIntelligenceTier(f, 'scale')
  const { data } = useGetSupplierWeeklyIntelligenceSummaryQuery(undefined, { skip: !ok })
  if (!ok) return null
  return (
    <section
      data-testid="supplier-weekly-intelligence-summary"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
    >
      <h2 className="text-[15px] font-extrabold">{t('commandCenter.weeklySummary.title')}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.weeklySummary.description')}
      </p>
      {data && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.weeklySummary.counts', {
            slow: data.summary.slowMovingProducts,
            stockout: data.summary.stockoutRisks,
            cross: data.summary.crossSellOpportunities,
            warehouses: data.summary.warehousesWithLowStock,
            forecast: data.summary.warehouseForecasts,
          })}
        </p>
      )}
    </section>
  )
}
