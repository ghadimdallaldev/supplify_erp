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
import { featureEnabled } from '../../lib/planLimits'
import {
  useGetPromotionsQuery,
  useCreatePromotionMutation,
  useActivatePromotionMutation,
  usePausePromotionMutation,
  useDeletePromotionMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2, Plus } from 'lucide-react'

const PROMO_TYPES = [
  'percentage_discount',
  'fixed_discount',
  'free_shipping',
  'buy_x_get_y',
] as const

export function PromotionsPage() {
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const promotionsEnabled = featureEnabled(entitlementsData?.entitlements?.features?.promotions)

  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'percentage_discount' as (typeof PROMO_TYPES)[number],
    discountValue: '10',
    minOrderAmount: '',
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: '',
  })

  const { data, isLoading, refetch } = useGetPromotionsQuery(
    statusFilter ? { status: statusFilter } : undefined
  )
  const [createPromotion, { isLoading: creating }] = useCreatePromotionMutation()
  const [activatePromotion] = useActivatePromotionMutation()
  const [pausePromotion] = usePausePromotionMutation()
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
    try {
      await createPromotion({
        name: form.name,
        type: form.type,
        discountValue: Number(form.discountValue) || 0,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        appliesTo: 'all',
      }).unwrap()
      toast.success('Promotion created (draft)')
      setShowCreate(false)
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
          <h1 className="text-[21px] font-black text-[var(--text)]">Promotions</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">Create and manage supplier deals</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New promotion
        </Button>
      </div>

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
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
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
    </div>
  )
}
