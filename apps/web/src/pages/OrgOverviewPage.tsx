import { Building2, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useGetOrgQuery,
  useCreateOrgBranchMutation,
  useSwitchOrgBranchContextMutation,
} from '../services/api'
import { useAppSelector } from '../hooks/redux'
import { useEntitlements } from '../hooks/useEntitlements'

export function OrgOverviewPage() {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const { entitlements } = useEntitlements()
  const multiBranch = entitlements?.features?.multi_branch === true
  const { data, isLoading } = useGetOrgQuery(undefined, {
    skip: user?.role !== 'SUPPLIER',
  })
  const [createBranch, { isLoading: creating }] = useCreateOrgBranchMutation()
  const [switchBranch] = useSwitchOrgBranchContextMutation()

  const orgRole = data?.orgRole
  const canView = orgRole === 'Org Owner' || orgRole === 'Org Manager' || user?.role === 'ADMIN'

  if (user?.role === 'SUPPLIER' && !canView && !isLoading) {
    return (
      <div className="p-6">
        <p className="text-[var(--text-muted)]">
          Organization overview is available to Org Owner and Org Manager roles.
        </p>
        <Link to="/app/settings" className="text-sm underline mt-2 inline-block">
          Back to settings
        </Link>
      </div>
    )
  }

  const branches = data?.branches ?? []
  const isOrgOwner = orgRole === 'Org Owner'

  const handleOpenBranch = async (supplierId: string) => {
    await switchBranch({ supplier_id: supplierId }).unwrap()
    navigate('/app/dashboard')
    window.location.reload()
  }

  const handleAddBranch = async () => {
    const name = window.prompt('Branch name')
    if (!name?.trim()) return
    await createBranch({ name: name.trim() }).unwrap()
  }

  if (user?.role === 'SUPPLIER' && !multiBranch && !isLoading) {
    navigate('/app/dashboard', { replace: true })
    return null
  }

  if (!multiBranch) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-xl font-semibold mb-2">Organization</h1>
        <p className="text-[var(--text-muted)]">
          Multi-branch accounts are available on Silver and above. Upgrade your plan to add
          locations.
        </p>
        <Link to="/app/settings?tab=subscription" className="text-sm underline mt-4 inline-block">
          View subscription
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data?.organization?.name ?? 'Organization'}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {branches.length} branch{branches.length === 1 ? '' : 'es'} · {orgRole}
          </p>
        </div>
        {isOrgOwner && (
          <button
            type="button"
            onClick={() => handleAddBranch().catch(() => {})}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] text-white px-3 py-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add branch
          </button>
        )}
      </div>

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
            <button
              key={b.id}
              type="button"
              onClick={() => handleOpenBranch(b.id).catch(() => {})}
              className="text-left rounded-lg border border-[var(--app-border)] p-4 hover:border-[var(--primary)] transition-colors"
            >
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                <div>
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
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
