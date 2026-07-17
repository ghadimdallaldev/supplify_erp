import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { StatusBadge } from '../../ui/status-badge'
import { Select, SelectTrigger } from '../../ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../ui/dialog'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import {
  useGetAdminPlansQuery,
  useGetAdminPlatformSettingsQuery,
  useUpdateAdminPlanMutation,
  useCreateAdminPlanMutation,
} from '../../../services/api'
import { Plus, Edit } from 'lucide-react'
import { toast } from 'sonner'
import {
  notifyAdminPlanSaveError,
  notifyAdminPlanSaveSuccess,
} from '../../../lib/adminPlanSaveFeedback'
import { formatPlanPrice } from '../../../lib/formatPlanPrice'
import type { SubscriptionPlan } from '../../../types'
import { getPlanSubtitle, getLimitLabel } from '../../../lib/planComparison'
import {
  parsePlanFeaturesJson,
  parsePlanLimitsJson,
  stringifyPlanJson,
} from '../../../lib/adminPlanJsonParse'
import { AdminPlatformSettingsPanel } from '../AdminPlatformSettingsPanel'
import { AdminGrowthSettingsPanel } from '../AdminGrowthSettingsPanel'
import { AdminSectionHeader } from '../adminUi'
import { AdminTabLoading, dedupeAdminPlans } from './adminDashboardShared'

export interface AdminPlansTabProps {
  active: boolean
}

