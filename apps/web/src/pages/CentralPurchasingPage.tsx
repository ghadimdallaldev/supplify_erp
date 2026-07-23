import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  useCreateCentralPurchasingDraftMutation,
  useGetCentralPurchasingDraftsQuery,
  useGetRestaurantOrgBranchesQuery,
  useSubmitCentralPurchasingDraftsMutation,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { Button } from '../components/ui/button'
import { RequirePermission } from '../components/RequirePermission'

/**
 * Foundation UI only — per Branch Account drafts, separate submit orders.
 * Full central purchasing workflow is not complete.
 */
export function CentralPurchasingPage() {
  const { entitlements } = useEntitlements()
  const multiBranch =
    entitlements?.features?.multi_branch ?? entitlements?.planFeatures?.multi_branch
  const enabled = multiBranch === 'central_purchasing'
  const { data: branchesData } = useGetRestaurantOrgBranchesQuery(undefined, { skip: !enabled })
  const { data: draftsData, refetch } = useGetCentralPurchasingDraftsQuery(undefined, {
    skip: !enabled,
  })
  const [createDraft] = useCreateCentralPurchasingDraftMutation()
  const [submitDrafts, { isLoading: submitting }] = useSubmitCentralPurchasingDraftsMutation()
  const [selected, setSelected] = useState<string[]>([])

  const branches = (branchesData?.branches ?? []).filter(
    (b: { is_branch_active?: boolean }) => b.is_branch_active !== false
  )
  const drafts = draftsData?.drafts ?? []

  useEffect(() => {
    setSelected(
      drafts.map((d: { destination_branch_account_id?: string }) =>
        String(d.destination_branch_account_id)
      )
    )
  }, [drafts])

  if (!enabled) {
    return (
      <RequirePermission permission="SETTINGS_VIEW" title="central-purchasing">
        <PageShell>
          <PageHeader
            title="Central purchasing"
            description="Available on Restaurant Scale (central_purchasing). Foundation drafts only — full workflow is not complete."
          />
          <Link to="/app/org" className="text-sm underline">
            Back to organization
          </Link>
        </PageShell>
      </RequirePermission>
    )
  }

  const handleOpenDraft = async (restaurantId: string) => {
    try {
      await createDraft({ destination_restaurant_id: restaurantId }).unwrap()
      refetch()
      toast.success('Draft ready for this Branch Account')
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to open draft'
      toast.error(msg)
    }
  }

  const handleSubmit = async () => {
    if (!selected.length) {
      toast.error('Select at least one destination Branch Account')
      return
    }
    const withLines = selected.filter((id) => {
      const draft = drafts.find(
        (d: { destination_branch_account_id?: string; line_count?: number }) =>
          String(d.destination_branch_account_id) === id
      )
      return Number(draft?.line_count || 0) > 0
    })
    if (!withLines.length) {
      toast.error(
        'Selected drafts have no line items yet. Foundation UI cannot edit lines — use the API PATCH or wait for the full workflow.'
      )
      return
    }
    try {
      const result = await submitDrafts({ destination_restaurant_ids: withLines }).unwrap()
      refetch()
      if (result.partialFailure) {
        toast.warning(
          `Partial submit: ${result.summary.succeeded} succeeded, ${result.summary.failed} failed`
        )
      } else if (result.summary.failed) {
        toast.error('Submit failed for all selected Branch Accounts')
      } else {
        toast.success(`Submitted ${result.summary.succeeded} order(s)`)
      }
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to submit'
      toast.error(msg)
    }
  }

  return (
    <RequirePermission permission="SETTINGS_VIEW" title="central-purchasing">
      <PageShell data-testid="central-purchasing-page">
        <PageHeader
          title="Central purchasing"
          description="Foundation: one draft cart per destination Branch Account. Orders are created separately per Branch Account — not organization-owned. Full workflow is not complete."
          actions={
            <Link to="/app/org" className="text-sm underline">
              Back to organization
            </Link>
          }
        />

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-6">
          This is a foundation surface. Line-item editing and supplier catalog browsing will expand
          later; submit creates separate PENDING orders per destination.
        </div>

        <h2 className="text-sm font-medium mb-3">Branch Accounts</h2>
        <div className="space-y-2 mb-8">
          {branches.map((branch: Record<string, unknown>) => {
            const id = String(branch.id)
            const draft = drafts.find(
              (d: { destination_branch_account_id?: string }) =>
                String(d.destination_branch_account_id) === id
            )
            return (
              <div
                key={id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border rounded-lg p-3"
              >
                <div>
                  <p className="font-medium">{String(branch.name)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {draft
                      ? `Open draft · ${Number(draft.line_count || 0)} line(s)`
                      : 'No open draft'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={(e) => {
                        setSelected((prev) =>
                          e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)
                        )
                      }}
                    />
                    Include in submit
                  </label>
                  <Button variant="outline" size="sm" onClick={() => handleOpenDraft(id)}>
                    {draft ? 'Open draft' : 'Create draft'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <Button onClick={handleSubmit} disabled={submitting || !selected.length}>
          {submitting ? 'Submitting…' : 'Submit selected drafts as separate orders'}
        </Button>
      </PageShell>
    </RequirePermission>
  )
}
