import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useGetEntitlementsQuery, useGetSupplierStockoutRisksQuery } from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import {
  meetsIntelligenceTier,
  resolveEntitlementFeature,
  smartReorderHasForecast,
} from '../../lib/planLimits'
import { EmptyState } from '../ui/empty-state'

export function SupplierStockoutRiskPanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const entitlements = entitlementsData?.entitlements
  const allowed =
    can('ORDERS_VIEW') &&
    can('WAREHOUSES_VIEW') &&
    smartReorderHasForecast(resolveEntitlementFeature(entitlements, 'smart_reorder')) &&
    meetsIntelligenceTier(entitlements, 'scale')
  const { data, isLoading } = useGetSupplierStockoutRisksQuery(undefined, { skip: !allowed })

  if (!allowed) return null

  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-stockout-risks"
    >
      <h2 className="text-[15px] font-extrabold text-[var(--text)]">
        {t('commandCenter.stockoutRisks.title')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.stockoutRisks.description', { horizon: data?.horizonDays ?? 14 })}
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.stockoutRisks.loading')}
        </p>
      ) : data?.risks?.length ? (
        <ul className="mt-3 list-none space-y-2 p-0">
          {data.risks.map((risk) => (
            <li key={risk.productId} className="rounded-lg border border-[var(--app-border)] p-2.5">
              <Link
                to={`/app/products/${risk.productId}`}
                className="text-sm font-semibold text-[var(--brand)] hover:underline"
              >
                {risk.productName}
              </Link>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('commandCenter.stockoutRisks.item', {
                  available: risk.availableQty,
                  shortfall: risk.shortfallQty,
                  horizon: data.horizonDays,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={t('commandCenter.stockoutRisks.emptyTitle')}
          description={t('commandCenter.stockoutRisks.emptyDescription')}
        />
      )}
    </section>
  )
}
