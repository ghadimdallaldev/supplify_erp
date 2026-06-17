import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useGetDisputeQuery,
  useGetEntitlementsQuery,
  useReviewDisputeMutation,
  useResolveDisputeMutation,
  useRejectDisputeMutation,
  useCancelDisputeMutation,
} from '../../services/api'
import { useImpersonation } from '../../hooks/useImpersonation'
import { usePermissions } from '../../hooks/usePermissions'
import { RequirePermission } from '../../components/RequirePermission'
import { isEntitlementFeatureEnabled } from '../../lib/planLimits'
import { formatPrice } from '../../utils/format'
import { formatOrderRef } from '../../lib/orderPlacement'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select, SelectTrigger } from '../../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { TableScroll } from '../../components/ui/table-scroll'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function statusBadge(status: string) {
  const s = status?.toLowerCase()
  if (s === 'resolved') return 'default'
  if (s === 'rejected' || s === 'cancelled') return 'destructive'
  if (s === 'under_review') return 'secondary'
  return 'outline'
}

export function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { can } = usePermissions()
  const canManageSupplierDisputes = can('FULFILLMENT_MANAGE')

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )

  const { data, isLoading, error, refetch } = useGetDisputeQuery(id!, { skip: !id })
  const [reviewDispute] = useReviewDisputeMutation()
  const [resolveDispute, { isLoading: resolving }] = useResolveDisputeMutation()
  const [rejectDispute, { isLoading: rejecting }] = useRejectDisputeMutation()
  const [cancelDispute, { isLoading: cancelling }] = useCancelDisputeMutation()

  const [resolveOpen, setResolveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [resolutionType, setResolutionType] = useState('credit_note')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [creditAmount, setCreditAmount] = useState('')

  if (!disputesEnabled) {
    return (
      <PageShell className="space-y-4" data-testid="dispute-detail-page">
        <PageHeader title="Dispute" />
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            Disputes are not on your plan.
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  if (isLoading) {
    return (
      <PageShell data-testid="dispute-detail-page">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageShell>
    )
  }

  if (error || !data?.dispute) {
    return (
      <PageShell className="space-y-4" data-testid="dispute-detail-page">
        <PageHeader
          title="Dispute"
          breadcrumb={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/disputes">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to disputes
              </Link>
            </Button>
          }
        />
        <p className="text-[var(--red)]">Dispute not found or you do not have access.</p>
      </PageShell>
    )
  }

  const dispute = data.dispute as Record<string, unknown>
  const items = (data.items as Array<Record<string, unknown>>) ?? []
  const creditNotes = (data.creditNotes as Array<Record<string, unknown>>) ?? []
  const replacementOrder = data.replacementOrder as Record<string, unknown> | null | undefined
  const replacementOrderId = String(
    dispute.replacementOrderId ?? dispute.replacement_order_id ?? replacementOrder?.id ?? ''
  )
  const orderId = String(dispute.orderId ?? dispute.order_id ?? '')
  const status = String(dispute.status ?? '')
  const disputedAmount = dispute.disputedAmount ?? dispute.disputed_amount

  const handleReview = async () => {
    try {
      await reviewDispute(id!).unwrap()
      toast.success('Marked under review')
      refetch()
    } catch {
      toast.error('Failed to update dispute')
    }
  }

  const handleResolve = async () => {
    try {
      await resolveDispute({
        id: id!,
        body: {
          resolutionType,
          resolutionNotes: resolutionNotes || undefined,
          creditNoteAmount: creditAmount ? Number(creditAmount) : undefined,
        },
      }).unwrap()
      toast.success('Dispute resolved')
      setResolveOpen(false)
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to resolve')
    }
  }

  const handleReject = async () => {
    if (!resolutionNotes.trim()) {
      toast.error('Notes are required when rejecting')
      return
    }
    try {
      await rejectDispute({ id: id!, resolutionNotes }).unwrap()
      toast.success('Dispute rejected')
      setRejectOpen(false)
      setResolutionNotes('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to reject')
    }
  }

  const handleCancel = async () => {
    try {
      await cancelDispute(id!).unwrap()
      toast.success('Dispute cancelled')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to cancel')
    }
  }

  return (
    <RequirePermission
      permission={isSupplier ? 'FULFILLMENT_VIEW' : 'ORDERS_VIEW'}
      title="dispute details"
    >
      <PageShell className="space-y-6" data-testid="dispute-detail-page">
        <PageHeader
          title="Dispute details"
          description={`${String(dispute.type || '').replace(/_/g, ' ')} · ${status.replace(/_/g, ' ')}`}
          breadcrumb={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/disputes">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to disputes
              </Link>
            </Button>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {isSupplier && canManageSupplierDisputes && status === 'open' && (
                <Button size="sm" variant="outline" onClick={handleReview}>
                  Mark under review
                </Button>
              )}
              {isSupplier &&
                canManageSupplierDisputes &&
                (status === 'open' || status === 'under_review') && (
                  <>
                    <Button size="sm" onClick={() => setResolveOpen(true)}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
                      Reject
                    </Button>
                  </>
                )}
              {!isSupplier && status === 'open' && (
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={cancelling}>
                  Cancel dispute
                </Button>
              )}
            </div>
          }
        />

        {replacementOrderId && (
          <Card className="border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20">
            <CardHeader>
              <CardTitle className="text-base">Replacement order created</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-[var(--text-muted)]">
                The supplier resolved this dispute by shipping replacement goods on a new order.
              </p>
              <Button size="sm" asChild>
                <Link to={`/app/orders/${replacementOrderId}`}>
                  View replacement order {formatOrderRef(replacementOrderId)}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Status</span>
                <Badge variant={statusBadge(status)}>{status}</Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Order</span>
                {orderId ? (
                  <Link
                    to={`/app/orders/${orderId}`}
                    className="text-[var(--brand-mid)] hover:underline font-mono"
                  >
                    {formatOrderRef(orderId)}
                  </Link>
                ) : (
                  '—'
                )}
              </div>
              {isSupplier && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Restaurant</span>
                  <span>{String(dispute.restaurantName ?? dispute.restaurant_name ?? '—')}</span>
                </div>
              )}
              {!isSupplier && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Supplier</span>
                  <span>{String(dispute.supplierName ?? dispute.supplier_name ?? '—')}</span>
                </div>
              )}
              {disputedAmount != null && Number(disputedAmount) > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Disputed amount</span>
                  <span>${formatPrice(Number(disputedAmount))}</span>
                </div>
              )}
              {dispute.orderStatus != null && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Order status</span>
                  <span>
                    {String(dispute.orderStatus ?? dispute.order_status).replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{String(dispute.description || '—')}</p>
              {dispute.resolutionNotes != null || dispute.resolution_notes != null ? (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-[var(--text-muted)] mb-1">Resolution notes</p>
                  <p className="text-sm whitespace-pre-wrap">
                    {String(dispute.resolutionNotes ?? dispute.resolution_notes)}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {items.length > 0 && (
          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle className="text-base">Disputed line items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-6 sm:pt-0">
              <div className="space-y-2 md:hidden">
                {items.map((item) => (
                  <div
                    key={String(item.id)}
                    className="rounded-lg border border-[var(--app-border)] p-3 text-sm"
                  >
                    <p className="font-medium">
                      {String(item.product_name ?? item.productName ?? '—')}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
                      <span>
                        Ordered: {String(item.quantity_ordered ?? item.quantityOrdered ?? '—')}
                      </span>
                      <span>
                        Received: {String(item.quantity_received ?? item.quantityReceived ?? '—')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {String(item.issue_description ?? item.issueDescription ?? '—')}
                    </p>
                  </div>
                ))}
              </div>
              <TableScroll aria-label="Disputed line items" className="hidden md:block">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--brand-ultra)]/40 text-left text-[var(--text-muted)]">
                      <th className="px-4 py-3 pl-5 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium">Ordered</th>
                      <th className="px-4 py-3 font-medium">Received</th>
                      <th className="px-4 py-3 pr-5 font-medium">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={String(item.id)} className="border-b border-[var(--app-border)]">
                        <td className="px-4 py-3 pl-5">
                          {String(item.product_name ?? item.productName ?? '—')}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {String(item.quantity_ordered ?? item.quantityOrdered ?? '—')}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {String(item.quantity_received ?? item.quantityReceived ?? '—')}
                        </td>
                        <td className="px-4 py-3 pr-5 text-[var(--text-muted)]">
                          {String(item.issue_description ?? item.issueDescription ?? '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </CardContent>
          </Card>
        )}

        {creditNotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Credit notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {creditNotes.map((cn) => (
                <div
                  key={String(cn.id)}
                  className="flex justify-between border-b py-2 last:border-0"
                >
                  <span>{String(cn.credit_note_number ?? cn.creditNoteNumber ?? cn.id)}</span>
                  <span>${formatPrice(Number(cn.credit_amount ?? cn.creditAmount ?? 0))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resolve dispute</DialogTitle>
              <DialogDescription>
                Choose how to close this dispute for the restaurant.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Resolution</Label>
                <Select value={resolutionType} onValueChange={setResolutionType}>
                  <SelectTrigger>
                    <option value="credit_note">Credit note</option>
                    <option value="replacement">Replacement</option>
                    <option value="refund">Refund</option>
                    <option value="no_action">No action</option>
                  </SelectTrigger>
                </Select>
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

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject dispute</DialogTitle>
              <DialogDescription>Explain why this dispute is rejected.</DialogDescription>
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
      </PageShell>
    </RequirePermission>
  )
}
