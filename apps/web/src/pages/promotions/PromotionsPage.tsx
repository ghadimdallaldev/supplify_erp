import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { useGetEntitlementsQuery } from '../../services/api'
import { featureEnabled, getSupplierPromotionGate } from '../../lib/planLimits'
import { LIMIT_UPGRADE_COPY } from '../../lib/upgradeCopy'
import {
  useGetPromotionsQuery,
  useCreatePromotionMutation,
  useActivatePromotionMutation,
  usePausePromotionMutation,
  useResumePromotionMutation,
  useDeletePromotionMutation,
} from '../../services/api'
import { DealAnalyticsDialog } from '../../components/deals/DealAnalyticsDialog'
import { PromoteDealDialog } from '../../components/deals/PromoteDealDialog'
import {
  DealTargetingPickers,
  type DealTargetingValue,
} from '../../components/deals/DealTargetingPickers'
import toast from 'react-hot-toast'
import { Loader2, Plus, Megaphone, BarChart3 } from 'lucide-react'

const CTA_TYPES = [
  { value: 'order_now', label: 'Order now' },
  { value: 'use_coupon', label: 'Use coupon' },
  { value: 'message_supplier', label: 'Message supplier' },
  { value: 'view_products', label: 'View products' },
] as const

const PROMO_TYPES = [
  'percentage_discount',
  'fixed_discount',
  'free_shipping',
  'buy_x_get_y',
] as const

export function PromotionsPage() {
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const promotionsEnabled = featureEnabled(entitlementsData?.entitlements?.features?.promotions)
  const promotionGate = getSupplierPromotionGate(entitlementsData?.entitlements)
  const promotionCopy = LIMIT_UPGRADE_COPY.promotions

  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [analyticsId, setAnalyticsId] = useState<string | null>(null)
  const [promoteId, setPromoteId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    type: 'percentage_discount' as (typeof PROMO_TYPES)[number],
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

  const { data, isLoading, refetch } = useGetPromotionsQuery(
    statusFilter ? { status: statusFilter } : undefined
  )
  const [createPromotion, { isLoading: creating }] = useCreatePromotionMutation()
  const [activatePromotion] = useActivatePromotionMutation()
  const [pausePromotion] = usePausePromotionMutation()
  const [resumePromotion] = useResumePromotionMutation()
  const [deletePromotion] = useDeletePromotionMutation()

  const promotions = data?.promotions || []

  if (!promotionsEnabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-[21px] font-black text-[var(--text)]">Promotions</h1>
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            Promotions and deals are not on your plan. Upgrade to create featured listings and
            supplier discounts.
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (targeting.appliesTo === 'specific_products' && targeting.productIds.length === 0) {
      toast.error('Select at least one product')
      return
    }
    if (targeting.appliesTo === 'specific_categories' && targeting.categoryIds.length === 0) {
      toast.error('Select at least one category')
      return
    }
    try {
      await createPromotion({
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
        categoryIds:
          targeting.appliesTo === 'specific_categories' ? targeting.categoryIds : undefined,
      }).unwrap()
      toast.success('Promotion created (draft)')
      setShowCreate(false)
      setTargeting({ appliesTo: 'all', productIds: [], categoryIds: [] })
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to create promotion')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Deals & Promotions</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Create deals and boost visibility to new restaurants
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={!promotionGate.canCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {promotionGate.canCreate ? 'New promotion' : 'Deal limit reached'}
        </Button>
      </div>

      {!promotionGate.canCreate && promotionGate.limit != null ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          {promotionGate.message || promotionCopy.value}
        </div>
      ) : promotionGate.limit != null ? (
        <p className="text-sm text-[var(--text-muted)]">
          Deals on your plan: {promotionGate.current}/{promotionGate.limit}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <Label>Status filter</Label>
          <select
            className="mt-1 h-10 rounded-md border px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending approval</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="expired">Expired</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your promotions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : promotions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No promotions yet.</p>
          ) : (
            <div className="space-y-3">
              {promotions.map((p) => (
                <div
                  key={String(p.id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] p-4"
                >
                  <div>
                    <p className="font-semibold">{String(p.name)}</p>
                    <p className="text-xs text-[var(--text-muted)] capitalize">
                      {String(p.type || '').replace(/_/g, ' ')}
                      {p.discount_value != null
                        ? ` · ${p.discount_value}${p.type === 'percentage_discount' ? '%' : ''}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{String(p.status)}</Badge>
                    {p.is_promoted ? <Badge variant="secondary">Boosted</Badge> : null}
                    {p.status === 'draft' && (
                      <>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await activatePromotion(String(p.id)).unwrap()
                            toast.success('Activated')
                            refetch()
                          }}
                        >
                          Activate
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
                          variant="outline"
                          onClick={() => setPromoteId(String(p.id))}
                        >
                          <Megaphone className="h-3 w-3 mr-1" /> Boost
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New promotion</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as (typeof PROMO_TYPES)[number] }))
                }
              >
                {PROMO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
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
              <Label>CTA</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                value={form.ctaType}
                onChange={(e) => setForm((f) => ({ ...f, ctaType: e.target.value }))}
              >
                {CTA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {form.ctaType === 'use_coupon' ? (
              <div>
                <Label>Coupon code</Label>
                <Input
                  value={form.couponCode}
                  onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value }))}
                />
              </div>
            ) : null}
            <DealTargetingPickers value={targeting} onChange={setTargeting} />
            <div>
              <Label>Starts</Label>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </div>
            <div>
              <Label>Ends (optional)</Label>
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={creating}>
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DealAnalyticsDialog
        dealId={analyticsId}
        open={!!analyticsId}
        onOpenChange={(open) => !open && setAnalyticsId(null)}
      />
      <PromoteDealDialog
        dealId={promoteId}
        open={!!promoteId}
        onOpenChange={(open) => !open && setPromoteId(null)}
        onSuccess={() => refetch()}
      />
    </div>
  )
}
