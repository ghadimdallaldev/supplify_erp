import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { StatusBadge } from '../../components/ui/status-badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PageHeader } from '../../components/ui/page-header'
import { Select, SelectTrigger } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { useGetEntitlementsQuery } from '../../services/api'
import { getSupplierPromotionGate, isEntitlementFeatureEnabled } from '../../lib/planLimits'
import { LIMIT_UPGRADE_COPY } from '../../lib/upgradeCopy'
import {
  useGetPromotionsQuery,
  useCreatePromotionMutation,
  usePausePromotionMutation,
  useResumePromotionMutation,
  useDeletePromotionMutation,
} from '../../services/api'
import { DealAnalyticsDialog } from '../../components/deals/DealAnalyticsDialog'
import { SubmitDealDialog } from '../../components/deals/SubmitDealDialog'
import { DealBoostPackagePicker } from '../../components/deals/DealBoostPackagePicker'
import { DealBoostStatus, type BoostStatus } from '../../components/deals/DealBoostStatus'
import {
  DealTargetingPickers,
  type DealTargetingValue,
} from '../../components/deals/DealTargetingPickers'
import { toast } from 'sonner'
import { RequirePermission } from '../../components/RequirePermission'
import { FeatureLockedCard } from '../../components/FeatureLockedCard'
import { DealsPerformanceSummary } from '../../components/promotions/DealsPerformanceSummary'
import { useWorkspaceRole } from '../../hooks/useWorkspaceRole'
import { Plus, BarChart3, Send } from 'lucide-react'
import { EmptyState } from '../../components/ui/empty-state'
import {
  COUPON_FIELD_HELPER,
  DEAL_SCHEDULE_ENDS_HELPER,
  DEAL_SCHEDULE_SECTION_HELPER,
  SUPPLIER_CTA_TYPES,
  SUPPLIER_DEAL_TYPES,
  SUPPLIER_EMPTY_STATE,
  formatDealStatusLabel,
  formatDealTypeLabel,
  getCtaHelperText,
  getDealTypeHelperText,
} from '../../lib/dealDisplayLabels'

const STORE_WIDE_DEAL_PRESETS = [
  {
    label: '10% store-wide',
    name: 'Store-wide 10% off',
    type: 'percentage_discount' as const,
    discountValue: '10',
  },
  {
    label: '15% store-wide',
    name: 'Store-wide 15% off',
    type: 'percentage_discount' as const,
    discountValue: '15',
  },
  {
    label: '$25 off store-wide',
    name: 'Store-wide $25 off',
    type: 'fixed_discount' as const,
    discountValue: '25',
  },
] as const

