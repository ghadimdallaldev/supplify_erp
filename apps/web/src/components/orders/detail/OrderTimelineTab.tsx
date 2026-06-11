import {
  useGetOrderQuery,
  useGetOrderInvoicesQuery,
  useGetOrderAmendmentsQuery,
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
  useGetReceivingHistoryQuery,
  useGetCreditNotesQuery,
  useGetOrderTrackingQuery,
  useGetEntitlementsQuery,
} from '../../../services/api'
import { isEntitlementFeatureEnabled } from '../../../lib/planLimits'
import { getDisputesForOrder } from '../../../lib/disputeHelpers'
import { buildOrderTimeline } from '../../../lib/orderTimeline'
import { OrderOperationsTimeline } from '../OrderOperationsTimeline'
import { OrderDeliveryTrackingPanel } from '../OrderDeliveryTrackingPanel'
import { RestaurantOrderTrackingPanel } from '../RestaurantOrderTrackingPanel'
import { isRestaurantOrderTracking, isSupplierOrderTracking } from '../../../types'
import { OrderSubstitutionPanel } from '../../supplier/OrderSubstitutionPanel'
import { SupplierFulfillmentIssuePanel } from '../../supplier/SupplierFulfillmentIssuePanel'
import { useImpersonation } from '../../../hooks/useImpersonation'
import { OrderDetailTabLoading } from './orderDetailShared'

export interface OrderTimelineTabProps {
  orderId: string
}

export function OrderTimelineTab({ orderId }: OrderTimelineTabProps) {
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { data, isLoading } = useGetOrderQuery(orderId)
  const { data: orderTracking } = useGetOrderTrackingQuery(orderId)
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )
  const { data: invoicesData } = useGetOrderInvoicesQuery(orderId)
  const { data: amendmentsData } = useGetOrderAmendmentsQuery(orderId)
  const { data: disputesData } = useGetDisputesQuery(undefined, {
    skip: isSupplier || !disputesEnabled,
  })
  const { data: incomingDisputesData } = useGetIncomingDisputesQuery(undefined, {
    skip: !isSupplier || !disputesEnabled,
  })
  const { data: receivingHistoryData } = useGetReceivingHistoryQuery(undefined, {
    skip: isSupplier,
  })
  const { data: creditNotesData } = useGetCreditNotesQuery(undefined, {
    skip: !disputesEnabled,
  })

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order
  const amendments = amendmentsData?.amendments || []
  const allDisputes = isSupplier
    ? (incomingDisputesData?.disputes ?? [])
    : (disputesData?.disputes ?? [])
  const orderDisputes = getDisputesForOrder(allDisputes, order.id)
  const orderReceivingReports = (receivingHistoryData?.reports ?? []).filter(
    (report: Record<string, unknown>) => String(report.order_id ?? report.orderId) === order.id
  )
  const replacementOrders = (order as Record<string, unknown>).replacementOrders as
    | Array<Record<string, unknown>>
    | undefined

  const deliveryAssignmentForTimeline = (() => {
    if (isRestaurantOrderTracking(orderTracking) && orderTracking.delivery) {
      return {
        status: orderTracking.delivery.status,
        driverName: orderTracking.driver?.name ?? null,
        assignedAt: orderTracking.delivery.assignedAt ?? null,
        pickedUpAt: orderTracking.delivery.pickedUpAt ?? null,
        deliveredAt: orderTracking.delivery.deliveredAt ?? null,
      }
    }
    if (isSupplierOrderTracking(orderTracking) && orderTracking.assignment) {
      return {
        status: orderTracking.assignment.status,
        driverName: orderTracking.assignment.driverName ?? null,
      }
    }
    return null
  })()

  const timelineEvents = buildOrderTimeline({
    order,
    viewerRole: isSupplier ? 'SUPPLIER' : 'RESTAURANT',
    amendments,
    invoices: invoicesData?.invoices ?? [],
    disputes: orderDisputes,
    receivingReports: orderReceivingReports,
    creditNotes: creditNotesData?.creditNotes ?? [],
    replacementOrders: replacementOrders ?? [],
    deliveryAssignment: deliveryAssignmentForTimeline,
  })

  return (
    <div className="space-y-4">
      {isSupplier && orderId && <OrderSubstitutionPanel orderId={orderId} />}
      {isSupplier && orderId && order?.items?.length > 0 && (
        <SupplierFulfillmentIssuePanel orderId={orderId} items={order.items} />
      )}
      {isSupplier && orderId && <OrderDeliveryTrackingPanel orderId={orderId} />}
      {!isSupplier && orderId && (
        <RestaurantOrderTrackingPanel orderId={orderId} orderStatus={order.status} />
      )}
      <OrderOperationsTimeline
        events={timelineEvents}
        viewerRole={isSupplier ? 'SUPPLIER' : 'RESTAURANT'}
      />
    </div>
  )
}
