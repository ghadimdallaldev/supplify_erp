import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Plus, ShoppingCart } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useGetRestaurantOrgQuery,
  useGetRestaurantOrgReportsOverviewQuery,
  useSwitchRestaurantOrgBranchContextMutation,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { useImpersonation } from '../hooks/useImpersonation'
import { multiBranchEnabled } from '../lib/planLimits'
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

function hasCentralPurchasing(
  entitlements:
    | {
        features?: Record<string, unknown>
        planFeatures?: Record<string, unknown>
      }
    | null
    | undefined
) {
  const v = entitlements?.features?.multi_branch ?? entitlements?.planFeatures?.multi_branch
  return v === 'central_purchasing'
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
  const centralPurchasing = hasCentralPurchasing(entitlements)
  const { data, isLoading } = useGetRestaurantOrgQuery(undefined, {
    skip: !isEffectiveRestaurant,
  })
  const { data: reports } = useGetRestaurantOrgReportsOverviewQuery(undefined, {
    skip: !isEffectiveRestaurant || !multiBranch,
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
            {centralPurchasing ? (
              <Link
                to="/app/org/central-purchasing"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
              >
                <ShoppingCart className="h-4 w-4" />
                Central purchasing
              </Link>
            ) : null}
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
