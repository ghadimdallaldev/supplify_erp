import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
  useGetOrderQuery,
  useGetOrdersQuery,
  useGetSuppliersQuery,
  useCreateDisputeMutation,
  useReviewDisputeMutation,
  useResolveDisputeMutation,
  useRejectDisputeMutation,
  useGetEntitlementsQuery,
} from '../../services/api'
import { useAppSelector } from '../../hooks/redux'
import { featureEnabled } from '../../lib/planLimits'
import { formatPrice } from '../../utils/format'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

const DISPUTE_TYPES = [
  'short_delivery',
  'damaged_goods',
  'wrong_items',
  'quality_issue',
  'billing_error',
  'other',
] as const

function statusBadge(status: string) {
  const s = status?.toLowerCase()
  if (s === 'resolved') return 'default'
  if (s === 'rejected' || s === 'cancelled') return 'destructive'
  if (s === 'under_review') return 'secondary'
  return 'outline'
}

function formatOrderRef(orderId: unknown): string {
  const id = String(orderId || '')
  if (!id) return '—'
  return `#${id.slice(0, 8).toUpperCase()}`
}

type DisputeRow = {
  id: string
  orderId?: string
  order_id?: string
  type?: string
  status?: string
  disputedAmount?: number | null
  disputed_amount?: number | null
  restaurantName?: string
}

