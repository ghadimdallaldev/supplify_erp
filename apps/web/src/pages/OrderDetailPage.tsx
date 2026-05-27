import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  useGetOrderQuery,
  useUpdateOrderMutation,
  useGetOrderInvoicesQuery,
  useSendOrderReminderMutation,
  useGetEntitlementsQuery,
  useGetOrderAmendmentsQuery,
  useCreateOrderAmendmentMutation,
  useAcceptOrderAmendmentMutation,
  useRejectOrderAmendmentMutation,
  useCancelOrderAmendmentMutation,
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
  useGetReceivingHistoryQuery,
  useGetCreditNotesQuery,
} from '../services/api'
import { Link as RouterLink } from 'react-router-dom'
import { featureEnabled } from '../lib/planLimits'
import { isOrderEligibleForDispute } from '../lib/orderDisputeEligibility'
import { getActiveDisputeForOrder, getDisputesForOrder } from '../lib/disputeHelpers'
import { OrderDisputeBanner } from '../components/disputes/OrderDisputeBanner'
import { OpenDisputeDialog } from '../components/disputes/OpenDisputeDialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Package,
  FileText,
  Truck,
  AlertCircle,
  Printer,
  Download,
  Edit,
  Check,
  X,
  ClipboardList,
  MapPin,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import toast from 'react-hot-toast'
import { formatPrice } from '../utils/format'
import { buildOrderTimeline } from '../lib/orderTimeline'
import { OrderOperationsTimeline } from '../components/orders/OrderOperationsTimeline'
import { DeclineOrderDialog } from '../components/orders/DeclineOrderDialog'
import { getOrderCancellationBanner, getOrderStatusLabel } from '../lib/orderStatusDisplay'
import { formatOrderRef, isDisputeReplacementOrder } from '../lib/orderPlacement'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function formatAddressLines(address?: Record<string, string | undefined> | null): string[] {
  if (!address || typeof address !== 'object') return []
  const lines: string[] = []
  if (address.street) lines.push(address.street)
  const cityLine = [address.city, address.region, address.postalCode || address.zip]
    .filter(Boolean)
    .join(', ')
  if (cityLine) lines.push(cityLine)
  if (address.country) lines.push(address.country)
  return lines
}

function formatOperatingHours(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object') return null
  const entries = Object.entries(hours as Record<string, { open?: string; close?: string }>)
  if (!entries.length) return null
  return entries
    .map(([day, window]) => `${day}: ${window?.open ?? '—'} – ${window?.close ?? '—'}`)
    .join('; ')
}

