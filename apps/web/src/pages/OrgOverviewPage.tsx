import { useState } from 'react'
import { Building2, Plus, Settings } from 'lucide-react'
import { RestaurantOrgOverviewPage } from './RestaurantOrgOverviewPage'
import { Link, useNavigate } from 'react-router-dom'
import { useGetOrgQuery, useSwitchOrgBranchContextMutation } from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
import { usePermissions } from '../hooks/usePermissions'
import { RequirePermission } from '../components/RequirePermission'
import { useEntitlements } from '../hooks/useEntitlements'
import { multiBranchEnabled } from '../lib/planLimits'
import { AddBranchModal } from '../components/org/AddBranchModal'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'

export function OrgOverviewPage() {
  const { isEffectiveRestaurant, isEffectiveSupplier } = useImpersonation()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const { entitlements } = useEntitlements()
  const multiBranch = multiBranchEnabled(entitlements)
  const { data, isLoading } = useGetOrgQuery(undefined, {
    skip: !isEffectiveSupplier,
  })
  const [addBranchOpen, setAddBranchOpen] = useState(false)
  const [switchBranch] = useSwitchOrgBranchContextMutation()

  if (isEffectiveRestaurant) {
    return (
      <RequirePermission permission="SETTINGS_VIEW" title="organization">
        <RestaurantOrgOverviewPage />
      </RequirePermission>
    )
  }

  const orgRole = data?.orgRole
  const canManageOrg = can('SETTINGS_MANAGE')

  const branches = data?.branches ?? []

  const handleOpenBranch = async (supplierId: string) => {
    await switchBranch({ supplier_id: supplierId }).unwrap()
    navigate('/app/dashboard')
    window.location.reload()
  }

  if (isEffectiveSupplier && !multiBranch && !isLoading) {
    navigate('/app/dashboard', { replace: true })
    return null
  }

  if (!multiBranch) {
    return (
      <RequirePermission permission="SETTINGS_VIEW" title="organization">
        <PageShell data-testid="org-overview-page">
          <PageHeader
            title="Organization"
            description="Multi-branch accounts are available on Gold and above. Upgrade your plan to add locations."
          />
          <Link to="/app/settings?tab=subscription" className="text-sm underline inline-block">
            View subscription
          </Link>
        </PageShell>
      </RequirePermission>
    )
  }

  return (
    <RequirePermission permission="SETTINGS_VIEW" title="organization">
      <PageShell data-testid="org-overview-page">
        <PageHeader
          title={data?.organization?.name ?? 'Organization'}
          description={`${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${orgRole}`}
          actions={
            canManageOrg ? (
              <button
                type="button"
                onClick={() => setAddBranchOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] text-white px-3 py-2 text-sm"
              >
                <Plus className="h-4 w-4" />
                Add branch account
              </button>
            ) : undefined
          }
        />

        {isLoading && <p className="text-sm text-[var(--text-muted)]">Loading branches…</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          {branches.map((branch) => {
            const b = branch as {
              id: string
              name: string
              is_main_branch?: boolean
              is_branch_active?: boolean
              staff_count?: number
              order_count?: number
            }
            return (
              <div
                key={b.id}
                className="rounded-lg border border-[var(--app-border)] p-4 hover:border-[var(--primary)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {b.name}
                      {b.is_main_branch && (
                        <span className="text-xs rounded bg-[var(--surface-muted)] px-1.5 py-0.5">
                          Main
                        </span>
                      )}
                      {b.is_branch_active === false && (
                        <span className="text-xs rounded bg-amber-100 text-amber-900 px-1.5 py-0.5">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {b.staff_count ?? 0} staff · {b.order_count ?? 0} orders
                    </p>
                    <div className="flex flex-wrap gap-3 mt-3 text-sm">
                      <button
                        type="button"
                        className="text-[var(--brand)] hover:underline"
                        onClick={() => handleOpenBranch(b.id).catch(() => {})}
                      >
                        Open branch
                      </button>
                      {canManageOrg && (
                        <Link
                          to={`/app/org/branches/${b.id}`}
                          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand)]"
                        >
                          <Settings className="h-3.5 w-3.5" />
                          Invitations
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {canManageOrg && (
          <AddBranchModal open={addBranchOpen} onClose={() => setAddBranchOpen(false)} />
        )}
      </PageShell>
    </RequirePermission>
  )
}
