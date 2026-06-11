import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link as RouterLink, Link } from 'react-router-dom'
import {
  useGetOrderQuery,
  useUpdateOrderMutation,
  useGetOrderInvoicesQuery,
  useSendOrderReminderMutation,
  useGetEntitlementsQuery,
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
  useGetMyReviewsQuery,
} from '../services/api'
import { isEntitlementFeatureEnabled, featureEnabled } from '../lib/planLimits'
import { isOrderEligibleForReview } from '../lib/orderReviewEligibility'
import { SupplierReviewModal } from '../components/reviews/SupplierReviewModal'
import { isOrderEligibleForDispute } from '../lib/orderDisputeEligibility'
import { getActiveDisputeForOrder } from '../lib/disputeHelpers'
import { OrderDisputeBanner } from '../components/disputes/OrderDisputeBanner'
import { OpenDisputeDialog } from '../components/disputes/OpenDisputeDialog'
import { RequirePermission } from '../components/RequirePermission'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { DetailPageSkeleton } from '../components/ui/detail-page-skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ArrowLeft, AlertCircle, Check, Star } from 'lucide-react'
import { useImpersonation } from '../hooks/useImpersonation'
import { usePermissions } from '../hooks/usePermissions'
import toast from 'react-hot-toast'
import { DeclineOrderDialog } from '../components/orders/DeclineOrderDialog'
import { getOrderCancellationBanner, getOrderStatusLabel } from '../lib/orderStatusDisplay'
import { formatOrderRef, isDisputeReplacementOrder } from '../lib/orderPlacement'
import { pageHeaderRowClass } from '../components/ui/card-layout'
import { LazyTabMount } from '../components/LazyTabMount'
import {
  VALID_ORDER_TABS,
  getOrderStatusColor,
  OrderDetailTabLoading,
} from '../components/orders/detail/orderDetailShared'
import {
  LazyOrderDeliveryTab,
  LazyOrderDetailsTab,
  LazyOrderInvoiceTab,
  LazyOrderItemsTab,
  LazyOrderPackingTab,
  LazyOrderPickingTab,
  LazyOrderTimelineTab,
} from '../components/orders/detail/lazyOrderDetailTabs'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const { can } = usePermissions()
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const canDeclineOrder = can('ORDERS_MANAGE')
  const canOpenDispute = can('ORDERS_CREATE') || can('RECEIVING_MANAGE')
  const [activeTab, setActiveTab] = useState<string>('timeline')
  const [showOpenDispute, setShowOpenDispute] = useState(false)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const reviewFromUrl = searchParams.get('review') === '1'

  useEffect(() => {
    if (tabFromUrl && VALID_ORDER_TABS.includes(tabFromUrl as (typeof VALID_ORDER_TABS)[number])) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  const { data, isLoading, error, refetch } = useGetOrderQuery(id!)
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )
  const { data: invoicesData } = useGetOrderInvoicesQuery(id!, { skip: !id })
  const { data: disputesData } = useGetDisputesQuery(undefined, {
    skip: !id || isSupplier || !disputesEnabled,
  })
  const { data: incomingDisputesData } = useGetIncomingDisputesQuery(undefined, {
    skip: !id || !isSupplier || !disputesEnabled,
  })
  const reviewsWriteEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.supplier_reviews
  )
  const { data: myReviewsData, refetch: refetchMyReviews } = useGetMyReviewsQuery(undefined, {
    skip: isSupplier || !reviewsWriteEnabled,
  })
  const [updateOrder] = useUpdateOrderMutation()
  const [sendReminder, { isLoading: isSendingReminder }] = useSendOrderReminderMutation()

  const orderForReview = data?.order
  const primarySupplierForReview = (() => {
    const items = orderForReview?.items ?? []
    const first = items.find((item) => item.supplier_id)
    if (!first?.supplier_id) return null
    return {
      id: String(first.supplier_id),
      name: first.supplier_name ? String(first.supplier_name) : 'Supplier',
    }
  })()
  const existingOrderReview = (myReviewsData?.reviews ?? []).find(
    (r) => orderForReview && String(r.order_id) === orderForReview.id
  )
  const canLeaveReview =
    !isSupplier &&
    reviewsWriteEnabled &&
    Boolean(orderForReview) &&
    isOrderEligibleForReview(orderForReview?.status) &&
    Boolean(primarySupplierForReview) &&
    !existingOrderReview

  useEffect(() => {
    if (reviewFromUrl && canLeaveReview) {
      setShowReviewModal(true)
    }
  }, [reviewFromUrl, canLeaveReview])

  const handleStatusUpdate = async (
    newStatus: string,
    extra?: { decline_reason?: string; cancel_reason?: string }
  ) => {
    if (!id || isUpdating) return

    try {
      setIsUpdating(true)
      await updateOrder({ id, data: { status: newStatus, ...extra } }).unwrap()
      const successLabel =
        newStatus === 'CANCELLED' && isSupplier
          ? 'Order declined'
          : `Order status updated to ${newStatus}`
      toast.success(successLabel)
      setIsUpdating(false)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update order status')
      setIsUpdating(false)
    }
  }

  const handleSendReminder = async () => {
    if (!id || isSendingReminder) return

    try {
      await sendReminder(id).unwrap()
      toast.success('Reminder sent to supplier successfully')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to send reminder')
    }
  }

  if (isLoading) {
    return <DetailPageSkeleton rows={6} />
  }

  if (error || !data || !id) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Order not found</p>
      </div>
    )
  }

  const order = data.order
  const cancellationBanner = getOrderCancellationBanner(
    order,
    isSupplier ? 'SUPPLIER' : 'RESTAURANT'
  )
  const statusLabel = getOrderStatusLabel(order, isSupplier ? 'SUPPLIER' : 'RESTAURANT')
  const allDisputes = isSupplier
    ? (incomingDisputesData?.disputes ?? [])
    : (disputesData?.disputes ?? [])
  const activeDispute = getActiveDisputeForOrder(allDisputes, order.id)
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
  const primarySupplier = primarySupplierForReview

  return (
    <RequirePermission permission="ORDERS_VIEW" title="order details">
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
              {sourceDispute?.id != null && String(sourceDispute.id) !== '' ? (
                <RouterLink
                  to={`/app/disputes/${String(sourceDispute.id)}`}
                  className="text-[var(--brand-mid)] hover:underline font-medium"
                >
                  Dispute {formatOrderRef(String(sourceDispute.id))}
                </RouterLink>
              ) : null}
            </div>
          </div>
        )}

        <div className={pageHeaderRowClass}>
          <div className="flex flex-col gap-3 min-w-0 sm:flex-row sm:items-center sm:gap-4">
            <Button variant="outline" size="sm" className="self-start shrink-0" asChild>
              <Link to="/app/orders">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Orders
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                Order #{order.id.slice(-8).toUpperCase()}
              </h1>
              <p className="text-[var(--text-muted)] truncate">{order.restaurant_name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isReplacementOrder && (
              <Badge variant="secondary" className="text-sm">
                Replacement
              </Badge>
            )}
            <Badge variant={getOrderStatusColor(order.status)} className="text-lg px-3 py-1">
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
            {canLeaveReview && (
              <Button size="sm" variant="outline" onClick={() => setShowReviewModal(true)}>
                <Star className="h-4 w-4 mr-2" />
                Leave review
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
                  Invoice{' '}
                  {invoicesData?.invoices?.length > 0 && `(${invoicesData.invoices.length})`}
                </TabsTrigger>
              )}
            {isSupplier && <TabsTrigger value="picking">Picking Notes</TabsTrigger>}
            {isSupplier && <TabsTrigger value="delivery">Delivery Info</TabsTrigger>}
            {isSupplier && <TabsTrigger value="packing">Packing Slip</TabsTrigger>}
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <LazyTabMount
              tab="timeline"
              selectedTab={activeTab}
              fallback={<OrderDetailTabLoading />}
            >
              <LazyOrderTimelineTab orderId={id} />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="details">
            <LazyTabMount
              tab="details"
              selectedTab={activeTab}
              fallback={<OrderDetailTabLoading />}
            >
              <LazyOrderDetailsTab orderId={id} />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="items">
            <LazyTabMount tab="items" selectedTab={activeTab} fallback={<OrderDetailTabLoading />}>
              <LazyOrderItemsTab orderId={id} />
            </LazyTabMount>
          </TabsContent>

          {!isSupplier && (
            <TabsContent value="invoice">
              <LazyTabMount
                tab="invoice"
                selectedTab={activeTab}
                fallback={<OrderDetailTabLoading />}
              >
                <LazyOrderInvoiceTab orderId={id} />
              </LazyTabMount>
            </TabsContent>
          )}

          {isSupplier && (
            <TabsContent value="picking">
              <LazyTabMount
                tab="picking"
                selectedTab={activeTab}
                fallback={<OrderDetailTabLoading />}
              >
                <LazyOrderPickingTab orderId={id} />
              </LazyTabMount>
            </TabsContent>
          )}

          {isSupplier && (
            <TabsContent value="delivery">
              <LazyTabMount
                tab="delivery"
                selectedTab={activeTab}
                fallback={<OrderDetailTabLoading />}
              >
                <LazyOrderDeliveryTab orderId={id} />
              </LazyTabMount>
            </TabsContent>
          )}

          {isSupplier && (
            <TabsContent value="packing">
              <LazyTabMount
                tab="packing"
                selectedTab={activeTab}
                fallback={<OrderDetailTabLoading />}
              >
                <LazyOrderPackingTab orderId={id} />
              </LazyTabMount>
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

        {canLeaveReview && primarySupplier && (
          <SupplierReviewModal
            supplierId={primarySupplier.id}
            supplierName={primarySupplier.name}
            open={showReviewModal}
            onOpenChange={setShowReviewModal}
            initialOrderId={order.id}
            onSuccess={() => refetchMyReviews()}
          />
        )}
      </div>
    </RequirePermission>
  )
}