export function AdminPlansTab({ active }: AdminPlansTabProps) {
  const { t } = useTranslation('admin')
  const [plansTenantFilter, setPlansTenantFilter] = useState<'RESTAURANT' | 'SUPPLIER' | undefined>(
    undefined
  )

  const { data: platformSettings } = useGetAdminPlatformSettingsQuery(undefined, {
    skip: !active,
  })
  const { data: plansData, isLoading: plansLoading } = useGetAdminPlansQuery(
    active && plansTenantFilter ? { tenant_type: plansTenantFilter } : {},
    { skip: !active }
  )

  const plans = useMemo(() => dedupeAdminPlans(plansData?.plans), [plansData?.plans])

  const [createPlan] = useCreateAdminPlanMutation()
  const [updatePlan] = useUpdateAdminPlanMutation()

  const [editPlanModal, setEditPlanModal] = useState<{
    open: boolean
    plan: SubscriptionPlan
  } | null>(null)
  const [editPlanForm, setEditPlanForm] = useState({
    name: '',
    description: '',
    pricePerMonth: 0,
    pricePerYear: 0,
    trialDays: 0,
    displayOrder: 0,
    isActive: true,
    limitsJson: '{}',
    featuresJson: '{}',
  })
  const [editPlanJsonError, setEditPlanJsonError] = useState<string | null>(null)
  const [confirmEnterpriseActivation, setConfirmEnterpriseActivation] = useState(false)
  const [createPlanOpen, setCreatePlanOpen] = useState(false)
  const [createPlanForm, setCreatePlanForm] = useState({
    code: '',
    name: '',
    tenantType: 'RESTAURANT' as 'RESTAURANT' | 'SUPPLIER',
    description: '',
    pricePerMonth: 0,
    pricePerYear: 0,
    trialDays: 0,
    displayOrder: 0,
    isActive: true,
  })

  const handleCreatePlan = async () => {
    try {
      await createPlan({
        ...createPlanForm,
        limits: {},
        features: {},
      }).unwrap()
      toast.success(t('plansToasts.created'))
      setCreatePlanOpen(false)
      setCreatePlanForm({
        code: '',
        name: '',
        tenantType: 'RESTAURANT',
        description: '',
        pricePerMonth: 0,
        pricePerYear: 0,
        trialDays: 0,
        displayOrder: 0,
        isActive: true,
      })
    } catch (e: unknown) {
      notifyAdminPlanSaveError(e)
    }
  }

  const openEditPlanModal = (plan: SubscriptionPlan) => {
    setConfirmEnterpriseActivation(false)
    setEditPlanModal({ open: true, plan })
    setEditPlanForm({
      name: plan.name,
      description: plan.description ?? '',
      pricePerMonth: plan.price_per_month ?? 0,
      pricePerYear: plan.price_per_year ?? 0,
      trialDays: plan.trial_days ?? 0,
      displayOrder: plan.display_order ?? 0,
      isActive: plan.is_active ?? true,
      limitsJson: stringifyPlanJson(plan.limits as Record<string, unknown>),
      featuresJson: stringifyPlanJson(plan.features as Record<string, unknown>),
    })
    setEditPlanJsonError(null)
  }

  const handleSaveEditPlan = async () => {
    if (!editPlanModal?.plan) return
    const plan = editPlanModal.plan
    const isEnterprise = (plan.code || '').toLowerCase() === 'enterprise'
    try {
      let limits: Record<string, unknown>
      let features: Record<string, unknown>
      try {
        limits = parsePlanLimitsJson(editPlanForm.limitsJson)
        features = parsePlanFeaturesJson(editPlanForm.featuresJson)
        setEditPlanJsonError(null)
      } catch (parseErr) {
        const message = parseErr instanceof Error ? parseErr.message : t('plans.invalidJson')
        setEditPlanJsonError(message)
        toast.error(message)
        return
      }
      const payload: Record<string, unknown> = {
        ...editPlanForm,
        limits,
        features,
      }
      delete payload.limitsJson
      delete payload.featuresJson
      if (isEnterprise && editPlanForm.isActive) {
        payload.confirmEnterpriseActivation = confirmEnterpriseActivation
      }
      const result = await updatePlan({
        id: plan.id,
        data: payload,
      }).unwrap()
      notifyAdminPlanSaveSuccess(result.plan.name || plan.name, result.validationWarnings)
      setEditPlanModal(null)
      setConfirmEnterpriseActivation(false)
    } catch (e: unknown) {
      notifyAdminPlanSaveError(e)
    }
  }

  if (!active) {
    return null
  }

  return (
    <>
      <div>
        <AdminSectionHeader
          title={t('plans.subscriptionDefaultsTitle')}
          description={t('plans.subscriptionDefaultsDescription')}
        />
        <AdminPlatformSettingsPanel variant="compact" />
        <div className="mt-4">
          <AdminGrowthSettingsPanel />
        </div>
      </div>

      <div>
        <AdminSectionHeader
          title={t('plans.subscriptionPlansTitle')}
          action={
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">{t('plans.filterLabel')}</span>
              <Select
                value={plansTenantFilter ?? ''}
                onValueChange={(value) =>
                  setPlansTenantFilter(
                    value === '' ? undefined : (value as 'RESTAURANT' | 'SUPPLIER')
                  )
                }
              >
                <SelectTrigger className="h-9 w-36">
                  <option value="">{t('common.all')}</option>
                  <option value="RESTAURANT">{t('common.restaurant')}</option>
                  <option value="SUPPLIER">{t('common.supplier')}</option>
                </SelectTrigger>
              </Select>
              <Dialog open={createPlanOpen} onOpenChange={setCreatePlanOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('plans.createPlanButton')}
                  </Button>
                </DialogTrigger>
                <DialogContent size="sm">
                  <DialogHeader>
                    <DialogTitle>{t('plans.createPlanTitle')}</DialogTitle>
                    <DialogDescription>{t('plans.createPlanDescription')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>{t('plans.codeLabel')}</Label>
                      <Input
                        value={createPlanForm.code}
                        onChange={(e) => setCreatePlanForm((s) => ({ ...s, code: e.target.value }))}
                        placeholder={t('plans.codePlaceholder')}
                      />
                    </div>
                    <div>
                      <Label>{t('plans.nameLabel')}</Label>
                      <Input
                        value={createPlanForm.name}
                        onChange={(e) => setCreatePlanForm((s) => ({ ...s, name: e.target.value }))}
                        placeholder={t('plans.namePlaceholder')}
                      />
                    </div>
                    <div>
                      <Label>{t('plans.tenantTypeLabel')}</Label>
                      <Select
                        value={createPlanForm.tenantType}
                        onValueChange={(value) =>
                          setCreatePlanForm((s) => ({
                            ...s,
                            tenantType: value as 'RESTAURANT' | 'SUPPLIER',
                          }))
                        }
                      >
                        <SelectTrigger>
                          <option value="RESTAURANT">{t('common.restaurant')}</option>
                          <option value="SUPPLIER">{t('common.supplier')}</option>
                        </SelectTrigger>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('plans.descriptionLabel')}</Label>
                      <Input
                        value={createPlanForm.description}
                        onChange={(e) =>
                          setCreatePlanForm((s) => ({ ...s, description: e.target.value }))
                        }
                        placeholder={t('common.optional')}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>{t('plans.priceMonthLabel')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createPlanForm.pricePerMonth}
                          onChange={(e) =>
                            setCreatePlanForm((s) => ({
                              ...s,
                              pricePerMonth: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>{t('plans.priceYearLabel')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createPlanForm.pricePerYear}
                          onChange={(e) =>
                            setCreatePlanForm((s) => ({
                              ...s,
                              pricePerYear: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setCreatePlanOpen(false)}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        onClick={handleCreatePlan}
                        disabled={!createPlanForm.code.trim() || !createPlanForm.name.trim()}
                      >
                        {t('plans.createPlanButton')}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          }
        />

        {plansLoading ? (
          <AdminTabLoading />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card key={plan.id} className="p-4 transition-shadow hover:shadow-md">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-base font-bold text-[var(--text)]">{plan.name}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {plan.tenant_type === 'RESTAURANT'
                        ? t('common.restaurant')
                        : t('common.supplier')}
                    </Badge>
                    {plan.code?.toLowerCase() === 'free' &&
                      platformSettings?.freeSandboxDays != null && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('plans.trialDaysBadge', { count: platformSettings.freeSandboxDays })}
                        </Badge>
                      )}
                  </div>
                  <StatusBadge status={plan.is_active ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                {plan.code && getPlanSubtitle(plan.code, plan.name) ? (
                  <p className="mb-2 text-xs text-[var(--text-muted)]">
                    {getPlanSubtitle(plan.code, plan.name)}
                  </p>
                ) : null}
                <div className="mb-3">
                  <p className="text-lg font-bold text-[var(--text)]">
                    {formatPlanPrice(plan.price_per_month, t('plans.monthSuffix'))}
                  </p>
                  {plan.price_per_year != null && plan.price_per_year > 0 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatPlanPrice(plan.price_per_year, t('plans.yearSuffix'))}
                    </p>
                  )}
                </div>
                {plan.description && (
                  <p className="mb-3 line-clamp-2 text-xs text-[var(--text-muted)]">
                    {plan.description}
                  </p>
                )}
                <div className="mb-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('plans.limitsFeaturesCount', {
                      limits: plan.limits ? Object.keys(plan.limits).length : 0,
                      features: plan.features ? Object.keys(plan.features).length : 0,
                    })}
                  </p>
                  {plan.limits && Object.keys(plan.limits).length > 0 ? (
                    Object.entries(plan.limits)
                      .slice(0, 3)
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-[var(--text-muted)]">{getLimitLabel(key)}</span>
                          <span
                            className={`font-semibold ${value === -1 ? 'text-[var(--mint)]' : 'text-[var(--text)]'}`}
                          >
                            {value === -1 ? t('plans.unlimitedValueLabel') : String(value)}
                          </span>
                        </div>
                      ))
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">{t('plans.noLimitsDefined')}</p>
                  )}
                  {(plan.limits && Object.keys(plan.limits).length > 3) ||
                  (plan.features && Object.keys(plan.features).length > 0) ? (
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {t('plans.editForFullDetails')}
                    </p>
                  ) : null}
                </div>
                {plan.updated_at && (
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    {t('common.updatedAt', {
                      time: new Date(plan.updated_at).toLocaleDateString(),
                    })}
                  </p>
                )}
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full whitespace-normal"
                    onClick={() => openEditPlanModal(plan)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    {t('plans.editButton')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editPlanModal?.open} onOpenChange={(open) => !open && setEditPlanModal(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t('plans.editPlanTitle')}</DialogTitle>
            <DialogDescription>{t('plans.editPlanDescription')}</DialogDescription>
          </DialogHeader>
          {editPlanModal?.plan && (
            <div className="space-y-4 py-4">
              <div>
                <Label>{t('plans.nameLabel')}</Label>
                <Input
                  value={editPlanForm.name}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder={t('plans.planNamePlaceholder')}
                />
              </div>
              <div>
                <Label>{t('plans.descriptionLabel')}</Label>
                <Input
                  value={editPlanForm.description}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, description: e.target.value }))}
                  placeholder={t('common.optional')}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t('plans.priceMonthLabel')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editPlanForm.pricePerMonth}
                    onChange={(e) =>
                      setEditPlanForm((s) => ({
                        ...s,
                        pricePerMonth: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>{t('plans.priceYearLabel')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editPlanForm.pricePerYear}
                    onChange={(e) =>
                      setEditPlanForm((s) => ({
                        ...s,
                        pricePerYear: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t('plans.trialDaysLabel')}</Label>
                  <Input
                    type="number"
                    min={editPlanModal.plan.code === 'free' ? 7 : 0}
                    max={editPlanModal.plan.code === 'free' ? 90 : undefined}
                    value={editPlanForm.trialDays}
                    onChange={(e) =>
                      setEditPlanForm((s) => ({
                        ...s,
                        trialDays: Number(e.target.value) || 0,
                      }))
                    }
                  />
                  {editPlanModal.plan.code === 'free' ? (
                    <p className="mt-1 text-xs text-amber-800">{t('plans.freeTrialBoundsHelp')}</p>
                  ) : null}
                </div>
                <div>
                  <Label>{t('plans.displayOrderLabel')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editPlanForm.displayOrder}
                    onChange={(e) =>
                      setEditPlanForm((s) => ({
                        ...s,
                        displayOrder: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-plan-active"
                  checked={editPlanForm.isActive}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, isActive: e.target.checked }))}
                  className="rounded border-[var(--app-border-mid)]"
                />
                <Label htmlFor="edit-plan-active">{t('plans.activeLabel')}</Label>
              </div>
              <div>
                <Label>{t('plans.limitsJsonLabel')}</Label>
                <Textarea
                  className="font-mono text-xs min-h-[140px]"
                  value={editPlanForm.limitsJson}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, limitsJson: e.target.value }))}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">{t('plans.limitsJsonHelp')}</p>
              </div>
              <div>
                <Label>{t('plans.featuresJsonLabel')}</Label>
                <Textarea
                  className="font-mono text-xs min-h-[180px]"
                  value={editPlanForm.featuresJson}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, featuresJson: e.target.value }))}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('plans.featuresJsonHelp')}
                </p>
              </div>
              {editPlanJsonError ? (
                <p className="text-sm text-[var(--red)]">{editPlanJsonError}</p>
              ) : null}
              {editPlanModal.plan.code === 'enterprise' && editPlanForm.isActive ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">{t('plans.enterpriseActivationTitle')}</p>
                  <p className="mt-1 text-amber-900">{t('plans.enterpriseActivationMessage')}</p>
                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={confirmEnterpriseActivation}
                      onChange={(e) => setConfirmEnterpriseActivation(e.target.checked)}
                      className="rounded border-[var(--app-border-mid)]"
                    />
                    <span>{t('plans.enterpriseConfirmLabel')}</span>
                  </label>
                </div>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditPlanModal(null)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSaveEditPlan} disabled={!editPlanForm.name.trim()}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
