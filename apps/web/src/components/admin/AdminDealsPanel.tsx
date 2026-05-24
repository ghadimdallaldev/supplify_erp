import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  useGetAdminDealsQuery,
  useGetAdminDealInsightsQuery,
  useApproveAdminDealMutation,
  useRejectAdminDealMutation,
  usePauseAdminDealMutation,
  useGetPromotionPricingQuery,
  useUpdateAdminPromotionPricingMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2, Check, X, DollarSign, Pause, Search } from 'lucide-react'
import { useState } from 'react'

const STATUS_OPTIONS = [
  '',
  'draft',
  'pending_approval',
  'pending_admin_approval',
  'rejected',
  'approved_pending_payment',
  'scheduled',
  'active',
  'paused',
  'expired',
  'cancelled',
]

function formatDate(value: unknown) {
  if (!value) return '—'
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'active') return 'default'
  if (status.includes('pending')) return 'secondary'
  if (status === 'rejected' || status === 'expired') return 'destructive'
  return 'outline'
}

export function AdminDealsPanel() {
  const [statusFilter, setStatusFilter] = useState('pending_approval')
  const [search, setSearch] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading, refetch } = useGetAdminDealsQuery({
    status: statusFilter || undefined,
    search: search.trim() || undefined,
  })
  const { data: insightsData } = useGetAdminDealInsightsQuery()
  const { data: pricingData, refetch: refetchPricing } = useGetPromotionPricingQuery()
  const [approveDeal] = useApproveAdminDealMutation()
  const [rejectDeal] = useRejectAdminDealMutation()
  const [pauseDeal] = usePauseAdminDealMutation()
  const [updatePricing, { isLoading: savingPricing }] = useUpdateAdminPromotionPricingMutation()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')

  const deals = data?.deals || []
  const insights = insightsData?.insights
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
      await rejectDeal({ id, rejectionReason: rejectReason || undefined }).unwrap()
      toast.success('Deal rejected')
      setRejectingId(null)
      setRejectReason('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to reject deal')
    }
  }

  const handlePause = async (id: string) => {
    try {
      await pauseDeal(id).unwrap()
      toast.success('Deal paused')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to pause deal')
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--text)]">Deals & promotions</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Review supplier deals, activation payment status, and platform-wide deal insights.
        </p>
      </div>

      {insights && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total deals', value: insights.total_deals },
            { label: 'Active', value: insights.active_deals },
            { label: 'Pending approval', value: insights.pending_approval },
            { label: 'Pending payment', value: insights.pending_payment },
            { label: 'Total views', value: insights.total_views },
            { label: 'Orders from deals', value: insights.orders_from_deals },
            {
              label: 'Revenue (orders w/ deals)',
              value: `$${Number(insights.total_revenue || 0).toFixed(0)}`,
            },
            {
              label: 'Discount given',
              value: `$${Number(insights.total_discount_given || 0).toFixed(0)}`,
            },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                <p className="text-xl font-bold">{value ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All supplier deals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label>Status</Label>
              <select
                className="mt-1 h-9 rounded-md border px-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s || 'all'} value={s}>
                    {s ? s.replace(/_/g, ' ') : 'All statuses'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[12rem]">
              <Label>Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Title or supplier…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : deals.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No deals match your filters. Pending deals appear when suppliers submit for review.
            </p>
          ) : (
            <div className="space-y-3">
              {deals.map((deal) => {
                const id = String(deal.id)
                const status = String(deal.status || '')
                const isPending =
                  status === 'pending_approval' || status === 'pending_admin_approval'
                return (
                  <div key={id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{String(deal.name)}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {String(deal.supplier_name || 'Supplier')} ·{' '}
                          {String(deal.type || '').replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Active from {formatDate(deal.starts_at)} until {formatDate(deal.ends_at)}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Created {formatDate(deal.created_at)} · Payment:{' '}
                          {String(deal.payment_status || 'not_required').replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusBadgeVariant(status)}>
                          {status.replace(/_/g, ' ')}
                        </Badge>
                        {isPending && (
                          <>
                            <Button size="sm" onClick={() => handleApprove(id)}>
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRejectingId(rejectingId === id ? null : id)}
                            >
                              <X className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {(status === 'active' || status === 'scheduled') && (
                          <Button size="sm" variant="outline" onClick={() => handlePause(id)}>
                            <Pause className="h-3 w-3 mr-1" /> Pause
                          </Button>
                        )}
                      </div>
                    </div>
                    {rejectingId === id && (
                      <div className="flex flex-wrap gap-2 items-end border-t pt-3">
                        <div className="flex-1 min-w-[12rem]">
                          <Label>Rejection reason</Label>
                          <Input
                            className="mt-1 h-9"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Optional reason shown to supplier"
                          />
                        </div>
                        <Button size="sm" variant="destructive" onClick={() => handleReject(id)}>
                          Confirm reject
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Deal pricing
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Activation fee after admin approval (deal_activation) and boost tiers for paid visibility.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing tiers</CardTitle>
        </CardHeader>
        <CardContent>
          {pricing.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No pricing tiers configured.</p>
          ) : (
            <div className="space-y-2">
              {pricing.map((tier) => {
                const key = String(tier.pricing_key)
                const isEditing = editingKey === key
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">{String(tier.display_name)}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {String(tier.description || '')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Input
                            type="number"
                            className="w-24 h-8"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                          />
                          <Button
                            size="sm"
                            onClick={() => savePricing(key)}
                            disabled={savingPricing}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">${Number(tier.amount).toFixed(2)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditPricing(key, Number(tier.amount))}
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
