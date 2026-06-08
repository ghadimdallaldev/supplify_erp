import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { RequirePermission } from '../components/RequirePermission'
import {
  PackageCheck,
  History,
  Star,
  FileText,
  Loader2,
  Clock,
  AlertCircle,
  Truck,
  CheckCircle,
} from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  useGetPendingOrdersForReceivingQuery,
  useCreateReceivingReportMutation,
  useGetReceivingHistoryQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { FeatureLockedCard } from '../components/FeatureLockedCard'
import toast from 'react-hot-toast'
import { formatPrice } from '../utils/format'
import { isOrderReadyForReceiving } from '../lib/orderReceiving'
import {
  getQuantityUnitRules,
  normalizeReceivedQuantity,
  snapQuantityToUnit,
} from '../lib/quantityUnit'
import {
  disputeLineItemsFromReceiving,
  receivingFormToDisputeDrafts,
  supplierIdFromOrder,
  type DisputeLineItemDraft,
} from '../lib/disputeHelpers'
import { OpenDisputeDialog } from '../components/disputes/OpenDisputeDialog'

export function ReceivingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const orderIdFromUrl = searchParams.get('order')
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const { persona } = useWorkspaceRole()
  const receivingTitle = persona.pageCopy?.receiving?.title ?? 'Receiving & Quality Control'
  const receivingDescription =
    persona.pageCopy?.receiving?.description ??
    'Confirm deliveries, record quality issues, and open disputes when needed.'
  const canReceive = can('RECEIVING_MANAGE')
  const canOpenDispute = can('ORDERS_CREATE') || can('RECEIVING_MANAGE')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [openDisputeContext, setOpenDisputeContext] = useState<{
    orderId: string
    supplierId: string
    lineItems: DisputeLineItemDraft[]
    receivingReportId?: string
  } | null>(null)

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const receivingEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'receiving_quality'
  )
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )
  const canShowDispute = disputesEnabled && canOpenDispute

  const beginDisputeFromReceiving = (
    order: { id: string; items?: unknown[]; supplier_id?: string },
    formData: Record<string, unknown>,
    receivingReportId?: string
  ) => {
    const supplierId = supplierIdFromOrder(order as Parameters<typeof supplierIdFromOrder>[0])
    if (!supplierId) {
      toast.error('Could not determine supplier for this order')
      return
    }
    setOpenDisputeContext({
      orderId: order.id,
      supplierId,
      lineItems: receivingFormToDisputeDrafts(
        (order.items ?? []) as Array<Record<string, unknown>>,
        formData
      ),
      receivingReportId,
    })
  }

  // Load received order IDs from localStorage on mount
  const [receivingOrderIds, setReceivingOrderIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('receivingOrderIds')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    }
    return new Set()
  })

  // Update localStorage whenever receivingOrderIds changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('receivingOrderIds', JSON.stringify(Array.from(receivingOrderIds)))
    }
  }, [receivingOrderIds])

  const {
    data: pendingData,
    isLoading: pendingLoading,
    refetch: refetchPending,
  } = useGetPendingOrdersForReceivingQuery()
  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useGetReceivingHistoryQuery()
  const [createReport, { isLoading: isCreating }] = useCreateReceivingReportMutation()

  const handleReceive = (order: any) => {
    setSelectedOrder(order)
    setShowDialog(true)
  }

  const handleSubmitReceiving = async (formData: any) => {
    const orderId = selectedOrder.id
    try {
      // Add to receivingOrderIds to show "Processing..." state
      setReceivingOrderIds((prev) => new Set([...prev, orderId]))

      const result = await createReport({
        orderId: selectedOrder.id,
        lineItems: selectedOrder.items.map((item: any) => {
          const ordered = Number(item.ordered_quantity ?? 0)
          const rawReceived = Number(formData[`received_${item.id}`] ?? item.ordered_quantity ?? 0)
          const received = normalizeReceivedQuantity(rawReceived, ordered, item.unit)
          return {
            productId: item.product_id,
            orderItemId: item.id,
            product_name: item.product_name,
            sku: item.sku,
            ordered_quantity: ordered,
            received_quantity: received,
            unit: item.unit,
            expected_unit_price: item.unit_price,
            actual_unit_price: formData[`price_${item.id}`] || item.unit_price,
            quality_status: formData[`quality_${item.id}`] || 'ACCEPTED',
            notes: formData[`notes_${item.id}`] || '',
            expiryDate: formData[`expiry_${item.id}`] || undefined,
            batchLotNumber: formData[`batch_${item.id}`] || undefined,
            storageLocation: formData[`storage_${item.id}`] || undefined,
          }
        }),
        deliveryNotes: formData.deliveryNotes,
        qualityScore: formData.qualityScore,
        qualityNotes: formData.qualityNotes,
        receivedBy: user?.id,
      }).unwrap()

      setShowDialog(false)
      setSelectedOrder(null)

      const discrepancyItems = disputeLineItemsFromReceiving(selectedOrder.items ?? [], formData)
      const supplierId = supplierIdFromOrder(selectedOrder)
      const reportId = (result as { report?: { id?: string } })?.report?.id

      if (canShowDispute && discrepancyItems.length > 0 && supplierId) {
        toast(
          `Receiving saved. ${discrepancyItems.length} item(s) had issues — submit one dispute for the supplier.`,
          { icon: '⚠️', duration: 7000 }
        )
        setOpenDisputeContext({
          orderId,
          supplierId,
          lineItems: discrepancyItems,
          receivingReportId: reportId,
        })
      } else {
        toast.success('Receiving completed successfully')
      }

      // Wait a moment for database transaction to commit
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Refetch both pending and history
      const [refetchPendingResult, refetchHistoryResult] = await Promise.all([
        refetchPending(),
        refetchHistory(),
      ])

      // Check if order is now in history - retry if not found
      let historyCheckResult = refetchHistoryResult
      let reports = historyCheckResult?.data?.reports || []
      let reportFound = reports.some((r: any) => r.order_id === orderId)
      let retries = 0
      const maxRetries = 5

      while (!reportFound && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const retryResult = await refetchHistory()
        reports = retryResult?.data?.reports || []
        reportFound = reports.some((r: any) => r.order_id === orderId)

        if (reportFound) {
          historyCheckResult = retryResult
          break
        }
        retries++
      }

      // Order will be automatically removed from pending list by backend filter
      // Keep it in receivingOrderIds if it's still in pending OR if it's not yet in history
      const orderStillPending = refetchPendingResult.data?.orders?.some(
        (o: any) => o.id === orderId
      )

      if (!orderStillPending && reportFound) {
        // Order is gone from pending AND found in history - success!
        setReceivingOrderIds((prev) => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
      } else if (!reportFound) {
        // Report not found in history - something went wrong
        console.error('Receiving report not found in history after', maxRetries, 'retries')
        // Keep it in receivingOrderIds to show "Processing..." state
      } else {
        // Order still in pending but we created report - keep showing processing state
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create receiving report')
      // Remove from receivingOrderIds on error
      setReceivingOrderIds((prev) => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  // Deep link: open receive dialog when ?order=id is in URL and that order is in pending list
  useEffect(() => {
    if (!orderIdFromUrl || !pendingData?.orders?.length) return
    const order = pendingData.orders.find((o: any) => o.id === orderIdFromUrl)
    if (order) {
      setSelectedOrder(order)
      setShowDialog(true)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('order')
          return next
        },
        { replace: true }
      )
    }
  }, [orderIdFromUrl, pendingData?.orders, setSearchParams])

  // Sync receivingOrderIds with backend data
  // Remove IDs for orders that are no longer in pending list OR have has_receiving_report = true
  // This cleans up the state after orders are properly received
  useEffect(() => {
    if (pendingData?.orders) {
      setReceivingOrderIds((prev) => {
        const next = new Set(prev)
        const pendingIds = new Set(pendingData.orders.map((o: any) => o.id))
        let changed = false

        // Remove IDs that are no longer in pending list (order was successfully received and filtered out)
        next.forEach((id) => {
          if (!pendingIds.has(id)) {
            next.delete(id)
            changed = true
          }
        })

        // Also check if any pending orders have has_receiving_report = true
        // These were received but still showing in list (shouldn't happen but handle it)
        pendingData.orders.forEach((order: any) => {
          if (order.has_receiving_report && next.has(order.id)) {
            // Keep it disabled but it should be filtered out on next refetch
          }
        })

        return changed ? next : prev
      })
    }
  }, [pendingData?.orders])

  const pendingOrders = (pendingData?.orders || []).map((order: any) => ({
    ...order,
    // Ensure has_receiving_report is true if order is in receivingOrderIds or if backend says it has a report
    has_receiving_report: order.has_receiving_report || receivingOrderIds.has(order.id),
  }))
  const historyReports = historyData?.reports || []

  return (
    <RequirePermission permission="RECEIVING_VIEW" title="receiving">
      {!receivingEnabled ? (
        <FeatureLockedCard
          featureKey="receiving_quality"
          featureName="Receiving & quality control"
          currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
          upgradeUrl="/app/settings?tab=subscription"
        />
      ) : (
        <div className="page-stack overflow-x-hidden" data-testid="receiving-page">
          <Card className="shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <PageHeader title={receivingTitle} description={receivingDescription} />

              <Tabs defaultValue="pending" className="space-y-4">
                <TabsList className="tabs-scroll h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
                  <TabsTrigger value="pending" className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4" />
                    Pending Orders
                    {pendingOrders.length > 0 && (
                      <Badge variant="destructive">{pendingOrders.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Receiving History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-4">
                  {pendingLoading ? (
                    <div className="space-y-2 py-4">
                      <Skeleton className="h-16 w-full rounded-lg" />
                      <Skeleton className="h-16 w-full rounded-lg" />
                    </div>
                  ) : pendingOrders.length === 0 ? (
                    <EmptyState
                      title="No orders awaiting receiving"
                      description="Delivered orders ready to receive will show up here."
                      icon={<PackageCheck className="h-10 w-10" aria-hidden />}
                    />
                  ) : (
                    <div className="grid gap-4">
                      {pendingOrders.map((order: any) => {
                        const status = (order.status?.toUpperCase() || order.status || '') as string
                        const readyToReceive = isOrderReadyForReceiving(status)

                        return (
                          <Card key={order.id}>
                            <CardHeader>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <CardTitle className="flex items-center gap-2">
                                    Order #{order.id.slice(0, 8)}
                                    <Badge variant="outline">{order.supplier_name}</Badge>
                                    <Badge
                                      variant={
                                        readyToReceive
                                          ? 'default'
                                          : status === 'SHIPPED'
                                            ? 'secondary'
                                            : status === 'PROCESSING'
                                              ? 'secondary'
                                              : 'outline'
                                      }
                                    >
                                      {order.status || 'UNKNOWN'}
                                    </Badge>
                                  </CardTitle>
                                  <p className="text-sm text-[var(--text-muted)] mt-1">
                                    Placed: {new Date(order.created_at).toLocaleString()}
                                  </p>
                                  {readyToReceive ? (
                                    <div className="mt-2 flex items-center gap-2 text-sm text-[var(--mint)] bg-[var(--mint-pale)] px-2 py-1 rounded">
                                      <CheckCircle className="h-4 w-4 shrink-0" />
                                      <span>
                                        {status === 'DELIVERED'
                                          ? 'Supplier marked this order as delivered. Confirm receipt and quantities below.'
                                          : 'Ready to confirm receipt and quantities.'}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                      {status === 'PLACED' && (
                                        <>
                                          <Clock className="h-4 w-4 shrink-0" />
                                          <span>Waiting for supplier to acknowledge order</span>
                                        </>
                                      )}
                                      {status === 'ACKNOWLEDGED' && (
                                        <>
                                          <CheckCircle className="h-4 w-4 shrink-0" />
                                          <span>
                                            Supplier acknowledged. Order is being prepared.
                                          </span>
                                        </>
                                      )}
                                      {status === 'PROCESSING' && (
                                        <>
                                          <PackageCheck className="h-4 w-4 shrink-0" />
                                          <span>Supplier is processing your order</span>
                                        </>
                                      )}
                                      {status === 'SHIPPED' && (
                                        <>
                                          <Truck className="h-4 w-4 shrink-0" />
                                          <span>
                                            Order is in transit. Waiting for supplier to mark as
                                            delivered.
                                          </span>
                                        </>
                                      )}
                                      {![
                                        'PLACED',
                                        'ACKNOWLEDGED',
                                        'PROCESSING',
                                        'SHIPPED',
                                      ].includes(status) && (
                                        <>
                                          <AlertCircle className="h-4 w-4 shrink-0" />
                                          <span>
                                            Order status: {status || 'unknown'}. Waiting for
                                            supplier to mark as delivered.
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {order.has_receiving_report || receivingOrderIds.has(order.id) ? (
                                  <Button
                                    disabled
                                    variant="outline"
                                    className="cursor-not-allowed opacity-75"
                                  >
                                    <PackageCheck className="h-4 w-4 mr-2" />
                                    Received
                                  </Button>
                                ) : readyToReceive && canReceive ? (
                                  <Button
                                    className="min-h-[44px] w-full shrink-0 sm:w-auto"
                                    onClick={() => handleReceive(order)}
                                    disabled={isCreating || receivingOrderIds.has(order.id)}
                                  >
                                    {receivingOrderIds.has(order.id) ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Processing...
                                      </>
                                    ) : (
                                      <>
                                        <PackageCheck className="h-4 w-4 mr-2" />
                                        Receive Now
                                      </>
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    disabled
                                    variant="outline"
                                    className="cursor-not-allowed opacity-75"
                                    title="Order must be marked delivered by the supplier before receiving"
                                  >
                                    <AlertCircle className="h-4 w-4 mr-2" />
                                    Not delivered yet
                                  </Button>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                {order.items?.map((item: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex flex-col gap-1 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div>
                                      <p className="font-medium">{item.product_name}</p>
                                      <p className="text-sm text-[var(--text-muted)]">
                                        {item.sku} • Qty: {item.ordered_quantity} {item.unit}
                                      </p>
                                    </div>
                                    <p className="font-medium">{formatPrice(item.unit_price)}</p>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                  {historyLoading ? (
                    <div className="space-y-2 py-4">
                      <Skeleton className="h-20 w-full rounded-lg" />
                      <Skeleton className="h-20 w-full rounded-lg" />
                    </div>
                  ) : historyReports.length === 0 ? (
                    <EmptyState
                      title="No receiving history"
                      description="Completed receiving reports will appear here."
                      icon={<History className="h-10 w-10" aria-hidden />}
                    />
                  ) : (
                    <div className="grid gap-4">
                      {historyReports.map((report: any) => (
                        <Card key={report.id}>
                          <CardHeader>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <CardTitle className="flex flex-wrap items-center gap-2">
                                  Order #{report.order_id?.slice(0, 8) || 'N/A'}
                                  <Badge variant="outline">{report.supplier_name}</Badge>
                                </CardTitle>
                                <p className="text-sm text-[var(--text-muted)] mt-1">
                                  Received: {new Date(report.received_at).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {report.quality_score && (
                                  <div className="flex items-center gap-1">
                                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                    <span className="text-sm font-medium">
                                      {report.quality_score}
                                    </span>
                                  </div>
                                )}
                                <Badge
                                  variant={report.status === 'ACCEPTED' ? 'default' : 'secondary'}
                                >
                                  {report.status}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 gap-3 text-sm xs:grid-cols-3 xs:gap-4">
                              <div>
                                <p className="text-[var(--text-muted)]">Items Ordered</p>
                                <p className="font-semibold">{report.total_items_ordered}</p>
                              </div>
                              <div>
                                <p className="text-[var(--text-muted)]">Items Received</p>
                                <p className="font-semibold">{report.total_items_received}</p>
                              </div>
                              <div>
                                <p className="text-[var(--text-muted)]">Total Cost</p>
                                <p className="font-semibold">
                                  {formatPrice(report.total_actual_cost)}
                                </p>
                              </div>
                            </div>
                            {report.delivery_notes && (
                              <div className="mt-4 pt-4 border-t">
                                <p className="text-sm text-[var(--text-muted)] mb-2">
                                  Delivery Notes:
                                </p>
                                <p className="text-sm">{report.delivery_notes}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Receiving Dialog */}
          {selectedOrder && (
            <ReceivingDialog
              order={selectedOrder}
              open={showDialog}
              onOpenChange={setShowDialog}
              onSubmit={handleSubmitReceiving}
              isLoading={isCreating}
              canReceive={canReceive}
              canOpenDispute={canShowDispute}
              onOpenDispute={(formData) => beginDisputeFromReceiving(selectedOrder, formData)}
            />
          )}

          {openDisputeContext && (
            <OpenDisputeDialog
              open={Boolean(openDisputeContext)}
              onOpenChange={(open) => {
                if (!open) setOpenDisputeContext(null)
              }}
              orderId={openDisputeContext.orderId}
              defaultSupplierId={openDisputeContext.supplierId}
              receivingReportId={openDisputeContext.receivingReportId}
              initialLineItems={openDisputeContext.lineItems}
              onCreated={() => {
                setOpenDisputeContext(null)
                void refetchPending()
                void refetchHistory()
              }}
            />
          )}
        </div>
      )}
    </RequirePermission>
  )
}

function ReceivingDialog({
  order,
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  canReceive,
  canOpenDispute,
  onOpenDispute,
}: {
  order: { id: string; items: Array<Record<string, unknown>> }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (formData: Record<string, unknown>) => void
  isLoading: boolean
  canReceive: boolean
  canOpenDispute: boolean
  onOpenDispute: (formData: Record<string, unknown>) => void
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({
    deliveryNotes: '',
    qualityScore: 5,
    qualityNotes: '',
  })

  useEffect(() => {
    if (!open) return
    setFormData({
      deliveryNotes: '',
      qualityScore: 5,
      qualityNotes: '',
    })
  }, [open, order.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90dvh,100vh)] max-w-3xl overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle>Receive Order #{order.id.slice(0, 8)}</DialogTitle>
          <DialogDescription>
            Enter quantities and quality for each line. When you complete receiving, if any items
            had issues, one dispute form opens for the whole order (not per item).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label>Items Received</Label>
            <div className="space-y-3 mt-2">
              {order.items.map((item: any) => {
                const unit = item.unit
                const ordered = Number(item.ordered_quantity ?? 0)
                const qtyRules = getQuantityUnitRules(unit)
                const receivedKey = `received_${item.id}`
                const receivedValue =
                  formData[receivedKey] !== undefined
                    ? Number(formData[receivedKey])
                    : snapQuantityToUnit(ordered, unit)

                return (
                  <Card key={item.id} className="p-4">
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-[var(--text-muted)]">SKU: {item.sku}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          Ordered: {ordered} {unit}
                          {qtyRules.allowDecimals ? ` (step ${qtyRules.step})` : ' (whole units)'}
                        </p>
                      </div>
                      <div className="border-t pt-3 mt-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`received_${item.id}`}>Received Qty</Label>
                            <Input
                              id={`received_${item.id}`}
                              type="number"
                              step={qtyRules.step}
                              min={qtyRules.min}
                              max={ordered}
                              inputMode={qtyRules.allowDecimals ? 'decimal' : 'numeric'}
                              value={receivedValue}
                              onChange={(e) => {
                                const parsed = parseFloat(e.target.value)
                                if (Number.isNaN(parsed)) return
                                setFormData({
                                  ...formData,
                                  [receivedKey]: normalizeReceivedQuantity(parsed, ordered, unit),
                                })
                              }}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`quality_${item.id}`}>Quality Status</Label>
                            <select
                              id={`quality_${item.id}`}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              value={String(formData[`quality_${item.id}`] ?? 'ACCEPTED')}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  [`quality_${item.id}`]: e.target.value,
                                })
                              }
                            >
                              <option value="ACCEPTED">Accepted</option>
                              <option value="DAMAGED">Damaged</option>
                              <option value="EXPIRED">Expired</option>
                              <option value="WRONG_ITEM">Wrong Item</option>
                              <option value="SHORT">Short</option>
                            </select>
                          </div>
                          <div>
                            <Label htmlFor={`notes_${item.id}`}>Notes (Optional)</Label>
                            <Input
                              id={`notes_${item.id}`}
                              onChange={(e) =>
                                setFormData({ ...formData, [`notes_${item.id}`]: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`expiry_${item.id}`}>Expiry date (optional)</Label>
                            <Input
                              id={`expiry_${item.id}`}
                              type="date"
                              onChange={(e) =>
                                setFormData({ ...formData, [`expiry_${item.id}`]: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`batch_${item.id}`}>Batch / lot #</Label>
                            <Input
                              id={`batch_${item.id}`}
                              onChange={(e) =>
                                setFormData({ ...formData, [`batch_${item.id}`]: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`storage_${item.id}`}>Storage location</Label>
                            <Input
                              id={`storage_${item.id}`}
                              onChange={(e) =>
                                setFormData({ ...formData, [`storage_${item.id}`]: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="qualityScore">Overall Quality Score</Label>
            <div className="flex items-center gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <Button
                  key={score}
                  type="button"
                  variant={formData.qualityScore === score ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, qualityScore: score })}
                >
                  <Star
                    className={`h-4 w-4 ${formData.qualityScore === score ? 'fill-yellow-400' : ''}`}
                  />
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="qualityNotes">Quality Notes</Label>
            <Textarea
              id="qualityNotes"
              placeholder="Enter any quality observations..."
              onChange={(e) => setFormData({ ...formData, qualityNotes: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="deliveryNotes">Delivery Notes</Label>
            <Textarea
              id="deliveryNotes"
              placeholder="Enter delivery notes (truck number, driver, etc.)..."
              onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {canOpenDispute && (
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] w-full sm:w-auto"
                data-testid="receiving-open-dispute"
                onClick={() => onOpenDispute(formData)}
              >
                Open dispute
              </Button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => onSubmit(formData)}
              disabled={isLoading || !canReceive}
            >
              {isLoading ? 'Processing...' : 'Complete Receiving'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
