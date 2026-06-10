import { useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'
import { Label } from '../../ui/label'
import {
  useGetAdminPlansQuery,
  usePreviewSubscriptionPlanChangeMutation,
  useUpdateAdminSubscriptionMutation,
} from '../../../services/api'
import { dedupeAdminPlans } from './adminDashboardShared'

export type AdminChangePlanTarget = {
  id: string
  tenant_type: 'RESTAURANT' | 'SUPPLIER'
  tenant_name?: string
}

export type OpenChangePlanFn = (target: AdminChangePlanTarget) => void

type ChangePlanPreview = {
  willExceed: Array<{ limitKey: string; usage: number; limit: number }>
  featureDiff: { enabled: string[]; disabled: string[] }
  recommendedActions: string[]
}

type ChangePlanModalState = {
  subId: string
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  tenantName: string
  targetPlanId: string
}

function hasPreviewContent(preview: ChangePlanPreview | null) {
  return (
    preview &&
    (preview.willExceed?.length > 0 ||
      preview.featureDiff?.enabled?.length > 0 ||
      preview.featureDiff?.disabled?.length > 0 ||
      (preview.recommendedActions?.length ?? 0) > 0)
  )
}

function AdminChangePlanDialogContent({
  modal,
  onClose,
}: {
  modal: ChangePlanModalState
  onClose: () => void
}) {
  const [targetPlanId, setTargetPlanId] = useState(modal.targetPlanId)
  const [changePlanPreview, setChangePlanPreview] = useState<ChangePlanPreview | null>(null)
  const [changePlanForce, setChangePlanForce] = useState(false)

  const { data: changePlanPlansData, isLoading: changePlanPlansLoading } = useGetAdminPlansQuery(
    { tenant_type: modal.tenantType },
    { skip: false }
  )
  const [previewPlanChange] = usePreviewSubscriptionPlanChangeMutation()
  const [updateSubscription] = useUpdateAdminSubscriptionMutation()

  const changePlanPlanOptions = useMemo(
    () =>
      dedupeAdminPlans(changePlanPlansData?.plans).filter(
        (p) => (p.tenant_type || 'RESTAURANT') === modal.tenantType
      ),
    [changePlanPlansData?.plans, modal.tenantType]
  )

  const runPreviewPlanChange = async () => {
    if (!targetPlanId) return
    try {
      const result = await previewPlanChange({
        subscriptionId: modal.subId,
        targetPlanId,
      }).unwrap()
      setChangePlanPreview(result)
    } catch {
      toast.error('Failed to load preview')
    }
  }

  const applyPlanChange = async () => {
    if (!targetPlanId) return
    const selectedPlan = changePlanPlanOptions.find((p) => p.id === targetPlanId)
    try {
      const result = await updateSubscription({
        id: modal.subId,
        data: {
          planId: targetPlanId,
          allowExceedance: changePlanForce,
          ...(changePlanForce
            ? { force: true, reason: 'Admin plan change (usage exceeds target limits)' }
            : {}),
        },
      }).unwrap()
      const planLabel =
        selectedPlan?.name ||
        result.subscription?.plan_name ||
        result.subscription?.plan_code ||
        'selected plan'
      toast.success(
        result.appliedViaOrgBilling
          ? `Plan updated to ${planLabel} (applied to organization billing subscription)`
          : `Plan updated to ${planLabel}`
      )
      onClose()
    } catch (err: unknown) {
      const e = err as {
        data?: { error?: { name?: string; message?: string; details?: { willExceed?: unknown[] } } }
      }
      const details = e?.data?.error?.details
      if (e?.data?.error?.name === 'LIMIT_EXCEEDED' && details?.willExceed) {
        toast.error('Usage exceeds target plan. Check preview or force change.')
        setChangePlanPreview({
          willExceed: details.willExceed as Array<{
            limitKey: string
            usage: number
            limit: number
          }>,
          featureDiff: { enabled: [], disabled: [] },
          recommendedActions: ['Pass allowExceedance: true to force change.'],
        })
      } else {
        toast.error(e?.data?.error?.message || 'Failed to update plan')
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change plan — {modal.tenantName}</DialogTitle>
          <DialogDescription>
            Select a target plan and preview limits or feature changes before applying.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Target plan</Label>
            <select
              className="w-full rounded-md border border-[var(--app-border-mid)] bg-[var(--app-surface)] px-3 py-2 mt-1 text-[var(--text-primary)]"
              value={targetPlanId}
              disabled={changePlanPlansLoading}
              onChange={(e) => setTargetPlanId(e.target.value)}
            >
              <option value="">{changePlanPlansLoading ? 'Loading plans…' : 'Select plan'}</option>
              {changePlanPlanOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            {!changePlanPlansLoading && changePlanPlanOptions.length === 0 && (
              <p className="mt-1 text-sm text-amber-600">
                No plans found for {modal.tenantType.toLowerCase()} tenants. Create one on the Plans
                tab.
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={runPreviewPlanChange}
            disabled={!targetPlanId}
          >
            Preview impact
          </Button>
          {changePlanPreview && (
            <div className="border rounded-lg p-4 space-y-3 text-sm">
              {!hasPreviewContent(changePlanPreview) && (
                <p className="text-[var(--text-muted)]">
                  No impact: usage is within target plan limits; no feature changes.
                </p>
              )}
              {(changePlanPreview.willExceed?.length ?? 0) > 0 && (
                <div>
                  <p className="font-semibold text-amber-700">Usage would exceed limits:</p>
                  <ul className="list-disc pl-4 mt-1">
                    {changePlanPreview.willExceed!.map((e) => (
                      <li key={e.limitKey}>
                        {e.limitKey}: {e.usage} &gt; {e.limit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {((changePlanPreview.featureDiff?.enabled?.length ?? 0) > 0 ||
                (changePlanPreview.featureDiff?.disabled?.length ?? 0) > 0) && (
                <div>
                  <p className="font-semibold text-[var(--text-mid)]">Feature changes:</p>
                  {(changePlanPreview.featureDiff?.enabled?.length ?? 0) > 0 && (
                    <p className="text-[var(--mint)]">
                      Enabled: {changePlanPreview.featureDiff!.enabled!.join(', ')}
                    </p>
                  )}
                  {(changePlanPreview.featureDiff?.disabled?.length ?? 0) > 0 && (
                    <p className="text-amber-600">
                      Disabled: {changePlanPreview.featureDiff!.disabled!.join(', ')}
                    </p>
                  )}
                </div>
              )}
              {(changePlanPreview.recommendedActions?.length ?? 0) > 0 && (
                <p className="text-[var(--text-muted)]">
                  {changePlanPreview.recommendedActions!.join(' ')}
                </p>
              )}
              {(changePlanPreview.willExceed?.length ?? 0) > 0 && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={changePlanForce}
                    onChange={(e) => setChangePlanForce(e.target.checked)}
                  />
                  <span>Force change anyway (allow exceedance)</span>
                </label>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={applyPlanChange} disabled={!targetPlanId}>
              Apply change
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Self-contained change-plan dialog with `openChangePlan` callback for tenant/subscription tabs. */
export function useAdminChangePlanDialog() {
  const [changePlanModal, setChangePlanModal] = useState<ChangePlanModalState | null>(null)

  const openChangePlan: OpenChangePlanFn = useCallback((sub) => {
    setChangePlanModal({
      subId: sub.id,
      tenantType: sub.tenant_type,
      tenantName: sub.tenant_name || 'Tenant',
      targetPlanId: '',
    })
  }, [])

  const closeChangePlan = useCallback(() => {
    setChangePlanModal(null)
  }, [])

  const ChangePlanDialog = changePlanModal ? (
    <AdminChangePlanDialogContent modal={changePlanModal} onClose={closeChangePlan} />
  ) : null

  return { openChangePlan, ChangePlanDialog, closeChangePlan }
}
