import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  useGetAdminPendingDealsQuery,
  useApproveAdminDealMutation,
  useRejectAdminDealMutation,
  useGetPromotionPricingQuery,
  useUpdateAdminPromotionPricingMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2, Check, X, DollarSign } from 'lucide-react'
import { useState } from 'react'

export function AdminDealsPanel() {
  const { data, isLoading, refetch } = useGetAdminPendingDealsQuery()
  const { data: pricingData, refetch: refetchPricing } = useGetPromotionPricingQuery()
  const [approveDeal] = useApproveAdminDealMutation()
  const [rejectDeal] = useRejectAdminDealMutation()
  const [updatePricing, { isLoading: savingPricing }] = useUpdateAdminPromotionPricingMutation()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')

  const pendingDeals = data?.deals || []
  const pricing = pricingData?.pricing || []

  const handleApprove = async (id: string) => {
    try {
      await approveDeal(id).unwrap()
      toast.success('Deal approved')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to approve deal')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await rejectDeal(id).unwrap()
      toast.success('Deal rejected')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to reject deal')
    }
  }

  const startEditPricing = (key: string, amount: number) => {
    setEditingKey(key)
    setEditAmount(String(amount))
  }

  const savePricing = async (key: string) => {
    try {
      await updatePricing({ key, amount: Number(editAmount) }).unwrap()
      toast.success('Pricing updated')
      setEditingKey(null)
      refetchPricing()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to update pricing')
    }
  }

  return (
    <motionAdminDealsPanelLayout
      isLoading={isLoading}
      pendingDeals={pendingDeals}
      pricing={pricing}
      editingKey={editingKey}
      editAmount={editAmount}
      setEditAmount={setEditAmount}
      savingPricing={savingPricing}
      onApprove={handleApprove}
      onReject={handleReject}
      onStartEdit={startEditPricing}
      onSavePricing={savePricing}
      onCancelEdit={() => setEditingKey(null)}
    />
  )
}

function motionAdminDealsPanelLayout(props: {
  isLoading: boolean
  pendingDeals: Array<Record<string, unknown>>
  pricing: Array<Record<string, unknown>>
  editingKey: string | null
  editAmount: string
  setEditAmount: (v: string) => void
  savingPricing: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onStartEdit: (key: string, amount: number) => void
  onSavePricing: (key: string) => void
  onCancelEdit: () => void
}) {
  const {
    isLoading,
    pendingDeals,
    pricing,
    editingKey,
    editAmount,
    setEditAmount,
    savingPricing,
    onApprove,
    onReject,
    onStartEdit,
    onSavePricing,
    onCancelEdit,
  } = props

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--text)]">Deal approvals</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Review supplier deals awaiting admin approval before they go live.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending deals</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : pendingDeals.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No deals pending approval.</p>
          ) : (
            <div className="space-y-3">
              {pendingDeals.map((deal) => (
                <div
                  key={String(deal.id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div>
                    <p className="font-semibold">{String(deal.name)}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {String(deal.supplier_name || 'Supplier')} ·{' '}
                      {String(deal.type || '').replace(/_/g, ' ')}
                      {deal.discount_value != null
                        ? ` · ${deal.discount_value}${deal.type === 'percentage_discount' ? '%' : ''}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">pending approval</Badge>
                    <Button size="sm" onClick={() => onApprove(String(deal.id))}>
                      <Check className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(String(deal.id))}>
                      <X className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Boost pricing
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Configure what suppliers pay to promote deals to non-follower restaurants.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promotion pricing tiers</CardTitle>
        </CardHeader>
        <CardContent>
          {pricing.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No pricing tiers configured.</p>
          ) : (
            <motionAdminDealsPricingTable
              pricing={pricing}
              editingKey={editingKey}
              editAmount={editAmount}
              setEditAmount={setEditAmount}
              savingPricing={savingPricing}
              onStartEdit={onStartEdit}
              onSavePricing={onSavePricing}
              onCancelEdit={onCancelEdit}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function motionAdminDealsPricingTable(props: {
  pricing: Array<Record<string, unknown>>
  editingKey: string | null
  editAmount: string
  setEditAmount: (v: string) => void
  savingPricing: boolean
  onStartEdit: (key: string, amount: number) => void
  onSavePricing: (key: string) => void
  onCancelEdit: () => void
}) {
  const {
    pricing,
    editingKey,
    editAmount,
    setEditAmount,
    savingPricing,
    onStartEdit,
    onSavePricing,
    onCancelEdit,
  } = props

  return (
    <div className="space-y-2">
      {pricing.map((tier) => {
        const key = String(tier.pricing_key)
        const isEditing = editingKey === key
        return (
          <div
            key={key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <motionAdminDealsPricingRow tier={tier} />
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Input
                    type="number"
                    className="w-24 h-8"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                  <Button size="sm" onClick={() => onSavePricing(key)} disabled={savingPricing}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="font-semibold">${Number(tier.amount).toFixed(2)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStartEdit(key, Number(tier.amount))}
                  >
                    Edit
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function motionAdminDealsPricingRow({ tier }: { tier: Record<string, unknown> }) {
  return (
    <div>
      <p className="font-medium text-sm">{String(tier.display_name)}</p>
      <p className="text-xs text-[var(--text-muted)]">{String(tier.description || '')}</p>
      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
        {String(tier.billing_type)}
        {tier.duration_days ? ` · ${tier.duration_days} days` : ''}
      </p>
    </div>
  )
}
