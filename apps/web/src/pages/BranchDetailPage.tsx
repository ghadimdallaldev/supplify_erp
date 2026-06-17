import { Link, useParams } from 'react-router-dom'
import { useGetOrgQuery } from '../services/api'
import { useAppSelector } from '../hooks/redux'
import { useEntitlements } from '../hooks/useEntitlements'
import { multiBranchEnabled } from '../lib/planLimits'
import { BranchInvitationsPanel } from '../components/org/BranchInvitationsPanel'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'

export function BranchDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>()
  const { user } = useAppSelector((state) => state.auth)
  const { entitlements } = useEntitlements()
  const multiBranch = multiBranchEnabled(entitlements)
  const { data, isLoading } = useGetOrgQuery(undefined, { skip: user?.role !== 'SUPPLIER' })

  const branch = data?.branches?.find((b) => (b as { id: string }).id === supplierId) as
    | { id: string; name: string }
    | undefined

  if (!multiBranch) {
    return (
      <PageShell data-testid="branch-detail-page">
        <PageHeader title="Branch" description="Multi-branch is not enabled on your plan." />
        <Link to="/app/settings?tab=subscription" className="text-sm underline inline-block">
          View subscription
        </Link>
      </PageShell>
    )
  }

  if (isLoading) {
    return (
      <PageShell data-testid="branch-detail-page">
        <p className="text-sm text-[var(--text-muted)]">Loading branch…</p>
      </PageShell>
    )
  }

  if (!branch || !supplierId) {
    return (
      <PageShell data-testid="branch-detail-page">
        <PageHeader title="Branch" description="Branch not found." />
        <Link to="/app/org" className="text-sm underline inline-block">
          Back to organization
        </Link>
      </PageShell>
    )
  }

  return (
    <PageShell data-testid="branch-detail-page">
      <PageHeader
        title={branch.name}
        description="Branch settings"
        breadcrumb={
          <Link to="/app/org" className="text-sm text-[var(--brand)] hover:underline">
            ← Organization
          </Link>
        }
      />
      <BranchInvitationsPanel supplierId={supplierId} branchName={branch.name} />
    </PageShell>
  )
}
