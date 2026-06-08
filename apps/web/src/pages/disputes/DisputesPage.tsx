import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  useReviewDisputeMutation,
  useResolveDisputeMutation,
  useRejectDisputeMutation,
  useGetEntitlementsQuery,
} from '../../services/api'
import { useImpersonation } from '../../hooks/useImpersonation'
import { usePermissions } from '../../hooks/usePermissions'
import { RequirePermission } from '../../components/RequirePermission'
import { isEntitlementFeatureEnabled } from '../../lib/planLimits'
import {
  disputeEligibilityMessage,
  isOrderEligibleForDispute,
} from '../../lib/orderDisputeEligibility'
import { OpenDisputeDialog } from '../../components/disputes/OpenDisputeDialog'
import {
  DisputeListCards,
  formatOrderRef,
  statusBadge,
} from '../../components/disputes/DisputeListCards'
import { TableScroll } from '../../components/ui/table-scroll'
import { EmptyState } from '../../components/ui/empty-state'
import { formatPrice } from '../../utils/format'
import toast from 'react-hot-toast'
import { Loader2, Scale } from 'lucide-react'

const FORM_SELECT_CLASS =
  'mt-1.5 h-10 w-full rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30'

type DisputeRow = {
  id: string
  orderId?: string
  order_id?: string
  type?: string
  status?: string
  disputedAmount?: number | null
  disputed_amount?: number | null
  restaurantName?: string
  restaurant_name?: string
}

