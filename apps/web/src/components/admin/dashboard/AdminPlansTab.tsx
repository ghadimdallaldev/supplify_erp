import { useMemo, useState } from 'react'
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
import { AdminSectionHeader } from '../adminUi'
import { AdminTabLoading, dedupeAdminPlans } from './adminDashboardShared'

export interface AdminPlansTabProps {
  active: boolean
}

export function AdminPlansTab({ active }: AdminPlansTabProps) {
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
      toast.success('Plan created')
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
        const message = parseErr instanceof Error ? parseErr.message : 'Invalid JSON'
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
    <div className="space-y-5">
      <div>
        <AdminSectionHeader
          title="Subscription Defaults"
          description="Platform-wide subscription settings"
        />
        <AdminPlatformSettingsPanel variant="compact" />
      </div>

      <div className="flex flex-wrap justify-between items-center gap-4">
        <h2 className="text-lg font-bold text-[var(--text)]">Subscription Plans</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-muted)]">Filter:</span>
          <Select
            value={plansTenantFilter ?? ''}
            onValueChange={(value) =>
              setPlansTenantFilter(value === '' ? undefined : (value as 'RESTAURANT' | 'SUPPLIER'))
            }
          >
            <SelectTrigger className="h-9 w-36">
              <option value="">All</option>
              <option value="RESTAURANT">Restaurant</option>
              <option value="SUPPLIER">Supplier</option>
            </SelectTrigger>
          </Select>
          <Dialog open={createPlanOpen} onOpenChange={setCreatePlanOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Plan</DialogTitle>
                <DialogDescription>
                  Add a subscription plan for restaurants or suppliers.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Code (e.g. free, silver)</Label>
                  <Input
                    value={createPlanForm.code}
                    onChange={(e) => setCreatePlanForm((s) => ({ ...s, code: e.target.value }))}
                    placeholder="free"
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    value={createPlanForm.name}
                    onChange={(e) => setCreatePlanForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="Free"
                  />
                </div>
                <div>
                  <Label>Tenant type</Label>
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
                      <option value="RESTAURANT">Restaurant</option>
                      <option value="SUPPLIER">Supplier</option>
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={createPlanForm.description}
                    onChange={(e) =>
                      setCreatePlanForm((s) => ({ ...s, description: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Price / month ($)</Label>
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
                    <Label>Price / year ($)</Label>
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
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreatePlan}
                    disabled={!createPlanForm.code.trim() || !createPlanForm.name.trim()}
                  >
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
                    {plan.tenant_type === 'RESTAURANT' ? 'Restaurant' : 'Supplier'}
                  </Badge>
                  {plan.code?.toLowerCase() === 'free' &&
                    platformSettings?.freeSandboxDays != null && (
                      <Badge variant="secondary" className="text-[10px]">
                        {platformSettings.freeSandboxDays}d trial
                      </Badge>
                    )}
                </div>
                <StatusBadge status={plan.is_active ? 'ACTIVE' : 'INACTIVE'} />
              </div>
              {plan.code && getPlanSubtitle(plan.code) ? (
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  {getPlanSubtitle(plan.code)}
                </p>
              ) : null}
              <div className="mb-3">
                <p className="text-lg font-bold text-[var(--text)]">
                  {formatPlanPrice(plan.price_per_month, '/mo')}
                </p>
                {plan.price_per_year != null && plan.price_per_year > 0 && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatPlanPrice(plan.price_per_year, '/yr')}
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
                  {plan.limits ? Object.keys(plan.limits).length : 0} limits ·{' '}
                  {plan.features ? Object.keys(plan.features).length : 0} features
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
                          {value === -1 ? '∞ unlimited' : String(value)}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">No limits defined</p>
                )}
                {(plan.limits && Object.keys(plan.limits).length > 3) ||
                (plan.features && Object.keys(plan.features).length > 0) ? (
                  <p className="text-[10px] text-[var(--text-muted)]">Edit plan for full details</p>
                ) : null}
              </div>
              {plan.updated_at && (
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Updated {new Date(plan.updated_at).toLocaleDateString()}
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
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editPlanModal?.open} onOpenChange={(open) => !open && setEditPlanModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>
              Update pricing, limits, features, trial days, and visibility for this plan.
            </DialogDescription>
          </DialogHeader>
          {editPlanModal?.plan && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={editPlanForm.name}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Plan name"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={editPlanForm.description}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Price / month ($)</Label>
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
                  <Label>Price / year ($)</Label>
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
                  <Label>Trial days</Label>
                  <Input
                    type="number"
                    min={editPlanModal.plan.code === 'free' ? 3 : 0}
                    max={editPlanModal.plan.code === 'free' ? 7 : undefined}
                    value={editPlanForm.trialDays}
                    onChange={(e) =>
                      setEditPlanForm((s) => ({
                        ...s,
                        trialDays: Number(e.target.value) || 0,
                      }))
                    }
                  />
                  {editPlanModal.plan.code === 'free' ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Free Trial catalog: trial days must be between 3 and 7.
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label>Display order</Label>
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
                <Label htmlFor="edit-plan-active">Active</Label>
              </div>
              <div>
                <Label>Limits (JSON)</Label>
                <Textarea
                  className="font-mono text-xs min-h-[140px]"
                  value={editPlanForm.limitsJson}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, limitsJson: e.target.value }))}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Use -1 for unlimited. Numbers stay numbers; booleans are not valid limit values.
                </p>
              </div>
              <div>
                <Label>Features (JSON)</Label>
                <Textarea
                  className="font-mono text-xs min-h-[180px]"
                  value={editPlanForm.featuresJson}
                  onChange={(e) => setEditPlanForm((s) => ({ ...s, featuresJson: e.target.value }))}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  true/false, tier strings (e.g. basic_kpis), or omit keys. Empty strings are
                  rejected.
                </p>
              </div>
              {editPlanJsonError ? (
                <p className="text-sm text-[var(--red)]">{editPlanJsonError}</p>
              ) : null}
              {editPlanModal.plan.code === 'enterprise' && editPlanForm.isActive ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">Enterprise activation</p>
                  <p className="mt-1 text-amber-900">
                    Enterprise is admin-assigned only. Enabling the catalog row requires explicit
                    confirmation.
                  </p>
                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={confirmEnterpriseActivation}
                      onChange={(e) => setConfirmEnterpriseActivation(e.target.checked)}
                      className="rounded border-[var(--app-border-mid)]"
                    />
                    <span>I confirm Enterprise catalog activation</span>
                  </label>
                </div>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditPlanModal(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEditPlan} disabled={!editPlanForm.name.trim()}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
