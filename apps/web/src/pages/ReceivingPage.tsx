import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { RequirePermission } from '../components/RequirePermission'
import { PackageCheck, History } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { PageHeader } from '../components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  useGetPendingOrdersForReceivingQuery,
  useCreateReceivingReportMutation,
  useGetReceivingHistoryQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { FeatureLockedCard } from '../components/FeatureLockedCard'
import { toast } from 'sonner'
import { normalizeReceivedQuantity } from '../lib/quantityUnit'
import { isOrderReadyForReceiving } from '../lib/orderReceiving'
import {
  disputeLineItemsFromReceiving,
  receivingFormToDisputeDrafts,
  supplierIdFromOrder,
  type DisputeLineItemDraft,
} from '../lib/disputeHelpers'
import { OpenDisputeDialog } from '../components/disputes/OpenDisputeDialog'
import { ReceivingDialog } from '../components/receiving/ReceivingDialog'
import { ReceivingPendingTab } from '../components/receiving/ReceivingPendingTab'
import { ReceivingHistoryTab } from '../components/receiving/ReceivingHistoryTab'
import { ReceivingSummaryStrip } from '../components/receiving/ReceivingPendingOrderRow'

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

  const [receivingOrderIds, setReceivingOrderIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('receivingOrderIds')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    }
    return new Set()
  })

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

      await new Promise((resolve) => setTimeout(resolve, 500))

      const [refetchPendingResult, refetchHistoryResult] = await Promise.all([
        refetchPending(),
        refetchHistory(),
      ])

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

      const orderStillPending = refetchPendingResult.data?.orders?.some(
        (o: any) => o.id === orderId
      )

      if (!orderStillPending && reportFound) {
        setReceivingOrderIds((prev) => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
      } else if (!reportFound) {
        console.error('Receiving report not found in history after', maxRetries, 'retries')
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create receiving report')
      setReceivingOrderIds((prev) => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

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

  useEffect(() => {
    if (pendingData?.orders) {
      setReceivingOrderIds((prev) => {
        const next = new Set(prev)
        const pendingIds = new Set(pendingData.orders.map((o: any) => o.id))
        let changed = false

        next.forEach((id) => {
          if (!pendingIds.has(id)) {
            next.delete(id)
            changed = true
          }
        })

        return changed ? next : prev
      })
    }
  }, [pendingData?.orders])

  const pendingOrders = (pendingData?.orders || []).map((order: any) => ({
    ...order,
    has_receiving_report: order.has_receiving_report || receivingOrderIds.has(order.id),
  }))
  const historyReports = historyData?.reports || []

  const readyCount = useMemo(
    () =>
      pendingOrders.filter((order: any) =>
        isOrderReadyForReceiving(order.status?.toUpperCase() || order.status || '')
      ).length,
    [pendingOrders]
  )

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
        <div className="page-stack space-y-6 overflow-x-hidden" data-testid="receiving-page">
          <PageHeader title={receivingTitle} description={receivingDescription} />

          <div
            className="rounded-xl border border-[var(--amber)]/25 bg-[var(--amber-pale)] px-4 py-3 text-sm text-[var(--text)]"
            data-testid="receiving-delivered-hint"
          >
            <strong className="font-semibold">Delivered does not mean received.</strong> Confirm
            quantities on site even when the supplier marks an order as delivered.
          </div>

          {!pendingLoading && !historyLoading ? (
            <ReceivingSummaryStrip
              pendingCount={pendingOrders.length}
              readyCount={readyCount}
              historyCount={historyReports.length}
            />
          ) : null}

          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList className="tabs-scroll h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
              <TabsTrigger value="pending" className="gap-1.5 text-xs sm:text-sm">
                <PackageCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Pending Orders
                {pendingOrders.length > 0 ? (
                  <Badge variant="destructive" className="ml-0.5">
                    {pendingOrders.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
                <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Receiving History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              <ReceivingPendingTab
                pendingLoading={pendingLoading}
                pendingOrders={pendingOrders}
                receivingOrderIds={receivingOrderIds}
                canReceive={canReceive}
                isCreating={isCreating}
                onReceive={handleReceive}
              />
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <ReceivingHistoryTab
                historyLoading={historyLoading}
                historyReports={historyReports}
              />
            </TabsContent>
          </Tabs>

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
