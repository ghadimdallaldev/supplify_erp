import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useGetRestaurantOrgQuery,
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
  const { data, isLoading } = useGetRestaurantOrgQuery(undefined, {
    skip: !isEffectiveRestaurant,
  })
  const [addBranchOpen, setAddBranchOpen] = useState(false)
  const [switchBranch] = useSwitchRestaurantOrgBranchContextMutation()

  const orgRole = data?.orgRole
  const branches = data?.branches ?? []

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
          canManageOrg ? (
            <button
              type="button"
              onClick={() => setAddBranchOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] text-white px-3 py-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              {t('org.addBranch')}
            </button>
          ) : undefined
        }
      />

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