export function DisputesPage() {
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  const [searchParams] = useSearchParams()
  const orderIdFromUrl = searchParams.get('orderId') || ''
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [resolveId, setResolveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [resolutionType, setResolutionType] = useState('credit_note')
  const [creditAmount, setCreditAmount] = useState('')

  const [createForm, setCreateForm] = useState({
    orderId: '',
    supplierId: '',
    type: 'short_delivery' as (typeof DISPUTE_TYPES)[number],
    description: '',
    disputedAmount: '',
  })

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = featureEnabled(entitlementsData?.entitlements?.features?.disputes_returns)

  const {
    data: restaurantData,
    isLoading: loadingRestaurant,
    refetch: refetchRestaurant,
  } = useGetDisputesQuery({ status: statusFilter || undefined }, { skip: isSupplier })
  const {
    data: supplierData,
    isLoading: loadingSupplier,
    refetch: refetchSupplier,
  } = useGetIncomingDisputesQuery({ status: statusFilter || undefined }, { skip: !isSupplier })

  const [createDispute, { isLoading: creating }] = useCreateDisputeMutation()
  const [reviewDispute] = useReviewDisputeMutation()
  const [resolveDispute, { isLoading: resolving }] = useResolveDisputeMutation()
  const [rejectDispute, { isLoading: rejecting }] = useRejectDisputeMutation()

  const disputes = (isSupplier ? supplierData?.disputes : restaurantData?.disputes) || []
  const isLoading = isSupplier ? loadingSupplier : loadingRestaurant
  const refetch = isSupplier ? refetchSupplier : refetchRestaurant

  const { data: orderForDispute } = useGetOrderQuery(orderIdFromUrl, {
    skip: !orderIdFromUrl || isSupplier,
  })

  const { data: ordersListData, isLoading: loadingOrders } = useGetOrdersQuery(
    { limit: 100, offset: 0 },
    { skip: isSupplier || !showCreate }
  )
  const { data: suppliersData, isLoading: loadingSuppliers } = useGetSuppliersQuery(
    { limit: 100, offset: 0 },
    { skip: isSupplier || !showCreate }
  )

  const orderOptions = useMemo(() => {
    const orders = ordersListData?.orders ?? []
    return orders
      .filter((o) => o.status !== 'DRAFT' && o.status !== 'CANCELLED')
      .map((o) => ({
        id: o.id,
        label: `${formatOrderRef(o.id)} — ${new Date(o.placed_at || o.created_at).toLocaleDateString()} — $${formatPrice(Number(o.total_amount || 0))}`,
      }))
  }, [ordersListData])

  const suppliersForSelectedOrder = useMemo(() => {
    if (!createForm.orderId) return []
    const order =
      orderForDispute?.order?.id === createForm.orderId
        ? orderForDispute.order
        : ordersListData?.orders?.find((o) => o.id === createForm.orderId)
    const items = order?.items ?? []
    const map = new Map<string, string>()
    for (const item of items) {
      const sid = item.supplier_id
      if (sid) {
        map.set(sid, item.supplier_name || `Supplier ${sid.slice(0, 8)}`)
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [createForm.orderId, orderForDispute, ordersListData])

  const supplierOptions = useMemo(() => {
    if (suppliersForSelectedOrder.length > 0) return suppliersForSelectedOrder
    const suppliers = suppliersData?.suppliers ?? []
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name || `Supplier ${String(s.id).slice(0, 8)}`,
    }))
  }, [suppliersForSelectedOrder, suppliersData])

  useEffect(() => {
    if (!orderIdFromUrl || isSupplier) return
    setCreateForm((f) => ({ ...f, orderId: orderIdFromUrl }))
    setShowCreate(true)
  }, [orderIdFromUrl, isSupplier])

  const { data: selectedOrderDetail } = useGetOrderQuery(createForm.orderId, {
    skip: !createForm.orderId || isSupplier,
  })

  useEffect(() => {
    if (!createForm.orderId) return
    const items = selectedOrderDetail?.order?.items ?? []
    const ids = [...new Set(items.map((item) => item.supplier_id).filter(Boolean) as string[])]
    if (ids.length === 1) {
      setCreateForm((f) => (f.supplierId === ids[0] ? f : { ...f, supplierId: ids[0] }))
    }
  }, [createForm.orderId, selectedOrderDetail])

  if (!disputesEnabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-[21px] font-black text-[var(--text)]">Disputes</h1>
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            Disputes & returns are not on your plan. Upgrade to manage delivery issues and credits.
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleCreate = async () => {
    if (!createForm.orderId || !createForm.supplierId || !createForm.description.trim()) {
      toast.error('Order, supplier, and description are required')
      return
    }
    try {
      await createDispute({
        orderId: createForm.orderId,
        supplierId: createForm.supplierId,
        type: createForm.type,
        description: createForm.description,
        disputedAmount: createForm.disputedAmount ? Number(createForm.disputedAmount) : undefined,
      }).unwrap()
      toast.success('Dispute opened')
      setShowCreate(false)
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { message?: string; error?: { message?: string } } }
      toast.error(err?.data?.error?.message || err?.data?.message || 'Failed to create dispute')
    }
  }

  const handleReview = async (id: string) => {
    try {
      await reviewDispute(id).unwrap()
      toast.success('Marked under review')
      refetch()
    } catch {
      toast.error('Failed to update dispute')
    }
  }

  const handleResolve = async () => {
    if (!resolveId) return
    try {
      await resolveDispute({
        id: resolveId,
        body: {
          resolutionType,
          resolutionNotes: resolutionNotes || undefined,
          creditNoteAmount: creditAmount ? Number(creditAmount) : undefined,
        },
      }).unwrap()
      toast.success('Dispute resolved')
      setResolveId(null)
      setResolutionNotes('')
      setCreditAmount('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to resolve')
    }
  }

  const handleReject = async () => {
    if (!rejectId || !resolutionNotes.trim()) {
      toast.error('Notes are required when rejecting')
      return
    }
    try {
      await rejectDispute({ id: rejectId, resolutionNotes }).unwrap()
      toast.success('Dispute rejected')
      setRejectId(null)
      setResolutionNotes('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to reject')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Disputes</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {isSupplier ? 'Incoming disputes from restaurants' : 'Open and track order disputes'}
          </p>
        </div>
        {!isSupplier && <Button onClick={() => setShowCreate(true)}>Open dispute</Button>}
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div>
            <Label>Status</Label>
            <select
              className="h-10 rounded-md border border-[var(--app-border)] px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isSupplier ? 'Incoming' : 'My disputes'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : disputes.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No disputes found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="py-2">Order</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((row) => {
                    const dispute = row as DisputeRow
                    const orderId = dispute.orderId || dispute.order_id
                    const disputedAmount = dispute.disputedAmount ?? dispute.disputed_amount
                    return (
                      <tr key={String(dispute.id)} className="border-b border-[var(--app-border)]">
                        <td className="py-3">
                          {orderId ? (
                            <Link
                              to={`/app/orders/${orderId}`}
                              className="text-[var(--brand-mid)] hover:underline font-mono text-xs"
                            >
                              {formatOrderRef(orderId)}
                            </Link>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="capitalize">
                          {String(dispute.type || '').replace(/_/g, ' ')}
                        </td>
                        <td>
                          <Badge variant={statusBadge(String(dispute.status))}>
                            {String(dispute.status)}
                          </Badge>
                        </td>
                        <td>
                          {disputedAmount != null ? `$${formatPrice(Number(disputedAmount))}` : '—'}
                        </td>
                        <td className="text-right space-x-2">
                          {isSupplier && dispute.status === 'open' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReview(String(dispute.id))}
                            >
                              Review
                            </Button>
                          )}
                          {isSupplier &&
                            (dispute.status === 'open' || dispute.status === 'under_review') && (
                              <>
                                <Button size="sm" onClick={() => setResolveId(String(dispute.id))}>
                                  Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRejectId(String(dispute.id))}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Order</Label>
              <select
                className="w-full h-10 rounded-md border border-[var(--app-border)] px-3 text-sm"
                value={createForm.orderId}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    orderId: e.target.value,
                    supplierId: '',
                  }))
                }
                disabled={loadingOrders}
              >
                <option value="">{loadingOrders ? 'Loading orders…' : 'Select an order'}</option>
                {orderOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Supplier</Label>
              <select
                className="w-full h-10 rounded-md border border-[var(--app-border)] px-3 text-sm"
                value={createForm.supplierId}
                onChange={(e) => setCreateForm((f) => ({ ...f, supplierId: e.target.value }))}
                disabled={!createForm.orderId || loadingSuppliers}
              >
                <option value="">
                  {!createForm.orderId
                    ? 'Select an order first'
                    : supplierOptions.length === 0
                      ? 'No suppliers on this order'
                      : 'Select supplier'}
                </option>
                {supplierOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={createForm.type}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    type: e.target.value as (typeof DISPUTE_TYPES)[number],
                  }))
                }
              >
                {DISPUTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Disputed amount (optional)</Label>
              <Input
                type="number"
                value={createForm.disputedAmount}
                onChange={(e) => setCreateForm((f) => ({ ...f, disputedAmount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resolveId)} onOpenChange={() => setResolveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Resolution</Label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={resolutionType}
                onChange={(e) => setResolutionType(e.target.value)}
              >
                <option value="credit_note">Credit note</option>
                <option value="replacement">Replacement</option>
                <option value="refund">Refund</option>
                <option value="no_action">No action</option>
              </select>
            </div>
            {resolutionType === 'credit_note' && (
              <div>
                <Label>Credit amount</Label>
                <Input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleResolve} disabled={resolving}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectId)} onOpenChange={() => setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject dispute</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (required)"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
          />
          <DialogFooter>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
