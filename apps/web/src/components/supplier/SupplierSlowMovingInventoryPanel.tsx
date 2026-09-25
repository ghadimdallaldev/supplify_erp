import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useGetEntitlementsQuery, useGetSupplierSlowMovingInventoryQuery } from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import { isEntitlementFeatureEnabled, meetsIntelligenceTier } from '../../lib/planLimits'
import { EmptyState } from '../ui/empty-state'

export function SupplierSlowMovingInventoryPanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const entitlements = entitlementsData?.entitlements
  const allowed =
    can('WAREHOUSES_VIEW') &&
    isEntitlementFeatureEnabled(entitlements, 'inventory_management') &&
    meetsIntelligenceTier(entitlements, 'scale')
  const { data, isLoading } = useGetSupplierSlowMovingInventoryQuery(undefined, { skip: !allowed })

  if (!allowed) return null

  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-slow-moving-inventory"
    >
      <h2 className="text-[15px] font-extrabold text-[var(--text)]">
        {t('commandCenter.slowMoving.title')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.slowMoving.description')}
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.slowMoving.loading')}
        </p>
      ) : data?.products?.length ? (
        <ul className="mt-3 list-none space-y-2 p-0">
          {data.products.map((product) => (
            <li
              key={product.productId}
              className="rounded-lg border border-[var(--app-border)] p-2.5"
            >
              <Link
                to={`/app/products/${product.productId}`}
                className="text-sm font-semibold text-[var(--brand)] hover:underline"
              >
                {product.productName}
              </Link>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('commandCenter.slowMoving.coverage', {
                  days: Math.ceil(product.stockCoverDays),
                  sold: product.soldQuantity,
                  window: data.windowDays,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={t('commandCenter.slowMoving.emptyTitle')}
          description={t('commandCenter.slowMoving.emptyDescription')}
        />
      )}
    </section>
  )
}
