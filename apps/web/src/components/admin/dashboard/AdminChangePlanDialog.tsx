import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'
import { Label } from '../../ui/label'
import { Select, SelectTrigger } from '../../ui/select'
import {
  useGetAdminPlansQuery,
  usePreviewSubscriptionPlanChangeMutation,
  useUpdateAdminSubscriptionMutation,
} from '../../../services/api'
import { dedupeAdminPlans } from './adminDashboardShared'
import { formatLimitKeyLabel } from '../../../lib/adminLimitLabels'
import { FEATURE_KEY_LABELS } from '../../../lib/planComparison'

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
  const { t } = useTranslation('admin')
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

  const labelLimit = (key: string) =>
    t(`limitKeys.${key}`, { defaultValue: formatLimitKeyLabel(key) })
  const labelFeature = (key: string) =>
    t(`featureKeys.${key}`, {
      defaultValue: FEATURE_KEY_LABELS[key] ?? key.replace(/_/g, ' '),
    })

  const runPreviewPlanChange = async () => {
    if (!targetPlanId) return
    try {
      const result = await previewPlanChange({
        subscriptionId: modal.subId,
        targetPlanId,
      }).unwrap()
      setChangePlanPreview(result)
    } catch {
      toast.error(t('changePlanToasts.previewFailed'))
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
        t('changePlan.selectedPlanFallback')
      toast.success(
        result.appliedViaOrgBilling
          ? t('changePlan.updateSuccessOrgBilling', { plan: planLabel })
          : t('changePlan.updateSuccess', { plan: planLabel })
      )
      onClose()
    } catch (err: unknown) {
      const e = err as {
        data?: { error?: { name?: string; message?: string; details?: { willExceed?: unknown[] } } }
      }
      const details = e?.data?.error?.details
      if (e?.data?.error?.name === 'LIMIT_EXCEEDED' && details?.willExceed) {
        toast.error(t('changePlanToasts.usageExceeds'))
        setChangePlanPreview({
          willExceed: details.willExceed as Array<{
            limitKey: string
            usage: number
            limit: number
          }>,
          featureDiff: { enabled: [], disabled: [] },
          recommendedActions: [t('changePlan.forceHint')],
        })
      } else {
        toast.error(e?.data?.error?.message || t('changePlan.updateFailed'))
      }
    }
  }

  const tenantTypeLabel =
    modal.tenantType === 'SUPPLIER' ? t('common.supplier') : t('common.restaurant')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('changePlan.title', { name: modal.tenantName })}</DialogTitle>
          <DialogDescription>{t('changePlan.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>{t('changePlan.targetPlan')}</Label>
            <Select value={targetPlanId} onValueChange={(value) => setTargetPlanId(value)}>
              <SelectTrigger className="mt-1 w-full" disabled={changePlanPlansLoading}>
                <option value="">
                  {changePlanPlansLoading
                    ? t('changePlan.loadingPlans')
                    : t('changePlan.selectPlan')}
                </option>
                {changePlanPlanOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </SelectTrigger>
            </Select>
            {!changePlanPlansLoading && changePlanPlanOptions.length === 0 && (
              <p className="mt-1 text-sm text-[var(--amber)]">
                {t('changePlan.noPlansForTenant', { tenantType: tenantTypeLabel.toLowerCase() })}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={runPreviewPlanChange}
            disabled={!targetPlanId}
          >
            {t('changePlan.previewImpact')}
          </Button>
          {changePlanPreview && (
            <div className="space-y-3 rounded-lg border border-[var(--app-border)] p-4 text-sm">
              {!hasPreviewContent(changePlanPreview) && (
                <p className="text-[var(--text-muted)]">{t('changePlan.noImpact')}</p>
              )}
              {(changePlanPreview.willExceed?.length ?? 0) > 0 && (
                <div>
                  <p className="font-semibold text-[var(--amber)]">
                    {t('changePlan.usageExceedsTitle')}
                  </p>
                  <ul className="mt-1 list-disc pl-4">
                    {changePlanPreview.willExceed!.map((e) => (
                      <li key={e.limitKey}>
                        {t('changePlan.limitEntry', {
                          label: labelLimit(e.limitKey),
                          usage: e.usage,
                          limit: e.limit,
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {((changePlanPreview.featureDiff?.enabled?.length ?? 0) > 0 ||
                (changePlanPreview.featureDiff?.disabled?.length ?? 0) > 0) && (
                <div>
                  <p className="font-semibold text-[var(--text-mid)]">
                    {t('changePlan.featureChangesTitle')}
                  </p>
                  {(changePlanPreview.featureDiff?.enabled?.length ?? 0) > 0 && (
                    <p className="text-[var(--mint)]">
                      {t('changePlan.featuresEnabled', {
                        features: changePlanPreview
                          .featureDiff!.enabled!.map(labelFeature)
                          .join(', '),
                      })}
                    </p>
                  )}
                  {(changePlanPreview.featureDiff?.disabled?.length ?? 0) > 0 && (
                    <p className="text-[var(--amber)]">
                      {t('changePlan.featuresDisabled', {
                        features: changePlanPreview
                          .featureDiff!.disabled!.map(labelFeature)
                          .join(', '),
                      })}
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
                  <span>{t('changePlan.forceChange')}</span>
                </label>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={applyPlanChange} disabled={!targetPlanId}>
              {t('changePlan.applyChange')}
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
      tenantName: sub.tenant_name || '',
      targetPlanId: '',
    })
  }, [])

  const ChangePlanDialog = changePlanModal ? (
    <AdminChangePlanDialogContent
      key={changePlanModal.subId}
      modal={changePlanModal}
      onClose={() => setChangePlanModal(null)}
    />
  ) : null

  return { openChangePlan, ChangePlanDialog }
}
