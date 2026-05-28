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
import { featureEnabled } from '../../lib/planLimits'
import { formatPrice } from '../../utils/format'
import { formatOrderRef } from '../../lib/orderPlacement'
import { PageHeader } from '../../components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
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
import { ArrowLeft, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

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

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = featureEnabled(entitlementsData?.entitlements?.features?.disputes_returns)

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
      <div className="space-y-4">
        <PageHeader title="Dispute" />
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            Disputes are not on your plan.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error || !data?.dispute) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/disputes">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to disputes
          </Link>
        </Button>
        <p className="text-[var(--red)]">Dispute not found or you do not have access.</p>
      </div>
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
    <div className="space-y-6">
      <Button variant="outline" size="sm" asChild>
        <Link to="/app/disputes">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to disputes
        </Link>
      </Button>

      <PageHeader
        title="Dispute details"
        description={`${String(dispute.type || '').replace(/_/g, ' ')} · ${status.replace(/_/g, ' ')}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {isSupplier && status === 'open' && (
              <Button size="sm" variant="outline" onClick={handleReview}>
                Mark under review
              </Button>
            )}
            {isSupplier && (status === 'open' || status === 'under_review') && (
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disputed line items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="py-2">Product</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={String(item.id)} className="border-b border-[var(--app-border)]">
                      <td className="py-2">
                        {String(item.product_name ?? item.productName ?? '—')}
                      </td>
                      <td>{item.quantity_ordered ?? item.quantityOrdered ?? '—'}</td>
                      <td>{item.quantity_received ?? item.quantityReceived ?? '—'}</td>
                      <td className="text-[var(--text-muted)]">
                        {String(item.issue_description ?? item.issueDescription ?? '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              <div key={String(cn.id)} className="flex justify-between border-b py-2 last:border-0">
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
    </div>
  )
}