export function PromotionsPage() {
  const { persona } = useWorkspaceRole()
  const copy = persona.promotionsCopy
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const promotionsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'promotions'
  )
  const promotionGate = getSupplierPromotionGate(entitlementsData?.entitlements)
  const promotionCopy = LIMIT_UPGRADE_COPY.promotions

  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [analyticsId, setAnalyticsId] = useState<string | null>(null)
  const [submitDealId, setSubmitDealId] = useState<string | null>(null)
  const [submitDealName, setSubmitDealName] = useState('')
  const [createPricingKey, setCreatePricingKey] = useState('')
  const [form, setForm] = useState({
    name: '',
    type: 'percentage_discount' as (typeof SUPPLIER_DEAL_TYPES)[number],
    discountValue: '10',
    minOrderAmount: '',
    couponCode: '',
    ctaType: 'order_now',
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: '',
  })
  const [targeting, setTargeting] = useState<DealTargetingValue>({
    appliesTo: 'all',
    productIds: [],
    categoryIds: [],
  })

  const { data, isLoading, error, refetch } = useGetPromotionsQuery(
    statusFilter ? { status: statusFilter } : undefined
  )
  const [createPromotion, { isLoading: creating }] = useCreatePromotionMutation()
  const [pausePromotion] = usePausePromotionMutation()
  const [resumePromotion] = useResumePromotionMutation()
  const [deletePromotion] = useDeletePromotionMutation()

  const promotions = data?.promotions || []

  if (!promotionsEnabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="Deals" />
        <FeatureLockedCard
          featureKey="promotions"
          featureName="Deals"
          currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
        />
      </div>
    )
  }

  const buildCreatePayload = (submitForReview: boolean) => ({
    name: form.name,
    type: form.type,
    discountValue: Number(form.discountValue) || 0,
    minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
    couponCode: form.couponCode || null,
    ctaType: form.ctaType,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    appliesTo: targeting.appliesTo,
    productIds: targeting.appliesTo === 'specific_products' ? targeting.productIds : undefined,
    categoryIds: targeting.appliesTo === 'specific_categories' ? targeting.categoryIds : undefined,
    submitForReview,
    pricingKey: submitForReview ? createPricingKey : undefined,
  })

  const validateForm = () => {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return false
    }
    if (targeting.appliesTo === 'specific_products' && targeting.productIds.length === 0) {
      toast.error('Select at least one product')
      return false
    }
    if (targeting.appliesTo === 'specific_categories' && targeting.categoryIds.length === 0) {
      toast.error('Select at least one category')
      return false
    }
    return true
  }

  const applyStoreWidePreset = (preset: (typeof STORE_WIDE_DEAL_PRESETS)[number]) => {
    setForm((f) => ({
      ...f,
      name: preset.name,
      type: preset.type,
      discountValue: preset.discountValue,
    }))
    setTargeting({ appliesTo: 'all', productIds: [], categoryIds: [] })
  }

  const handleSaveDraft = async () => {
    if (!validateForm()) return
    try {
      await createPromotion(buildCreatePayload(false)).unwrap()
      toast.success('Draft saved')
      setShowCreate(false)
      setCreatePricingKey('')
      setTargeting({ appliesTo: 'all', productIds: [], categoryIds: [] })
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to save draft')
    }
  }

  const handleCreateAndSubmit = async () => {
    if (!validateForm()) return
    if (!createPricingKey) {
      toast.error('Select a boost package before submitting')
      return
    }
    try {
      await createPromotion(buildCreatePayload(true)).unwrap()
      toast.success('Deal and boost submitted for admin approval')
      setShowCreate(false)
      setCreatePricingKey('')
      setTargeting({ appliesTo: 'all', productIds: [], categoryIds: [] })
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to submit deal')
    }
  }

  return (
    <RequirePermission anyOf={['PROMOTIONS_VIEW', 'PROMOTIONS_MANAGE']} title="deals">
      <div className="space-y-6">
        <PageHeader
          title={copy.title}
          description={copy.subtitle}
          actions={
            !persona.readOnly ? (
              <Button onClick={() => setShowCreate(true)} disabled={!promotionGate.canCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {promotionGate.canCreate ? copy.newButton : 'Deal limit reached'}
              </Button>
            ) : undefined
          }
        />

        <DealsPerformanceSummary title={copy.performanceTitle} />

        {!promotionGate.canCreate && promotionGate.limit != null ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            {promotionGate.message || promotionCopy.value}
          </div>
        ) : promotionGate.limit != null ? (
          <p className="text-sm text-[var(--text-muted)]">
            Active deals on your plan: {promotionGate.current}/{promotionGate.limit}
          </p>
        ) : null}

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle>{copy.listTitle}</CardTitle>
            <div className="w-full max-w-xs shrink-0">
              <Label htmlFor="promotion-status-filter" className="text-xs text-[var(--text-muted)]">
                Status filter
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="promotion-status-filter" className="mt-1.5">
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending approval</option>
                  <option value="rejected">Rejected</option>
                  <option value="approved_pending_payment">Awaiting payment</option>
                  <option value="active">Live</option>
                  <option value="paused">Paused</option>
                  <option value="expired">Expired</option>
                </SelectTrigger>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-[var(--red)]">
                Could not load deals. Refresh the page or check your plan permissions.
              </p>
            ) : isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-3 rounded-lg border border-[var(--app-border)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : promotions.length === 0 ? (
              <EmptyState
                title={SUPPLIER_EMPTY_STATE.title}
                description={SUPPLIER_EMPTY_STATE.description}
                action={
                  !persona.readOnly && promotionGate.canCreate ? (
                    <Button onClick={() => setShowCreate(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      {SUPPLIER_EMPTY_STATE.cta}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-3">
                {promotions.map((p) => {
                  const boostStatus = (p.boost_status as BoostStatus | undefined) || null
                  return (
                    <div
                      key={String(p.id)}
                      className="flex flex-col gap-3 rounded-lg border border-[var(--app-border)] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{String(p.name)}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {formatDealTypeLabel(p.type)}
                            {p.discount_value != null
                              ? ` · ${p.discount_value}${p.type === 'percentage_discount' ? '%' : ''}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge
                            status={String(p.status)}
                            label={formatDealStatusLabel(p.status)}
                          />
                          {p.is_promoted ? <Badge variant="secondary">Sponsored</Badge> : null}
                          {p.status === 'rejected' && p.rejection_reason ? (
                            <p className="text-xs text-[var(--red)] w-full">
                              Rejected: {String(p.rejection_reason)}
                            </p>
                          ) : null}
                          {p.boost_pricing_key &&
                          (p.status === 'pending_approval' ||
                            p.status === 'pending_admin_approval') ? (
                            <p className="text-xs text-[var(--text-muted)] w-full">
                              Boost: ${Number(p.boost_price_snapshot || 0).toFixed(0)} ·{' '}
                              {String(p.boost_duration_days)} day(s)
                            </p>
                          ) : null}
                          {p.status === 'approved_pending_payment' && (
                            <StatusBadge
                              status="approved_pending_payment"
                              label="Awaiting boost payment"
                            />
                          )}
                          {p.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSubmitDealId(String(p.id))
                                  setSubmitDealName(String(p.name))
                                }}
                              >
                                <Send className="h-3 w-3 mr-1" /> Submit with boost
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  await deletePromotion(String(p.id)).unwrap()
                                  toast.success('Deleted')
                                  refetch()
                                }}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                          {p.status === 'active' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  await pausePromotion(String(p.id)).unwrap()
                                  toast.success('Paused')
                                  refetch()
                                }}
                              >
                                Pause
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setAnalyticsId(String(p.id))}
                              >
                                <BarChart3 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {p.status === 'paused' && (
                            <Button
                              size="sm"
                              onClick={async () => {
                                await resumePromotion(String(p.id)).unwrap()
                                toast.success('Resumed')
                                refetch()
                              }}
                            >
                              Resume
                            </Button>
                          )}
                          {(p.status === 'rejected' || p.status === 'expired') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSubmitDealId(String(p.id))
                                setSubmitDealName(String(p.name))
                              }}
                            >
                              Boost again
                            </Button>
                          )}
                        </div>
                      </div>
                      <DealBoostStatus boost={boostStatus} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.newButton}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Store-wide presets</Label>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Quick-start a deal that applies to your entire catalog — shown as an on-sale badge
                  on your supplier profile.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STORE_WIDE_DEAL_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyStoreWidePreset(preset)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Deal type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((f) => ({
                      ...f,
                      type: value as (typeof SUPPLIER_DEAL_TYPES)[number],
                    }))
                  }
                >
                  <SelectTrigger>
                    {SUPPLIER_DEAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {formatDealTypeLabel(t)}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                {getDealTypeHelperText(form.type) ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {getDealTypeHelperText(form.type)}
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Discount value</Label>
                <Input
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                />
              </div>
              <div>
                <Label>Min order (optional)</Label>
                <Input
                  type="number"
                  value={form.minOrderAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
                />
              </div>
              <div>
                <Label>CTA type</Label>
                <Select
                  value={form.ctaType}
                  onValueChange={(value) => setForm((f) => ({ ...f, ctaType: value }))}
                >
                  <SelectTrigger>
                    {SUPPLIER_CTA_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                {getCtaHelperText(form.ctaType) ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {getCtaHelperText(form.ctaType)}
                  </p>
                ) : null}
              </div>
              {form.ctaType === 'use_coupon' ? (
                <div>
                  <Label>Coupon code</Label>
                  <Input
                    value={form.couponCode}
                    onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{COUPON_FIELD_HELPER}</p>
                </div>
              ) : null}
              <div>
                <Label className="text-base font-semibold">Deal targeting</Label>
                <div className="mt-2">
                  <DealTargetingPickers value={targeting} onChange={setTargeting} />
                </div>
              </div>
              <div className="border-t pt-3">
                <Label className="text-base font-semibold">Boost this deal</Label>
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  Optional paid sponsored placement. Required when submitting for approval —
                  restaurants only see live boosted deals in their feed.
                </p>
                <Label className="text-sm font-medium">Boost package</Label>
                <div className="mt-2">
                  <DealBoostPackagePicker
                    selectedPricingKey={createPricingKey}
                    onSelect={setCreatePricingKey}
                  />
                </div>
              </div>
              <div>
                <Label className="text-base font-semibold">Deal schedule</Label>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {DEAL_SCHEDULE_SECTION_HELPER}
                </p>
                <div className="mt-2 space-y-3">
                  <div>
                    <Label>Starts</Label>
                    <p className="text-xs text-[var(--text-muted)]">
                      When the discount or coupon becomes redeemable.
                    </p>
                    <Input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Ends (optional)</Label>
                    <p className="text-xs text-[var(--text-muted)]">{DEAL_SCHEDULE_ENDS_HELPER}</p>
                    <Input
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleSaveDraft} disabled={creating}>
                Save draft
              </Button>
              <Button onClick={handleCreateAndSubmit} disabled={creating || !createPricingKey}>
                <Send className="h-4 w-4 mr-2" />
                Submit for approval
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DealAnalyticsDialog
          dealId={analyticsId}
          open={!!analyticsId}
          onOpenChange={(open) => !open && setAnalyticsId(null)}
        />
        <SubmitDealDialog
          dealId={submitDealId}
          dealName={submitDealName}
          open={!!submitDealId}
          onOpenChange={(open) => {
            if (!open) {
              setSubmitDealId(null)
              setSubmitDealName('')
            }
          }}
          onSuccess={() => refetch()}
        />
      </div>
    </RequirePermission>
  )
}
