import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ArrowLeft, AlertCircle, Check, Star } from 'lucide-react'
import { useImpersonation } from '../hooks/useImpersonation'
import { usePermissions } from '../hooks/usePermissions'
import { toast } from 'sonner'
import { DeclineOrderDialog } from '../components/orders/DeclineOrderDialog'
import { formatOrderRef, isDisputeReplacementOrder } from '../lib/orderPlacement'
import { LazyTabMount } from '../components/LazyTabMount'
import {
  VALID_ORDER_TABS,
  getOrderStatusColor,
  OrderDetailTabLoading,
  resolveOrderCancellationBanner,
  resolveOrderStatusLabel,
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
  const { t } = useTranslation('orders')
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
      name: first.supplier_name ? String(first.supplier_name) : t('detail.defaultSupplierName'),
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
          ? t('toast.orderDeclined')
          : t('toast.statusUpdated', {
              status: t(`status.${newStatus}`, { defaultValue: newStatus }),
            })
      toast.success(successLabel)
      setIsUpdating(false)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('toast.updateFailed'))
      setIsUpdating(false)
    }
  }

  const handleSendReminder = async () => {
    if (!id || isSendingReminder) return

    try {
      await sendReminder(id).unwrap()
      toast.success(t('toast.reminderSent'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('toast.reminderFailed'))
    }
  }

  if (isLoading) {
    return <DetailPageSkeleton rows={6} />
  }

  if (error || !data || !id) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">{t('detail.notFound')}</p>
      </div>
    )
  }

  const order = data.order
  const cancellationBanner = resolveOrderCancellationBanner(
    t,
    order,
    isSupplier ? 'SUPPLIER' : 'RESTAURANT'
  )
  const statusLabel = resolveOrderStatusLabel(t, order, isSupplier ? 'SUPPLIER' : 'RESTAURANT')
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
      <PageShell>
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
            <strong>{t('detail.replacementBannerTitle')}</strong>
            <p className="mt-1 text-sky-900/90 dark:text-sky-200/90">
              {t('detail.replacementBannerDescription')}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {sourceOrderId && (
                <RouterLink
                  to={`/app/orders/${sourceOrderId}`}
                  className="text-[var(--brand-mid)] hover:underline font-medium"
                >
                  {t('detail.originalOrder', { ref: formatOrderRef(sourceOrderId) })}
                </RouterLink>
              )}
              {sourceDispute?.id != null && String(sourceDispute.id) !== '' ? (
                <RouterLink
                  to={`/app/disputes/${String(sourceDispute.id)}`}
                  className="text-[var(--brand-mid)] hover:underline font-medium"
                >
                  {t('detail.disputeRef', { ref: formatOrderRef(String(sourceDispute.id)) })}
                </RouterLink>
              ) : null}
            </div>
          </div>
        )}

        <PageHeader
          breadcrumb={
            <Button variant="outline" size="sm" className="self-start shrink-0" asChild>
              <Link to="/app/orders">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('detail.backToOrders')}
              </Link>
            </Button>
          }
          title={t('detail.orderNumber', { id: order.id.slice(-8).toUpperCase() })}
          description={order.restaurant_name}
          actions={
            <>
              {isReplacementOrder && (
                <Badge variant="secondary" className="text-sm">
                  {t('detail.replacement')}
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
                    ? t('detail.sending')
                    : order.reminder_count > 0
                      ? t('detail.sendReminderCount', { count: order.reminder_count })
                      : t('detail.sendReminder')}
                </Button>
              )}
              {!isSupplier &&
                canOpenDispute &&
                disputesEnabled &&
                isOrderEligibleForDispute(order.status) &&
                !activeDispute && (
                  <Button size="sm" variant="outline" onClick={() => setShowOpenDispute(true)}>
                    {t('detail.openDispute')}
                  </Button>
                )}
              {canLeaveReview && (
                <Button size="sm" variant="outline" onClick={() => setShowReviewModal(true)}>
                  <Star className="h-4 w-4 mr-2" />
                  {t('detail.leaveReview')}
                </Button>
              )}
              {isSupplier && disputesEnabled && activeDispute && (
                <Button size="sm" variant="outline" asChild>
                  <RouterLink to="/app/disputes">{t('detail.manageDispute')}</RouterLink>
                </Button>
              )}
              {isSupplier && (
                <div className="flex gap-2 ml-4">
                  {order.status === 'PLACED' && (
                    <>
                      <Button size="sm" onClick={() => handleStatusUpdate('ACKNOWLEDGED')}>
                        {t('detail.acknowledge')}
                      </Button>
                      {canDeclineOrder && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowDeclineDialog(true)}
                          data-testid="order-decline"
                        >
                          {t('detail.decline')}
                        </Button>
                      )}
                    </>
                  )}
                  {order.status === 'ACKNOWLEDGED' && (
                    <Button size="sm" onClick={() => handleStatusUpdate('PROCESSING')}>
                      {t('detail.startProcessing')}
                    </Button>
                  )}
                  {order.status === 'PROCESSING' && (
                    <Button size="sm" onClick={() => handleStatusUpdate('SHIPPED')}>
                      {t('detail.markShipped')}
                    </Button>
                  )}
                  {order.status === 'SHIPPED' && !isUpdating && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleStatusUpdate('DELIVERED')}
                    >
                      {t('detail.markDelivered')}
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
                        <>{t('detail.updating')}</>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          {t('detail.delivered')}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="timeline">{t('detail.tabs.timeline')}</TabsTrigger>
            <TabsTrigger value="details">{t('detail.tabs.details')}</TabsTrigger>
            <TabsTrigger value="items">{t('detail.tabs.items')}</TabsTrigger>
            {!isSupplier &&
              (invoicesData?.invoices?.length > 0 ||
                order.status === 'COMPLETED' ||
                order.status === 'DELIVERED') && (
                <TabsTrigger value="invoice">
                  {t('detail.tabs.invoice')}
                  {invoicesData?.invoices?.length > 0 && ` (${invoicesData.invoices.length})`}
                </TabsTrigger>
              )}
            {isSupplier && <TabsTrigger value="picking">{t('detail.tabs.picking')}</TabsTrigger>}
            {isSupplier && <TabsTrigger value="delivery">{t('detail.tabs.delivery')}</TabsTrigger>}
            {isSupplier && <TabsTrigger value="packing">{t('detail.tabs.packing')}</TabsTrigger>}
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
      </PageShell>
    </RequirePermission>
  )
}
