import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetEntitlementsQuery,
  useGetSupplierSuggestedDealCandidatesQuery,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import {
  featureEnabled,
  meetsIntelligenceTier,
  resolveEntitlementFeature,
} from '../../lib/planLimits'
import { EmptyState } from '../ui/empty-state'

export function SupplierSuggestedDealsPanel() {
  const { t } = useTranslation('supplierOps')
  const { can } = usePermissions()
  const { data: entitlementData } = useGetEntitlementsQuery()
  const entitlements = entitlementData?.entitlements
  const allowed =
    can('WAREHOUSES_VIEW') &&
    can('PROMOTIONS_MANAGE') &&
    featureEnabled(resolveEntitlementFeature(entitlements, 'inventory_management')) &&
    featureEnabled(resolveEntitlementFeature(entitlements, 'promotions')) &&
    meetsIntelligenceTier(entitlements, 'scale')
  const { data, isLoading } = useGetSupplierSuggestedDealCandidatesQuery(undefined, {
    skip: !allowed,
  })
  if (!allowed) return null
  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-suggested-deals"
    >
      <h2 className="text-[15px] font-extrabold text-[var(--text)]">
        {t('commandCenter.suggestedDeals.title')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t('commandCenter.suggestedDeals.description', { days: data?.windowDays ?? 90 })}
      </p>
      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t('commandCenter.suggestedDeals.loading')}
        </p>
      ) : data?.candidates?.length ? (
        <ul className="mt-3 list-none space-y-2 p-0">
          {data.candidates.map((candidate) => (
            <li
              key={candidate.productId}
              className="rounded-lg border border-[var(--app-border)] p-2.5"
            >
              <Link
                to={`/app/products/${candidate.productId}`}
                className="text-sm font-semibold text-[var(--brand)] hover:underline"
              >
                {candidate.productName}
              </Link>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t('commandCenter.suggestedDeals.item', {
                  cover: candidate.stockCoverDays,
                  sold: candidate.soldQuantity,
                  days: data.windowDays,
                })}
              </p>
              <Link
                to="/app/promotions"
                className="mt-1 inline-block text-xs font-semibold text-[var(--brand)] hover:underline"
              >
                {t('commandCenter.suggestedDeals.reviewDeal')}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={t('commandCenter.suggestedDeals.emptyTitle')}
          description={t('commandCenter.suggestedDeals.emptyDescription')}
        />
      )}
    </section>
  )
}
