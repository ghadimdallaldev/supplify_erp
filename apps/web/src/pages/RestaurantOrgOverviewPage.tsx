import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useGetRestaurantOrgQuery,
  useGetRestaurantOrgReportsOverviewQuery,
  useSwitchRestaurantOrgBranchContextMutation,
  useGetRestaurantOrgBranchComparisonQuery,
  useGetRestaurantOrgBranchDemandForecastQuery,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { useImpersonation } from '../hooks/useImpersonation'
import {
  featureEnabled,
  meetsIntelligenceTier,
  multiBranchEnabled,
  smartReorderHasForecast,
} from '../lib/planLimits'
import { usePermissions } from '../hooks/usePermissions'
import { RestaurantAddBranchModal } from '../components/org/RestaurantAddBranchModal'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { ensureNamespace } from '../i18n'

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

export function RestaurantOrgOverviewPage() {
  const { t } = useTranslation('reports')

  useEffect(() => {
    void ensureNamespace('reports')
  }, [])

  const navigate = useNavigate()
  const { isEffectiveRestaurant } = useImpersonation()
  const { can } = usePermissions()
  const canManageOrg = can('SETTINGS_MANAGE')
  const { entitlements } = useEntitlements()
  const multiBranch = multiBranchEnabled(entitlements)
  const canViewBranchComparison =
    multiBranch &&
    meetsIntelligenceTier(entitlements, 'scale') &&
    featureEnabled(entitlements?.features?.waste_tracking) &&
    featureEnabled(entitlements?.features?.receiving_quality) &&
    can('ORDERS_VIEW') &&
    can('INVENTORY_VIEW') &&
    can('RECEIVING_VIEW')
  const canViewBranchDemandForecast =
    multiBranch &&
    meetsIntelligenceTier(entitlements, 'scale') &&
    smartReorderHasForecast(entitlements?.features?.smart_reorder) &&
    can('INVENTORY_VIEW')

  const { data, isLoading } = useGetRestaurantOrgQuery(undefined, {
    skip: !isEffectiveRestaurant,
  })
  const { data: reports } = useGetRestaurantOrgReportsOverviewQuery(undefined, {
    skip: !isEffectiveRestaurant || !multiBranch,
  })
  const { data: comparison } = useGetRestaurantOrgBranchComparisonQuery(undefined, {
    skip: !isEffectiveRestaurant || !canViewBranchComparison,
  })
  const { data: demandForecast } = useGetRestaurantOrgBranchDemandForecastQuery(undefined, {
    skip: !isEffectiveRestaurant || !canViewBranchDemandForecast,
  })
  const [addBranchOpen, setAddBranchOpen] = useState(false)
  const [switchBranch] = useSwitchRestaurantOrgBranchContextMutation()

  const orgRole = data?.orgRole
  const branches = data?.branches ?? []
  const kpis = reports?.kpis
  const byBranch = reports?.by_branch ?? []
  const spendById = new Map(
    byBranch.map((row) => [String(row.branch_account_id), Number(row.total_spend || 0)])
  )

  const handleOpenBranch = async (restaurantId: string) => {
    await switchBranch({ restaurant_id: restaurantId }).unwrap()
    navigate('/app/dashboard')
    window.location.reload()
  }

  if (isEffectiveRestaurant && !multiBranch && !isLoading) {
    navigate('/app/dashboard', { replace: true })
    return null
  }

  if (!multiBranch) {
    return (
      <PageShell data-testid="restaurant-org-overview-page">
        <PageHeader title={t('org.title')} description={t('org.upgradeDescription')} />
        <Link to="/app/settings?tab=subscription" className="text-sm underline inline-block">
          {t('org.viewSubscription')}
        </Link>
      </PageShell>
    )
  }

  return (
    <PageShell data-testid="restaurant-org-overview-page">
      <PageHeader
        title={data?.organization?.name ?? t('org.title')}
        description={t('org.branchCount', {
          count: branches.length,
          role: orgRole ?? '',
        })}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageOrg ? (
              <button
                type="button"
                onClick={() => setAddBranchOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] text-white px-3 py-2 text-sm"
              >
                <Plus className="h-4 w-4" />
                {t('org.addBranch')}
              </button>
            ) : null}
          </div>
        }
      />

      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          <div className="rounded-lg border border-[var(--app-border)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Orders (period)</p>
            <p className="text-2xl font-semibold mt-1">{kpis.order_count}</p>
          </div>
          <div className="rounded-lg border border-[var(--app-border)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Spend (period)</p>
            <p className="text-2xl font-semibold mt-1">
              {formatMoney(Number(kpis.total_spend || 0))}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--app-border)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Active Branch Accounts</p>
            <p className="text-2xl font-semibold mt-1">{kpis.active_branch_accounts}</p>
          </div>
        </div>
      ) : null}

      {demandForecast?.data?.branches?.length ? (
        <section className="mb-6 rounded-lg border border-[var(--app-border)] p-4">
          <h2 className="font-semibold">Branch demand forecasts</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Current cached restaurant-account forecasts only. Stale and legacy intra-tenant branch
            forecasts are excluded.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {demandForecast.data.branches.map((branch) => (
              <div
                key={branch.branchAccountId}
                className="rounded border border-[var(--app-border)] p-3 text-sm"
              >
                <p className="font-medium">{branch.branchAccountName}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {branch.coverage.freshForecasts} current forecasts ·{' '}
                  {branch.coverage.highOrUrgentForecasts} high or urgent
                </p>
                {branch.forecasts.length ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {branch.forecasts.slice(0, 3).map((forecast) => (
                      <li key={forecast.productId}>
                        {forecast.productName}: {forecast.forecastDailyUsage ?? '—'}{' '}
                        {forecast.productUnit}/day · {forecast.urgency}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    No current forecast cache.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {comparison?.data?.coverage?.foodCost?.available === false ? (
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Food-cost comparison is unavailable because branch accounts do not share a comparable
          recipe/menu identity.
        </p>
      ) : null}
      {comparison?.data?.branches?.length ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {comparison.data.branches.map((branch) => (
            <div
              key={String(branch.branchAccountId)}
              className="rounded-lg border border-[var(--app-border)] p-4 text-sm"
            >
              <p className="font-medium">{String(branch.branchAccountName)}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Spend {formatMoney(Number(branch.purchasing?.spend || 0))} ·{' '}
                {Number(branch.purchasing?.orderCount || 0)} orders ·{' '}
                {Number(branch.inventory?.outOfStockProducts || 0)} out of stock ·{' '}
                {Number(branch.waste?.incidents || 0)} waste incidents
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {branches.map((branch: Record<string, unknown>) => (
          <button
            key={String(branch.id)}
            type="button"
            onClick={() => handleOpenBranch(String(branch.id)).catch(() => {})}
            className="text-left border border-[var(--app-border)] rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors"
          >
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-[var(--text-muted)] mt-0.5" />
              <div>
                <p className="font-medium">{String(branch.name)}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t('org.staffOrdersThisMonth', {
                    staff: Number(branch.staff_count ?? 0),
                    orders: Number(branch.orders_this_month ?? 0),
                  })}
                  {spendById.has(String(branch.id))
                    ? ` · ${formatMoney(Number(spendById.get(String(branch.id)) ?? 0))} spend`
                    : ''}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {canManageOrg && (
        <RestaurantAddBranchModal open={addBranchOpen} onClose={() => setAddBranchOpen(false)} />
      )}
    </PageShell>
  )
}
