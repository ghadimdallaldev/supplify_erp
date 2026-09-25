import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  useGetEntitlementsQuery,
  useGetSupplierCrossSellOpportunitiesQuery,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import { meetsIntelligenceTier } from '../../lib/planLimits'
import { EmptyState } from '../ui/empty-state'

export function SupplierCrossSellPanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const entitlements = entitlementsData?.entitlements
  const allowed = can('ORDERS_VIEW') && meetsIntelligenceTier(entitlements, 'scale')
  const { data, isLoading } = useGetSupplierCrossSellOpportunitiesQuery(undefined, {
    skip: !allowed,
  })

  if (!allowed) return null

  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-cross-sell-opportunities"
    >
      <h2 className="text-[15px] font-extrabold text-[var(--text)]">
        {t('commandCenter.crossSell.title')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.crossSell.description', { days: data?.observationDays ?? 180 })}
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.crossSell.loading')}
        </p>
      ) : data?.opportunities?.length ? (
        <ul className="mt-3 list-none space-y-2 p-0">
          {data.opportunities.map((opportunity) => (
            <li
              key={`${opportunity.restaurantId}-${opportunity.anchorProduct.productId}-${opportunity.candidateProduct.productId}`}
              className="rounded-lg border border-[var(--app-border)] p-2.5"
            >
              <p className="text-sm font-semibold text-[var(--text)]">
                {opportunity.restaurantName}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('commandCenter.crossSell.item', {
                  anchor: opportunity.anchorProduct.productName,
                  candidate: opportunity.candidateProduct.productName,
                  orders: opportunity.pairedOrderCount,
                })}
              </p>
              <Link
                to={`/app/products/${opportunity.candidateProduct.productId}`}
                className="mt-1 inline-block text-xs font-semibold text-[var(--brand)] hover:underline"
              >
                {opportunity.candidateProduct.productName}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={t('commandCenter.crossSell.emptyTitle')}
          description={t('commandCenter.crossSell.emptyDescription')}
        />
      )}
    </section>
  )
}
