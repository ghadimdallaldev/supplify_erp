import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useGetOrderQuery,
  useGetOrderAmendmentsQuery,
  useGetEntitlementsQuery,
  useCreateOrderAmendmentMutation,
  useAcceptOrderAmendmentMutation,
  useRejectOrderAmendmentMutation,
  useCancelOrderAmendmentMutation,
} from '../../../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Package, Printer, Download, Edit } from 'lucide-react'
import { isEntitlementFeatureEnabled } from '../../../lib/planLimits'
import { useImpersonation } from '../../../hooks/useImpersonation'
import toast from 'react-hot-toast'
import { formatPrice } from '../../../utils/format'
import {
  getOrderStatusColor,
  OrderDetailTabLoading,
  usePackingSlipActions,
} from './orderDetailShared'

export interface OrderDetailsTabProps {
  orderId: string
}

export function OrderDetailsTab({ orderId }: OrderDetailsTabProps) {
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { data, isLoading, refetch } = useGetOrderQuery(orderId)
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const amendmentsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'order_amendments'
  )
  const { data: amendmentsData, refetch: refetchAmendments } = useGetOrderAmendmentsQuery(orderId)
  const [createAmendment] = useCreateOrderAmendmentMutation()
  const [acceptAmendment] = useAcceptOrderAmendmentMutation()
  const [rejectAmendment] = useRejectOrderAmendmentMutation()
  const [cancelAmendment] = useCancelOrderAmendmentMutation()
  const [showAmendmentForm, setShowAmendmentForm] = useState(false)
  const [amendmentDescription, setAmendmentDescription] = useState('')
  const { downloadingPdf, printingPdf, handlePrintPackingSlip, handleDownloadPackingSlipPdf } =
    usePackingSlipActions(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order
  const orderAny = order as Record<string, unknown>
  const promotionInfo = (orderAny.promotion || orderAny.applied_promotion) as
    | {
        promotionName?: string
        discountAmount?: number
        promotion_name?: string
        discount_amount?: number
      }
    | undefined
  const itemsSubtotal = (order.items || []).reduce((s, i) => s + Number(i.line_total || 0), 0)
  const promotionDiscount =
    Number(promotionInfo?.discountAmount ?? promotionInfo?.discount_amount) ||
    (itemsSubtotal > Number(order.total_amount) && Number(order.total_amount) > 0
      ? itemsSubtotal - Number(order.total_amount)
      : 0)
  const amendments = amendmentsData?.amendments || []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Order ID</p>
                <p className="font-medium">{order.id}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">Status</p>
                <Badge variant={getOrderStatusColor(order.status)}>{order.status}</Badge>
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">Created</p>
                <p className="font-medium">{new Date(order.created_at).toLocaleString()}</p>
              </div>
              {order.placed_at && (
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Placed</p>
                  <p className="font-medium">{new Date(order.placed_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {order.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Order Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{order.notes}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Amendments</CardTitle>
            {!['CANCELLED', 'COMPLETED'].includes(order.status) && amendmentsEnabled && (
              <Button size="sm" variant="outline" onClick={() => setShowAmendmentForm((v) => !v)}>
                Request change
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {showAmendmentForm && (
              <div className="space-y-2">
                <Input
                  placeholder="Describe the requested change"
                  value={amendmentDescription}
                  onChange={(e) => setAmendmentDescription(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!amendmentDescription.trim()) {
                      toast.error('Description required')
                      return
                    }
                    try {
                      await createAmendment({
                        orderId: order.id,
                        body: {
                          changeType: 'other',
                          description: amendmentDescription,
                        },
                      }).unwrap()
                      toast.success('Amendment requested')
                      setAmendmentDescription('')
                      setShowAmendmentForm(false)
                      refetchAmendments()
                    } catch (e: unknown) {
                      const err = e as { data?: { error?: { message?: string } } }
                      toast.error(err?.data?.error?.message || 'Failed to request amendment')
                    }
                  }}
                >
                  Submit
                </Button>
              </div>
            )}
            {amendments.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No amendments on this order.</p>
            ) : (
              amendments.map((a) => (
                <div
                  key={String(a.id)}
                  className="rounded-lg border border-[var(--app-border)] p-3 text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">
                      {String(a.change_type || a.changeType).replace(/_/g, ' ')}
                    </span>
                    <Badge variant="outline">{String(a.status)}</Badge>
                  </div>
                  <p className="text-[var(--text-muted)] mt-1">{String(a.description)}</p>
                  {a.status === 'pending' && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await acceptAmendment({
                            orderId: order.id,
                            amendmentId: String(a.id),
                          }).unwrap()
                          toast.success('Amendment accepted')
                          refetchAmendments()
                          refetch()
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const notes = window.prompt('Rejection notes')
                          if (!notes) return
                          await rejectAmendment({
                            orderId: order.id,
                            amendmentId: String(a.id),
                            responseNotes: notes,
                          }).unwrap()
                          toast.success('Amendment rejected')
                          refetchAmendments()
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await cancelAmendment({
                            orderId: order.id,
                            amendmentId: String(a.id),
                          }).unwrap()
                          refetchAmendments()
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Subtotal</span>
              <span>
                $
                {formatPrice(
                  promotionDiscount > 0
                    ? Number(order.total_amount) + promotionDiscount
                    : order.total_amount
                )}
              </span>
            </div>
            {promotionDiscount > 0 ? (
              <div className="flex items-center justify-between text-sm text-[var(--mint)]">
                <span>
                  Deal discount
                  {promotionInfo?.promotionName || promotionInfo?.promotion_name
                    ? ` (${promotionInfo.promotionName || promotionInfo.promotion_name})`
                    : ''}
                </span>
                <span>-${formatPrice(promotionDiscount)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Shipping</span>
              <span>$0.00</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Tax</span>
              <span>$0.00</span>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between font-semibold text-lg">
                <span>Total</span>
                <span>${formatPrice(order.total_amount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!isSupplier && (order.status === 'COMPLETED' || order.status === 'DELIVERED') && (
              <Button className="w-full" variant="default" asChild>
                <Link to={`/app/receiving?order=${order.id}`}>
                  <Package className="h-4 w-4 mr-2" />
                  Receive this order
                </Link>
              </Button>
            )}
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handlePrintPackingSlip()}
              disabled={printingPdf}
            >
              <Printer className="h-4 w-4 mr-2" />
              {printingPdf ? 'Preparing…' : 'Print Packing Slip'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={handleDownloadPackingSlipPdf}
              disabled={downloadingPdf}
            >
              <Download className="h-4 w-4 mr-2" />
              {downloadingPdf ? 'Downloading...' : 'Download PDF'}
            </Button>
            {isSupplier && (
              <Button className="w-full" variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Add Internal Note
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