export function DisputesPage() {
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { can } = usePermissions()
  const canManageSupplierDisputes = can('FULFILLMENT_MANAGE')
  const [searchParams, setSearchParams] = useSearchParams()
  const orderIdFromUrl = searchParams.get('orderId') || ''
  const supplierIdFromUrl = searchParams.get('supplierId') || ''
  const [disputeDialogOrderId, setDisputeDialogOrderId] = useState<string | null>(null)
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
    type: 'short_delivery',
    description: '',
    disputedAmount: '',
  })

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )

  const {
    data: restaurantData,
    isLoading: loadingRestaurant,
    refetch: refetchRestaurant,
  } = useGetDisputesQuery({ status: statusFilter || undefined }, { skip: isSupplier })
  const {
    data: supplierData,
    isLoading: loadingSupplier,
    refetch: refetchSupplier,
  } = useGetIncomingDisputesQuery(
    { status: statusFilter || undefined },
    { skip: !isSupplier || !can('FULFILLMENT_VIEW') }
  )

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

  const { data: selectedOrderDetail } = useGetOrderQuery(createForm.orderId, {
    skip: !createForm.orderId || isSupplier,
  })

  const orderOptions = useMemo(() => {
    const orders = ordersListData?.orders ?? []
    return orders
      .filter((o) => isOrderEligibleForDispute(o.status))
      .map((o) => ({
        id: o.id,
        label: `${formatOrderRef(o.id)} — ${String(o.status).replace(/_/g, ' ')} — ${new Date(o.placed_at || o.created_at).toLocaleDateString()} — $${formatPrice(Number(o.total_amount || 0))}`,
      }))
  }, [ordersListData])

  const selectedOrderStatus = useMemo(() => {
    if (!createForm.orderId) return null
    if (orderForDispute?.order?.id === createForm.orderId) return orderForDispute.order.status
    if (selectedOrderDetail?.order?.id === createForm.orderId)
      return selectedOrderDetail.order.status
    return ordersListData?.orders?.find((o) => o.id === createForm.orderId)?.status ?? null
  }, [createForm.orderId, orderForDispute, selectedOrderDetail, ordersListData])

  const selectedOrderIneligible =
    Boolean(createForm.orderId) && !isOrderEligibleForDispute(selectedOrderStatus)

  const orderFromUrlIneligible =
    Boolean(orderIdFromUrl) &&
    orderForDispute?.order?.id === orderIdFromUrl &&
    !isOrderEligibleForDispute(orderForDispute.order.status)

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
    setCreateForm((f) => ({
      ...f,
      orderId: orderIdFromUrl,
      supplierId: supplierIdFromUrl || f.supplierId,
    }))
    setDisputeDialogOrderId(orderIdFromUrl)
  }, [orderIdFromUrl, supplierIdFromUrl, isSupplier])

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
        <PageHeader title="Disputes" />
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            Disputes & returns are not on your plan. Upgrade to manage delivery issues and credits.
          </CardContent>
        </Card>
      </div>
    )
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
    <RequirePermission
      permission={isSupplier ? 'FULFILLMENT_VIEW' : 'ORDERS_VIEW'}
      title="disputes"
    >
      <div className="page-stack">
        <PageHeader
          title="Disputes"
          description={
            isSupplier ? 'Incoming disputes from restaurants' : 'Open and track order disputes'
          }
          actions={
            !isSupplier ? (
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setCreateForm({
                    orderId: '',
                    supplierId: '',
                    type: 'short_delivery',
                    description: '',
                    disputedAmount: '',
                  })
                  setShowCreate(true)
                }}
              >
                Open dispute
              </Button>
            ) : undefined
          }
        />

        <Card className="overflow-visible">
          <CardContent className="px-4 py-4 sm:px-6 sm:py-6">
            <div className="flex w-full max-w-md flex-col gap-2">
              <Label>Status filter</Label>
              <select
                className={FORM_SELECT_CLASS}
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

        <Card className="overflow-visible">
          <CardHeader className="px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
            <CardTitle>{isSupplier ? 'Incoming' : 'My disputes'}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-[var(--text-muted)]">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-mid)]" />
              </div>
            ) : disputes.length === 0 ? (
              <EmptyState
                title="No disputes found"
                description={
                  statusFilter
                    ? 'Try clearing the status filter to see more results.'
                    : 'Disputes opened from receiving or order issues will appear here.'
                }
                icon={<Scale className="h-6 w-6" aria-hidden />}
              />
            ) : (
              <>
                <DisputeListCards
                  disputes={disputes as DisputeRow[]}
                  isSupplier={isSupplier}
                  formatAmount={(n) => `$${formatPrice(n)}`}
                  onReview={isSupplier && canManageSupplierDisputes ? handleReview : undefined}
                  onResolve={
                    isSupplier && canManageSupplierDisputes ? (id) => setResolveId(id) : undefined
                  }
                  onReject={
                    isSupplier && canManageSupplierDisputes ? (id) => setRejectId(id) : undefined
                  }
                />
                <TableScroll aria-label="Disputes table" className="hidden md:block">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--brand-ultra)]/40 text-left text-[var(--text-muted)]">
                        <th className="px-4 py-3 pl-5 font-medium">Order</th>
                        {isSupplier && <th className="px-4 py-3 font-medium">Restaurant</th>}
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Amount</th>
                        <th className="px-4 py-3 pr-5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disputes.map((row) => {
                        const dispute = row as DisputeRow
                        const orderId = dispute.orderId || dispute.order_id
                        const disputedAmount = dispute.disputedAmount ?? dispute.disputed_amount
                        return (
                          <tr
                            key={String(dispute.id)}
                            className="border-b border-[var(--app-border)]"
                          >
                            <td className="px-4 py-3 pl-5">
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
                            {isSupplier && (
                              <td className="px-4 py-3 text-sm">
                                {String(dispute.restaurantName ?? dispute.restaurant_name ?? '—')}
                              </td>
                            )}
                            <td className="px-4 py-3 capitalize">
                              <Link
                                to={`/app/disputes/${dispute.id}`}
                                className="text-[var(--brand-mid)] hover:underline"
                              >
                                {String(dispute.type || '').replace(/_/g, ' ')}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={statusBadge(String(dispute.status))}>
                                {String(dispute.status)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              {disputedAmount != null
                                ? `$${formatPrice(Number(disputedAmount))}`
                                : '—'}
                            </td>
                            <td className="px-4 py-3 pr-5 text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                {isSupplier &&
                                  canManageSupplierDisputes &&
                                  dispute.status === 'open' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReview(String(dispute.id))}
                                    >
                                      Review
                                    </Button>
                                  )}
                                {isSupplier &&
                                  canManageSupplierDisputes &&
                                  (dispute.status === 'open' ||
                                    dispute.status === 'under_review') && (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => setResolveId(String(dispute.id))}
                                      >
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
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            setShowCreate(open)
            if (!open) {
              setCreateForm({
                orderId: '',
                supplierId: '',
                type: 'short_delivery',
                description: '',
                disputedAmount: '',
              })
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open dispute</DialogTitle>
              <DialogDescription>
                Report delivery, quality, or billing issues for an order that has been delivered or
                received.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {(orderFromUrlIneligible || selectedOrderIneligible) && (
                <p className="text-sm text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
                  {disputeEligibilityMessage(
                    orderFromUrlIneligible ? orderForDispute?.order?.status : selectedOrderStatus
                  )}
                </p>
              )}
              <div>
                <Label>Order</Label>
                <select
                  className={FORM_SELECT_CLASS}
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
                  <option value="">
                    {loadingOrders
                      ? 'Loading orders…'
                      : orderOptions.length === 0
                        ? 'No eligible delivered orders'
                        : 'Select an order'}
                  </option>
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
                  className={FORM_SELECT_CLASS}
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
              <p className="text-sm text-[var(--text-muted)]">
                Next you can select specific line items and quantities (e.g. received 1 of 3
                products).
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!createForm.orderId) {
                    toast.error('Order is required')
                    return
                  }
                  if (!createForm.supplierId) {
                    toast.error('Supplier is required')
                    return
                  }
                  if (selectedOrderIneligible) {
                    toast.error(disputeEligibilityMessage(selectedOrderStatus))
                    return
                  }
                  setDisputeDialogOrderId(createForm.orderId)
                  setShowCreate(false)
                }}
                disabled={selectedOrderIneligible || !createForm.orderId || !createForm.supplierId}
              >
                Continue
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
                  className={FORM_SELECT_CLASS}
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
              <Button className="w-full sm:w-auto" onClick={handleResolve} disabled={resolving}>
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
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={handleReject}
                disabled={rejecting}
              >
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!isSupplier && disputeDialogOrderId && (
          <OpenDisputeDialog
            open={Boolean(disputeDialogOrderId)}
            onOpenChange={(open) => {
              if (!open) {
                setDisputeDialogOrderId(null)
                setSearchParams({})
              }
            }}
            orderId={disputeDialogOrderId}
            defaultSupplierId={createForm.supplierId || supplierIdFromUrl}
            onCreated={() => {
              setDisputeDialogOrderId(null)
              refetch()
            }}
          />
        )}
      </div>
    </RequirePermission>
  )
}
