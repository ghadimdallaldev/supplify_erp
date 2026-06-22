import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
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
import { DealsStatusFilter, SupplierDealRow } from '../../components/deals/SupplierDealRow'
import {
  DealTargetingPickers,
  type DealTargetingValue,
} from '../../components/deals/DealTargetingPickers'
import { toast } from 'sonner'
import { RequirePermission } from '../../components/RequirePermission'
import { FeatureLockedCard } from '../../components/FeatureLockedCard'
import { DealsPerformanceSummary } from '../../components/promotions/DealsPerformanceSummary'
import { useWorkspaceRole } from '../../hooks/useWorkspaceRole'
import { Plus, Send } from 'lucide-react'
import { EmptyState } from '../../components/ui/empty-state'
import { SUPPLIER_CTA_TYPES, SUPPLIER_DEAL_TYPES } from '../../lib/dealDisplayLabels'

export function PromotionsPage() {
  const { t } = useTranslation('cart')
  const { persona } = useWorkspaceRole()
  const copy = {
    title: persona.promotionsCopy?.title ?? t('promotions.title'),
    subtitle: persona.promotionsCopy?.subtitle ?? t('promotions.subtitle'),
    listTitle: persona.promotionsCopy?.listTitle ?? t('promotions.listTitle'),
    newButton: persona.promotionsCopy?.newButton ?? t('promotions.newButton'),
    performanceTitle: persona.promotionsCopy?.performanceTitle ?? t('promotions.performanceTitle'),
  }

  const storeWideDealPresets = useMemo(
    () =>
      [
        {
          label: t('promotions.preset10Percent'),
          name: t('promotions.preset10PercentName'),
          type: 'percentage_discount' as const,
          discountValue: '10',
        },
        {
          label: t('promotions.preset15Percent'),
          name: t('promotions.preset15PercentName'),
          type: 'percentage_discount' as const,
          discountValue: '15',
        },
        {
          label: t('promotions.preset25Off'),
          name: t('promotions.preset25OffName'),
          type: 'fixed_discount' as const,
          discountValue: '25',
        },
      ] as const,
    [t]
  )

  const formatDealTypeLabel = (type: string) =>
    t(`promotions.dealTypes.${type}`, { defaultValue: type })

  const getDealTypeHelperText = (type: string) => {
    const key = `promotions.dealTypeHelper.${type}`
    const text = t(key, { defaultValue: '' })
    return text || undefined
  }

  const getCtaHelperText = (cta: string) => {
    const key = `promotions.ctaHelper.${cta}`
    const text = t(key, { defaultValue: '' })
    return text || undefined
  }

  const getCtaLabel = (value: string) => t(`promotions.ctaTypes.${value}`, { defaultValue: value })
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
      <PageShell data-testid="promotions-page">
        <PageHeader title={t('promotions.title')} />
        <FeatureLockedCard
          featureKey="promotions"
          featureName={t('promotions.title')}
          currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
        />
      </PageShell>
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
      toast.error(t('promotions.toastNameRequired'))
      return false
    }
    if (targeting.appliesTo === 'specific_products' && targeting.productIds.length === 0) {
      toast.error(t('promotions.toastSelectProduct'))
      return false
    }
    if (targeting.appliesTo === 'specific_categories' && targeting.categoryIds.length === 0) {
      toast.error(t('promotions.toastSelectCategory'))
      return false
    }
    return true
  }

  const applyStoreWidePreset = (preset: (typeof storeWideDealPresets)[number]) => {
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
      toast.success(t('promotions.toastDraftSaved'))
      setShowCreate(false)
      setCreatePricingKey('')
      setTargeting({ appliesTo: 'all', productIds: [], categoryIds: [] })
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('promotions.toastDraftSaveFailed'))
    }
  }

  const handleCreateAndSubmit = async () => {
    if (!validateForm()) return
    if (!createPricingKey) {
      toast.error(t('promotions.toastSelectBoost'))
      return
    }
    try {
      await createPromotion(buildCreatePayload(true)).unwrap()
      toast.success(t('promotions.toastSubmitted'))
      setShowCreate(false)
      setCreatePricingKey('')
      setTargeting({ appliesTo: 'all', productIds: [], categoryIds: [] })
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('promotions.toastSubmitFailed'))
    }
  }

  return (
    <RequirePermission
      anyOf={['PROMOTIONS_VIEW', 'PROMOTIONS_MANAGE']}
      title={t('promotions.permissionTitle')}
    >
      <PageShell data-testid="promotions-page">
        <PageHeader
          title={copy.title}
          description={copy.subtitle}
          actions={
            !persona.readOnly ? (
              <Button onClick={() => setShowCreate(true)} disabled={!promotionGate.canCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {promotionGate.canCreate ? copy.newButton : t('promotions.dealLimitReached')}
              </Button>
            ) : undefined
          }
        />

        <DealsPerformanceSummary title={copy.performanceTitle} />

        {!promotionGate.canCreate && promotionGate.limit != null ? (
          <div
            className="rounded-xl border border-[var(--amber)]/25 bg-[var(--amber-pale)] px-4 py-3 text-sm text-[var(--text)]"
            role="status"
          >
            {promotionGate.message || promotionCopy.value}
          </div>
        ) : promotionGate.limit != null ? (
          <p className="text-sm text-[var(--text-mid)]">
            {t('promotions.activeDealsOnPlan')}{' '}
            <span className="font-medium tabular-nums text-[var(--text)]">
              {promotionGate.current}/{promotionGate.limit}
            </span>
          </p>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
          <div className="flex flex-col gap-4 border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-[var(--text)]">{copy.listTitle}</h2>
              {!isLoading && promotions.length > 0 ? (
                <p className="text-xs text-[var(--text-muted)] tabular-nums">
                  {t('promotions.dealCount', { count: promotions.length })}
                </p>
              ) : null}
            </div>
            <DealsStatusFilter value={statusFilter} onChange={setStatusFilter} />
          </div>

          {error ? (
            <p className="px-4 py-8 text-sm text-[var(--red)] sm:px-5">
              {t('promotions.loadError')}
            </p>
          ) : isLoading ? (
            <div className="divide-y divide-[var(--app-border)]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-4 sm:px-5">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : promotions.length === 0 ? (
            <div className="px-4 py-8 sm:px-5">
              <EmptyState
                title={t('promotions.emptyTitle')}
                description={t('promotions.emptyDescription')}
                action={
                  !persona.readOnly && promotionGate.canCreate ? (
                    <Button onClick={() => setShowCreate(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('promotions.newButton')}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--app-border)]">
              {promotions.map((p) => (
                <SupplierDealRow
                  key={String(p.id)}
                  promotion={p}
                  readOnly={persona.readOnly}
                  onSubmit={(id, name) => {
                    setSubmitDealId(id)
                    setSubmitDealName(name)
                  }}
                  onDelete={async (id) => {
                    await deletePromotion(id).unwrap()
                    toast.success(t('promotions.toastDeleted'))
                    refetch()
                  }}
                  onPause={async (id) => {
                    await pausePromotion(id).unwrap()
                    toast.success(t('promotions.toastPaused'))
                    refetch()
                  }}
                  onResume={async (id) => {
                    await resumePromotion(id).unwrap()
                    toast.success(t('promotions.toastResumed'))
                    refetch()
                  }}
                  onAnalytics={setAnalyticsId}
                />
              ))}
            </div>
          )}
        </section>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>{copy.newButton}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t('promotions.storeWidePresets')}</Label>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('promotions.storeWidePresetsHint')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {storeWideDealPresets.map((preset) => (
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
                <Label>{t('promotions.name')}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('promotions.dealType')}</Label>
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
                <Label>{t('promotions.discountValue')}</Label>
                <Input
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('promotions.minOrderOptional')}</Label>
                <Input
                  type="number"
                  value={form.minOrderAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('promotions.ctaType')}</Label>
                <Select
                  value={form.ctaType}
                  onValueChange={(value) => setForm((f) => ({ ...f, ctaType: value }))}
                >
                  <SelectTrigger>
                    {SUPPLIER_CTA_TYPES.map((cta) => (
                      <option key={cta.value} value={cta.value}>
                        {getCtaLabel(cta.value)}
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
                  <Label>{t('promotions.couponCode')}</Label>
                  <Input
                    value={form.couponCode}
                    onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('promotions.couponFieldHelper')}
                  </p>
                </div>
              ) : null}
              <div>
                <Label className="text-base font-semibold">{t('promotions.dealTargeting')}</Label>
                <div className="mt-2">
                  <DealTargetingPickers value={targeting} onChange={setTargeting} />
                </div>
              </div>
              <div className="border-t pt-3">
                <Label className="text-base font-semibold">{t('promotions.boostThisDeal')}</Label>
                <p className="text-xs text-[var(--text-muted)] mb-2">{t('promotions.boostHint')}</p>
                <Label className="text-sm font-medium">{t('promotions.boostPackage')}</Label>
                <div className="mt-2">
                  <DealBoostPackagePicker
                    selectedPricingKey={createPricingKey}
                    onSelect={setCreatePricingKey}
                  />
                </div>
              </div>
              <div>
                <Label className="text-base font-semibold">{t('promotions.dealSchedule')}</Label>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('promotions.dealScheduleHelper')}
                </p>
                <div className="mt-2 space-y-3">
                  <div>
                    <Label>{t('promotions.starts')}</Label>
                    <p className="text-xs text-[var(--text-muted)]">{t('promotions.startsHint')}</p>
                    <Input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t('promotions.endsOptional')}</Label>
                    <p className="text-xs text-[var(--text-muted)]">{t('promotions.endsHint')}</p>
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
                {t('promotions.saveDraft')}
              </Button>
              <Button onClick={handleCreateAndSubmit} disabled={creating || !createPricingKey}>
                <Send className="h-4 w-4 mr-2" />
                {t('promotions.submitForApproval')}
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
      </PageShell>
    </RequirePermission>
  )
}