const VALID_ORDER_TABS = [
  'timeline',
  'details',
  'items',
  'invoice',
  'picking',
  'delivery',
  'packing',
] as const

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const isSupplier = user?.role === 'SUPPLIER'
  const canDeclineOrder = can('ORDERS_MANAGE')
  const canOpenDispute = can('ORDERS_CREATE') || can('RECEIVING_MANAGE')
  const [activeTab, setActiveTab] = useState<string>('timeline')
  const [showPickingNotes, setShowPickingNotes] = useState(false)
  const [showDeliveryNotes, setShowDeliveryNotes] = useState(false)
  const [showOpenDispute, setShowOpenDispute] = useState(false)

  useEffect(() => {
    if (tabFromUrl && VALID_ORDER_TABS.includes(tabFromUrl as (typeof VALID_ORDER_TABS)[number])) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  const { data, isLoading, error, refetch } = useGetOrderQuery(id!)
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const amendmentsEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.order_amendments
  )
  const disputesEnabled = featureEnabled(entitlementsData?.entitlements?.features?.disputes_returns)
  const {
    data: invoicesData,
    isLoading: isLoadingInvoices,
    refetch: refetchInvoices,
  } = useGetOrderInvoicesQuery(id!, { skip: !id })
  const { data: amendmentsData, refetch: refetchAmendments } = useGetOrderAmendmentsQuery(id!, {
    skip: !id,
  })
  const { data: disputesData } = useGetDisputesQuery(undefined, {
    skip: !id || isSupplier || !disputesEnabled,
  })
  const { data: incomingDisputesData } = useGetIncomingDisputesQuery(undefined, {
    skip: !id || !isSupplier || !disputesEnabled,
  })
  const { data: receivingHistoryData } = useGetReceivingHistoryQuery(undefined, {
    skip: !id || isSupplier,
  })
  const { data: creditNotesData } = useGetCreditNotesQuery(undefined, {
    skip: !id || !disputesEnabled,
  })
  const [createAmendment] = useCreateOrderAmendmentMutation()
  const [acceptAmendment] = useAcceptOrderAmendmentMutation()
  const [rejectAmendment] = useRejectOrderAmendmentMutation()
  const [cancelAmendment] = useCancelOrderAmendmentMutation()
  const [updateOrder] = useUpdateOrderMutation()
  const [sendReminder, { isLoading: isSendingReminder }] = useSendOrderReminderMutation()
  const [showAmendmentForm, setShowAmendmentForm] = useState(false)
  const [amendmentDescription, setAmendmentDescription] = useState('')
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PLACED':
        return 'default'
      case 'ACKNOWLEDGED':
        return 'secondary'
      case 'PROCESSING':
        return 'default'
      case 'SHIPPED':
        return 'default'
      case 'DELIVERED':
        return 'default'
      case 'COMPLETED':
        return 'default'
      case 'CANCELLED':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const [isUpdating, setIsUpdating] = useState(false)

  const handleStatusUpdate = async (
    newStatus: string,
    extra?: { decline_reason?: string; cancel_reason?: string }
  ) => {
    if (!id || isUpdating) return // Prevent multiple clicks

    try {
      setIsUpdating(true) // Set immediately - button will be replaced by disabled button
      await updateOrder({ id, data: { status: newStatus, ...extra } }).unwrap()
      const successLabel =
        newStatus === 'CANCELLED' && isSupplier
          ? 'Order declined'
          : `Order status updated to ${newStatus}`
      toast.success(successLabel)

      // Refetch to get updated data
      const refetchResult = await refetch()

      // After delivery, keep disabled "Delivered" button visible until refetch settles
      if (newStatus === 'DELIVERED' || newStatus === 'COMPLETED') {
        const updated = refetchResult.data?.status
        if (updated === 'DELIVERED' || updated === 'COMPLETED') {
          setTimeout(() => {
            setIsUpdating(false)
          }, 1000)
        }
      } else {
        // For other statuses, clear immediately
        setIsUpdating(false)
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update order status')
      setIsUpdating(false)
    }
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [printingPdf, setPrintingPdf] = useState(false)

  const fetchPackingSlipPdfBlob = async () => {
    if (!id) throw new Error('Missing order id')
    const res = await fetch(`${API_URL}/api/orders/${id}/packing-slip/pdf`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to fetch packing slip PDF')
    return res.blob()
  }

  const handlePrintPackingSlip = async () => {
    if (!id || printingPdf) return
    setPrintingPdf(true)
    try {
      const blob = await fetchPackingSlipPdfBlob()
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank')
      if (!printWindow) {
        URL.revokeObjectURL(url)
        toast.error('Allow pop-ups to print the packing slip')
        return
      }
      printWindow.addEventListener('load', () => {
        printWindow.focus()
        printWindow.print()
      })
      toast.success('Opening packing slip for printing…')
    } catch {
      toast.error('Could not print packing slip')
    } finally {
      setPrintingPdf(false)
    }
  }

  const handleDownloadPackingSlipPdf = async () => {
    if (!id || downloadingPdf) return
    setDownloadingPdf(true)
    try {
      const blob = await fetchPackingSlipPdfBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Packing slip PDF downloaded')
    } catch {
      toast.error('Could not download packing slip PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleSendReminder = async () => {
    if (!id || isSendingReminder) return

    try {
      await sendReminder(id).unwrap()
      toast.success('Reminder sent to supplier successfully')
      refetch() // Refresh order data to update reminder count
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to send reminder')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Order not found</p>
      </div>
    )
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
  const deliveryAddress = (order as any).branch_address ?? (order as any).restaurant_address
  const deliveryInstructions =
    (order as any).branch_delivery_instructions ?? (order as any).restaurant_delivery_instructions
  const deliveryPhone = (order as any).branch_phone ?? (order as any).restaurant_phone
  const addressLines = formatAddressLines(deliveryAddress)
  const operatingHoursLabel = formatOperatingHours((order as any).restaurant_operating_hours)

  const cancellationBanner = getOrderCancellationBanner(
    order,
    isSupplier ? 'SUPPLIER' : 'RESTAURANT'
  )
  const statusLabel = getOrderStatusLabel(order, isSupplier ? 'SUPPLIER' : 'RESTAURANT')

  const allDisputes = isSupplier
    ? (incomingDisputesData?.disputes ?? [])
    : (disputesData?.disputes ?? [])
  const orderDisputes = getDisputesForOrder(allDisputes, order.id)
  const activeDispute = getActiveDisputeForOrder(allDisputes, order.id)
  const orderReceivingReports = (receivingHistoryData?.reports ?? []).filter(
    (report: Record<string, unknown>) => String(report.order_id ?? report.orderId) === order.id
  )
  const replacementOrders = (order as Record<string, unknown>).replacementOrders as
    | Array<Record<string, unknown>>
    | undefined
  const sourceDispute = (order as Record<string, unknown>).sourceDispute as
    | Record<string, unknown>
    | null
    | undefined
  const isReplacementOrder = isDisputeReplacementOrder(order as Record<string, unknown>)
  const sourceOrderId = String(
    (order as Record<string, unknown>).source_order_id ??
      (order as Record<string, unknown>).sourceOrderId ??
      ''
  )

  const timelineEvents = buildOrderTimeline({
    order,
    viewerRole: isSupplier ? 'SUPPLIER' : 'RESTAURANT',
    amendments,
    invoices: invoicesData?.invoices ?? [],
    disputes: orderDisputes,
    receivingReports: orderReceivingReports,
    creditNotes: creditNotesData?.creditNotes ?? [],
    replacementOrders: replacementOrders ?? [],
  })

  return (
    <div className="space-y-6 p-6">
      {cancellationBanner && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong>{cancellationBanner.title}</strong>
          {cancellationBanner.reason && (
            <p className="mt-1 text-red-800 whitespace-pre-wrap">{cancellationBanner.reason}</p>
          )}
        </div>
      )}
      {disputesEnabled && (
        <OrderDisputeBanner orderId={order.id} disputes={allDisputes} isSupplier={isSupplier} />
      )}
      {isReplacementOrder && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <strong>Replacement for dispute</strong>
          <p className="mt-1 text-sky-900/90 dark:text-sky-200/90">
            This order was created to ship missing or corrected goods from a resolved dispute.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {sourceOrderId && (
              <RouterLink
                to={`/app/orders/${sourceOrderId}`}
                className="text-[var(--brand-mid)] hover:underline font-medium"
              >
                Original order {formatOrderRef(sourceOrderId)}
              </RouterLink>
            )}
            {sourceDispute?.id && (
              <RouterLink
                to={`/app/disputes/${String(sourceDispute.id)}`}
                className="text-[var(--brand-mid)] hover:underline font-medium"
              >
                Dispute {formatOrderRef(sourceDispute.id)}
              </RouterLink>
            )}
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/orders">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Orders
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Order #{order.id.slice(-8).toUpperCase()}</h1>
            <p className="text-[var(--text-muted)]">{order.restaurant_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isReplacementOrder && (
            <Badge variant="secondary" className="text-sm">
              Replacement
            </Badge>
          )}
          <Badge variant={getStatusColor(order.status)} className="text-lg px-3 py-1">
            {statusLabel}
          </Badge>
          {!isSupplier && order.status === 'PLACED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendReminder}
              disabled={isSendingReminder}
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              {isSendingReminder
                ? 'Sending...'
                : order.reminder_count > 0
                  ? `Send Reminder (${order.reminder_count})`
                  : 'Send Reminder'}
            </Button>
          )}
          {!isSupplier &&
            canOpenDispute &&
            disputesEnabled &&
            isOrderEligibleForDispute(order.status) &&
            !activeDispute && (
              <Button size="sm" variant="outline" onClick={() => setShowOpenDispute(true)}>
                Open dispute
              </Button>
            )}
          {isSupplier && disputesEnabled && activeDispute && (
            <Button size="sm" variant="outline" asChild>
              <RouterLink to="/app/disputes">Manage dispute</RouterLink>
            </Button>
          )}
          {isSupplier && (
            <div className="flex gap-2 ml-4">
              {order.status === 'PLACED' && (
                <>
                  <Button size="sm" onClick={() => handleStatusUpdate('ACKNOWLEDGED')}>
                    Acknowledge
                  </Button>
                  {canDeclineOrder && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDeclineDialog(true)}
                      data-testid="order-decline"
                    >
                      Decline
                    </Button>
                  )}
                </>
              )}
              {order.status === 'ACKNOWLEDGED' && (
                <Button size="sm" onClick={() => handleStatusUpdate('PROCESSING')}>
                  Start Processing
                </Button>
              )}
              {order.status === 'PROCESSING' && (
                <Button size="sm" onClick={() => handleStatusUpdate('SHIPPED')}>
                  Mark as Shipped
                </Button>
              )}
              {order.status === 'SHIPPED' && !isUpdating && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleStatusUpdate('DELIVERED')}
                  disabled={false}
                >
                  Mark Delivered
                </Button>
              )}
              {(isUpdating || order.status === 'DELIVERED' || order.status === 'COMPLETED') && (
                <Button
                  size="sm"
                  variant={
                    order.status === 'DELIVERED' || order.status === 'COMPLETED'
                      ? 'outline'
                      : 'default'
                  }
                  disabled
                  className="cursor-not-allowed opacity-75"
                >
                  {isUpdating ? (
                    <>Updating...</>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Delivered
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="details">Order Details</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          {!isSupplier &&
            (invoicesData?.invoices?.length > 0 ||
              order.status === 'COMPLETED' ||
              order.status === 'DELIVERED') && (
              <TabsTrigger value="invoice">
                Invoice {invoicesData?.invoices?.length > 0 && `(${invoicesData.invoices.length})`}
              </TabsTrigger>
            )}
          {isSupplier && <TabsTrigger value="picking">Picking Notes</TabsTrigger>}
          {isSupplier && <TabsTrigger value="delivery">Delivery Info</TabsTrigger>}
          {isSupplier && <TabsTrigger value="packing">Packing Slip</TabsTrigger>}
        </TabsList>

        {/* Timeline Tab (default) */}
        <TabsContent value="timeline">
          <OrderOperationsTimeline
            events={timelineEvents}
            viewerRole={isSupplier ? 'SUPPLIER' : 'RESTAURANT'}
          />
        </TabsContent>

        {/* Order Details Tab */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Order Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Order ID</p>
                      <p className="font-medium">{order.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Status</p>
                      <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAmendmentForm((v) => !v)}
                    >
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
                        Promotion
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
                  {!isSupplier &&
                    (order.status === 'COMPLETED' || order.status === 'DELIVERED') && (
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
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
              <CardDescription>{order.items?.length || 0} items</CardDescription>
            </CardHeader>
            <CardContent>
              {(order as any).multiLocationFulfillment && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  This order is being fulfilled from multiple warehouse locations.
                </div>
              )}
              <div className="space-y-4">
                {order.items?.map((item: any, idx: number) => {
                  const assignment = ((order as any).warehouseAssignments || []).find(
                    (a: any) => a.order_item_id === item.id
                  )
                  return (
                    <div
                      key={item.id || idx}
                      className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h4 className="font-semibold text-lg">
                              {item.product_name || 'Product'}
                            </h4>
                            <Badge variant="outline">SKU: {item.product_sku || 'N/A'}</Badge>
                            {assignment && (
                              <Badge variant="secondary">
                                {assignment.warehouse_name} · {assignment.status}
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-[var(--text-muted)]">
                            <div>
                              <span className="font-medium">Quantity:</span> {item.quantity}
                            </div>
                            <div>
                              <span className="font-medium">Unit Price:</span> $
                              {formatPrice(item.unit_price)}
                            </div>
                            {item.supplier_name && (
                              <div>
                                <span className="font-medium">Supplier:</span> {item.supplier_name}
                              </div>
                            )}
                            {item.location && (
                              <div>
                                <span className="font-medium">Location:</span> {item.location}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-[var(--brand-mid)]">
                            ${formatPrice(item.line_total)}
                          </p>
                          <p className="text-sm text-[var(--text-muted)]">
                            {item.quantity} × ${formatPrice(item.unit_price)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoice Tab (Restaurant Only) */}
        {!isSupplier && (
          <TabsContent value="invoice">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Invoice{invoicesData?.invoices && invoicesData.invoices.length > 1
                        ? 's'
                        : ''}{' '}
                      {invoicesData?.invoices?.length > 0 && `(${invoicesData.invoices.length})`}
                    </CardTitle>
                    <CardDescription>
                      {order.status === 'COMPLETED' ||
                      order.status === 'DELIVERED' ||
                      order.status === 'RECEIVED_FULL'
                        ? 'Invoice details and payment information'
                        : 'Invoice will be generated after delivery and receiving'}
                    </CardDescription>
                  </div>
                  {invoicesData?.invoices?.length > 0 && (
                    <Button variant="outline" asChild>
                      <Link to="/app/invoices">
                        View All Invoices
                        <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
                      </Link>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingInvoices ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand)]"></div>
                  </div>
                ) : invoicesData?.invoices && invoicesData.invoices.length > 0 ? (
                  <div className="space-y-4">
                    {invoicesData.invoices.map((invoice: any) => {
                      const remaining =
                        parseFloat(invoice.total_amount || 0) - parseFloat(invoice.total_paid || 0)
                      const isOverdue =
                        invoice.due_date && new Date(invoice.due_date) < new Date() && remaining > 0

                      return (
                        <div
                          key={invoice.id}
                          className={`border rounded-lg p-6 hover:shadow-md transition-shadow ${
                            isOverdue ? 'border-red-300 bg-[var(--red-pale)]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-semibold">{invoice.invoice_number}</h3>
                                <Badge variant={getStatusColor(invoice.status)}>
                                  {invoice.status}
                                </Badge>
                                {isOverdue && <Badge variant="destructive">Overdue</Badge>}
                              </div>
                              <p className="text-sm text-[var(--text-muted)] font-medium">
                                {invoice.supplier_name}
                              </p>
                              <div className="flex gap-4 text-xs text-[var(--text-muted)] mt-2">
                                <span>
                                  Invoice Date:{' '}
                                  {new Date(invoice.invoice_date).toLocaleDateString()}
                                </span>
                                <span>
                                  Due Date: {new Date(invoice.due_date).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold">
                                ${formatPrice(invoice.total_amount)}
                              </p>
                              <p
                                className={`text-sm font-semibold ${remaining > 0 ? 'text-[var(--red)]' : 'text-[var(--mint)]'}`}
                              >
                                Balance: ${formatPrice(remaining)}
                              </p>
                              {parseFloat(String(invoice.total_paid || 0)) > 0 && (
                                <p className="text-xs text-[var(--mint)]">
                                  Paid: ${formatPrice(invoice.total_paid)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/app/invoices?invoice=${invoice.id}`}>
                                <FileText className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </Button>
                            {remaining > 0 && (
                              <Button size="sm" asChild>
                                <Link to={`/app/invoices?invoice=${invoice.id}&pay=true`}>
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  Pay Invoice
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : order.status === 'COMPLETED' || order.status === 'DELIVERED' ? (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                    <p className="text-lg font-semibold text-[var(--text)] mb-2">
                      Invoice Not Yet Generated
                    </p>
                    <p className="text-[var(--text-muted)]">
                      Invoice is created when the restaurant confirms receiving. Check back after
                      receipt is recorded.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                    <p className="text-lg font-semibold text-[var(--text)] mb-2">
                      Invoice Not Available
                    </p>
                    <p className="text-[var(--text-muted)]">
                      Invoice will be generated when the order is completed.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Picking Notes Tab (Supplier Only) */}
        {isSupplier && (
          <TabsContent value="picking">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5" />
                      Picking Notes & Labels
                    </CardTitle>
                    <CardDescription>Internal picking instructions and labels</CardDescription>
                  </div>
                  <Button onClick={() => handlePrintPackingSlip()}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Picking List
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.items?.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="border rounded-lg p-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-muted)]">Product</p>
                          <p className="font-semibold">{item.product_name}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            SKU: {item.product_sku}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-muted)]">Quantity</p>
                          <p className="text-lg font-bold">{item.quantity}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-muted)]">
                            Warehouse Location
                          </p>
                          <p className="font-medium">{item.location_code || 'Not assigned'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-muted)]">Lot/Expiry</p>
                          <p className="text-sm">—</p>
                        </div>
                      </div>
                      {item.picking_notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium text-[var(--text-muted)]">
                            Picking Notes:
                          </p>
                          <p className="text-sm">{item.picking_notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Delivery Info Tab (Supplier Only) */}
        {isSupplier && (
          <TabsContent value="delivery">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Delivery Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)] mb-1">
                      Delivery Time Window
                    </p>
                    <p className="text-sm">{operatingHoursLabel || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)] mb-1">
                      Access Instructions
                    </p>
                    <p className="text-sm">{deliveryInstructions || 'Not specified'}</p>
                  </div>
                  {deliveryPhone && (
                    <div>
                      <p className="text-sm font-medium text-[var(--text-muted)] mb-1">Contact</p>
                      <p className="text-sm">{deliveryPhone}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Delivery Address
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-medium">{order.restaurant_name}</p>
                    {(order as any).branch_name && (
                      <p className="text-sm text-[var(--text-muted)]">
                        Branch: {(order as any).branch_name}
                      </p>
                    )}
                    {addressLines.length > 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">
                        {addressLines.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">
                        No delivery address on file
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* Packing Slip Tab (Supplier Only) */}
        {isSupplier && (
          <TabsContent value="packing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Packing Slip
                    </CardTitle>
                    <CardDescription>Print-ready packing slip for shipping</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handlePrintPackingSlip()} disabled={printingPdf}>
                      <Printer className="h-4 w-4 mr-2" />
                      {printingPdf ? 'Preparing…' : 'Print'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDownloadPackingSlipPdf}
                      disabled={downloadingPdf}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {downloadingPdf ? 'Downloading...' : 'Download PDF'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-[var(--app-border-mid)] rounded-lg p-8 space-y-6">
                  {/* Header */}
                  <div className="text-center">
                    <h2 className="text-2xl font-bold">PACKING SLIP</h2>
                    <p className="text-sm text-[var(--text-muted)]">
                      Order #{order.id.slice(-8).toUpperCase()}
                    </p>
                  </div>

                  {/* Ship To */}
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm font-bold text-[var(--text-muted)] mb-2">SHIP TO:</p>
                      <p className="font-semibold">{order.restaurant_name}</p>
                      {addressLines.length > 0 ? (
                        addressLines.map((line) => (
                          <p key={line} className="text-sm">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">
                          No delivery address on file
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-muted)] mb-2">
                        ORDER DETAILS:
                      </p>
                      <p className="text-sm">
                        Order Date: {new Date(order.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-sm">Status: {order.status}</p>
                      <p className="text-sm">Items: {order.items?.length || 0}</p>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-[var(--app-border-mid)]">
                          <th className="text-left py-2 px-3 text-sm font-bold">Item</th>
                          <th className="text-left py-2 px-3 text-sm font-bold">SKU</th>
                          <th className="text-right py-2 px-3 text-sm font-bold">Qty</th>
                          <th className="text-right py-2 px-3 text-sm font-bold">Unit Price</th>
                          <th className="text-right py-2 px-3 text-sm font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items?.map((item: any, idx: number) => (
                          <tr key={item.id || idx} className="border-b">
                            <td className="py-3 px-3 text-sm">{item.product_name}</td>
                            <td className="py-3 px-3 text-sm text-[var(--text-muted)]">
                              {item.product_sku}
                            </td>
                            <td className="py-3 px-3 text-sm text-right">{item.quantity}</td>
                            <td className="py-3 px-3 text-sm text-right">
                              ${formatPrice(item.unit_price)}
                            </td>
                            <td className="py-3 px-3 text-sm text-right font-medium">
                              ${formatPrice(item.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="border-t-2 pt-4 flex justify-between">
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">
                        Thank you for your business!
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">Total: ${formatPrice(order.total_amount)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <DeclineOrderDialog
        open={showDeclineDialog}
        onOpenChange={setShowDeclineDialog}
        orderLabel={order.restaurant_name}
        isSubmitting={isUpdating}
        onConfirm={async (reason) => {
          await handleStatusUpdate('CANCELLED', { decline_reason: reason })
        }}
      />

      {!isSupplier && disputesEnabled && (
        <OpenDisputeDialog
          open={showOpenDispute}
          onOpenChange={setShowOpenDispute}
          orderId={order.id}
          onCreated={() => refetch()}
        />
      )}
    </div>
  )
}
