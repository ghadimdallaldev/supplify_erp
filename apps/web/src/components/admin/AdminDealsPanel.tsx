import React, { Fragment, useState } from 'react'
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
import { Loader2, Check, X, DollarSign, Pause, Search, RefreshCw } from 'lucide-react'
import { AdminEmptyState, AdminLoadingState, AdminStatusBadge, formatAdminDate } from './adminUi'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'pending_admin_approval', label: 'Pending admin approval' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved_pending_payment', label: 'Pending payment' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TYPE_OPTIONS = ['percentage_off', 'fixed_off', 'bogo', 'bundle', 'free_shipping']

export function AdminDealsPanel() {
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const apiStatus =
    statusFilter === 'pending_review' ? 'pending_approval' : statusFilter || undefined

  const { data, isLoading, refetch, isFetching } = useGetAdminDealsQuery({
    status: apiStatus,
    type: typeFilter || undefined,
    search: search.trim() || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">Deals & promotions</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Review supplier deals, activation payment status, and platform-wide deal insights.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
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
                className="mt-1 h-9 rounded-md border px-2 text-sm min-w-[10rem]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value || 'all'} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Deal type</Label>
              <select
                className="mt-1 h-9 rounded-md border px-2 text-sm min-w-[10rem]"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>From date</Label>
              <Input
                type="date"
                className="mt-1 h-9"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <Label>To date</Label>
              <Input
                type="date"
                className="mt-1 h-9"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
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
            <AdminLoadingState label="Loading deals…" />
          ) : deals.length === 0 ? (
            <AdminEmptyState
              title="No deals found"
              description={
                statusFilter
                  ? 'No deals match your filters. Try “All statuses” to see every supplier deal.'
                  : 'No supplier deals yet. Deals appear here when suppliers create and submit promotions.'
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
                    <th className="px-3 py-2 font-medium">Deal</th>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium">Start</th>
                    <th className="px-3 py-2 font-medium">End</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {deals.map((deal) => {
                    const id = String(deal.id)
                    const status = String(deal.status || '')
                    const isPending =
                      status === 'pending_approval' || status === 'pending_admin_approval'
                    return (
                      <Fragment key={id}>
                        <tr className="hover:bg-[var(--brand-ultra)]/40">
                          <td className="px-3 py-2.5 font-medium text-[var(--text)] max-w-[14rem] truncate">
                            {String(deal.name)}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)]">
                            {String(deal.supplier_name || '—')}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)] capitalize">
                            {String(deal.type || '—').replace(/_/g, ' ')}
                          </td>
                          <td className="px-3 py-2.5">
                            <AdminStatusBadge status={status} />
                          </td>
                          <td className="px-3 py-2.5">
                            <AdminStatusBadge
                              status={String(deal.payment_status || 'not_required')}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap">
                            {formatAdminDate(deal.starts_at)}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap">
                            {formatAdminDate(deal.ends_at)}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap">
                            {formatAdminDate(deal.created_at)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap justify-end gap-1">
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
                          </td>
                        </tr>
                        {rejectingId === id && (
                          <tr>
                            <td colSpan={9} className="px-3 py-3 bg-[var(--app-bg-subtle)]/30">
                              <div className="flex flex-wrap gap-2 items-end">
                                <div className="flex-1 min-w-[12rem]">
                                  <Label>Rejection reason</Label>
                                  <Input
                                    className="mt-1 h-9"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Optional reason shown to supplier"
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleReject(id)}
                                >
                                  Confirm reject
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-[var(--text-muted)] border-t">
                Showing {deals.length} deal{deals.length !== 1 ? 's' : ''} (max 200)
              </p>
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
            <AdminEmptyState
              title="No pricing tiers configured"
              description="Deal activation and boost pricing will appear here once configured."
            />
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
