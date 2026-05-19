import { Link, useParams } from 'react-router-dom'
import { useGetOrgQuery } from '../services/api'
import { useAppSelector } from '../hooks/redux'
import { useEntitlements } from '../hooks/useEntitlements'
import { BranchInvitationsPanel } from '../components/org/BranchInvitationsPanel'

export function BranchDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>()
  const { user } = useAppSelector((state) => state.auth)
  const { entitlements } = useEntitlements()
  const multiBranch = entitlements?.features?.multi_branch === true
  const { data, isLoading } = useGetOrgQuery(undefined, { skip: user?.role !== 'SUPPLIER' })

  const branch = data?.branches?.find((b) => (b as { id: string }).id === supplierId) as
    | { id: string; name: string }
    | undefined

  if (!multiBranch) {
    return (
      <div className="p-6">
        <p className="text-[var(--text-muted)]">Multi-branch is not enabled on your plan.</p>
        <Link to="/app/settings?tab=subscription" className="text-sm underline mt-2 inline-block">
          View subscription
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-[var(--text-muted)]">Loading branch…</p>
  }

  if (!branch || !supplierId) {
    return (
      <div className="p-6">
        <p className="text-[var(--text-muted)]">Branch not found.</p>
        <Link to="/app/org" className="text-sm underline mt-2 inline-block">
          Back to organization
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/app/org" className="text-sm text-[var(--brand)] hover:underline">
          ← Organization
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{branch.name}</h1>
        <p className="text-sm text-[var(--text-muted)]">Branch settings</p>
      </div>
      <BranchInvitationsPanel supplierId={supplierId} branchName={branch.name} />
    </div>
  )
}
