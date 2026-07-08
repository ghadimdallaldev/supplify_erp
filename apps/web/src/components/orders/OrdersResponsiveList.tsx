import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Package,
  Plus,
  ShoppingCart,
  Scale,
  Truck,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { StatusBadge } from '../ui/status-badge'
import { CardActionGrid, cardActionBtnClass } from '../ui/card-layout'
import { ResponsiveDataList, responsiveDataListClasses } from '../ui/responsive-data-list'
import { cn } from '../../lib/utils'
import { formatPrice } from '../../utils/format'
import { resolveOrderStatusLabel } from './detail/orderDetailShared'
import { isDisputeReplacementOrder } from '../../lib/orderPlacement'
import { getActiveDisputeForOrder } from '../../lib/disputeHelpers'

const thClass = 'px-4 py-3 text-start text-xs font-semibold uppercase text-[var(--text-muted)]'
const tdClass = 'px-4 py-3 align-middle'

type OrdersResponsiveListProps = {
  orders: any[]
  t: TFunction
  ordersTitle: string
  isSupplier: boolean
  canEditOrders: boolean
  canDeclineOrder: boolean
  canCreateOrders: boolean
  disputesEnabled: boolean
  allDisputes: any[]
  updatingOrderId: string | null
  hasActiveFilters: boolean
  activeTab: string
  onStatusUpdate: (orderId: string, status: string, extra?: { decline_reason?: string }) => void
  onSendReminder: (orderId: string) => void
  onDecline: (orderId: string, label?: string) => void
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'ACKNOWLEDGED':
      return <CheckCircle className="h-4 w-4" />
    case 'PROCESSING':
      return <Package className="h-4 w-4" />
    case 'SHIPPED':
    case 'DELIVERED':
      return <Truck className="h-4 w-4" />
    case 'RECEIVED_PARTIAL':
    case 'RECEIVED_FULL':
    case 'RECEIVED_WITH_DISPUTE':
    case 'INVOICED':
    case 'COMPLETED':
      return <CheckCircle className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

function OrderTableActions({
  order,
  t,
  isSupplier,
  canEditOrders,
  canDeclineOrder,
  updatingOrderId,
  onStatusUpdate,
  onSendReminder,
  onDecline,
}: {
  order: any
  t: TFunction
  isSupplier: boolean
  canEditOrders: boolean
  canDeclineOrder: boolean
  updatingOrderId: string | null
  onStatusUpdate: (orderId: string, status: string, extra?: { decline_reason?: string }) => void
  onSendReminder: (orderId: string) => void
  onDecline: (orderId: string, label?: string) => void
}) {
  const actionBtnClass = cn('px-2.5 xl:px-3')
  const iconGap = responsiveDataListClasses.actionIconGap
  const labelClass = responsiveDataListClasses.actionLabel

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {isSupplier && canEditOrders && order.status === 'PLACED' && (
        <>
          <Button
            size="sm"
            className={actionBtnClass}
            onClick={() => onStatusUpdate(order.id, 'ACKNOWLEDGED')}
            aria-label={t('page.acknowledge')}
            title={t('page.acknowledge')}
            data-testid={`order-${order.id}-acknowledge`}
          >
            <CheckCircle className={cn('h-4 w-4', iconGap)} />
            <span className={labelClass}>{t('page.acknowledge')}</span>
          </Button>
          {canDeclineOrder && (
            <Button
              size="sm"
              variant="outline"
              className={actionBtnClass}
              onClick={() => onDecline(order.id, order.restaurant_name)}
              aria-label={t('page.decline')}
              title={t('page.decline')}
              data-testid={`order-${order.id}-decline`}
            >
              <X className={cn('h-4 w-4', iconGap)} />
              <span className={labelClass}>{t('page.decline')}</span>
            </Button>
          )}
        </>
      )}
      {isSupplier && canEditOrders && order.status === 'ACKNOWLEDGED' && (
        <Button
          size="sm"
          className={actionBtnClass}
          onClick={() => onStatusUpdate(order.id, 'PROCESSING')}
          aria-label={t('page.startProcessing')}
          title={t('page.startProcessing')}
          data-testid={`order-${order.id}-start-processing`}
        >
          <Package className={cn('h-4 w-4', iconGap)} />
          <span className={labelClass}>{t('page.startProcessing')}</span>
        </Button>
      )}
      {isSupplier && canEditOrders && order.status === 'PROCESSING' && (
        <Button
          size="sm"
          className={actionBtnClass}
          onClick={() => onStatusUpdate(order.id, 'SHIPPED')}
          aria-label={t('page.markShipped')}
          title={t('page.markShipped')}
          data-testid={`order-${order.id}-ship`}
        >
          <Truck className={cn('h-4 w-4', iconGap)} />
          <span className={labelClass}>{t('page.markShipped')}</span>
        </Button>
      )}
      {isSupplier &&
        canEditOrders &&
        order.status === 'SHIPPED' &&
        updatingOrderId !== order.id && (
          <Button
            size="sm"
            className={actionBtnClass}
            onClick={() => onStatusUpdate(order.id, 'DELIVERED')}
            aria-label={t('page.markDelivered')}
            title={t('page.markDelivered')}
            data-testid={`order-${order.id}-deliver`}
          >
            <Truck className={cn('h-4 w-4', iconGap)} />
            <span className={labelClass}>{t('page.markDelivered')}</span>
          </Button>
        )}
      {!isSupplier && order.status === 'PLACED' && (
        <Button
          variant="outline"
          size="sm"
          className={actionBtnClass}
          onClick={() => onSendReminder(order.id)}
          aria-label={t('page.sendReminder')}
          title={t('page.sendReminder')}
        >
          <AlertCircle className={cn('h-4 w-4', iconGap)} />
          <span className={labelClass}>{t('page.sendReminder')}</span>
        </Button>
      )}
      <Button variant="outline" size="sm" className={actionBtnClass} asChild>
        <Link
          to={`/app/orders/${order.id}`}
          aria-label={t('page.viewDetails')}
          title={t('page.viewDetails')}
        >
          <FileText className={cn('h-4 w-4', iconGap)} />
          <span className={labelClass}>{t('page.viewDetails')}</span>
        </Link>
      </Button>
      {isSupplier && (
        <Button variant="outline" size="sm" className={actionBtnClass} asChild>
          <Link
            to={`/app/orders/${order.id}?tab=packing`}
            aria-label={t('page.packingSlip')}
            title={t('page.packingSlip')}
          >
            <Package className={cn('h-4 w-4', iconGap)} />
            <span className={labelClass}>{t('page.packingSlip')}</span>
          </Link>
        </Button>
      )}
    </div>
  )
}

export function OrdersResponsiveList({
  orders,
  t,
  ordersTitle,
  isSupplier,
  canEditOrders,
  canDeclineOrder,
  canCreateOrders,
  disputesEnabled,
  allDisputes,
  updatingOrderId,
  hasActiveFilters,
  activeTab,
  onStatusUpdate,
  onSendReminder,
  onDecline,
}: OrdersResponsiveListProps) {
  const emptyState = (
    <EmptyState
      title={
        hasActiveFilters || activeTab !== 'all'
          ? t('page.emptyFilteredTitle')
          : t('page.emptyTitle')
      }
      description={
        hasActiveFilters || activeTab !== 'all'
          ? t('page.emptyFilteredDescription')
          : !isSupplier
            ? t('page.emptyRestaurantDescription')
            : t('page.emptySupplierDescription')
      }
      icon={<ShoppingCart className="h-10 w-10" aria-hidden />}
      action={
        !isSupplier && canCreateOrders && !hasActiveFilters && activeTab === 'all' ? (
          <Button asChild>
            <Link to="/app/cart">
              <Plus className="h-4 w-4 mr-2" />
              {t('page.createFirstOrder')}
            </Link>
          </Button>
        ) : undefined
      }
    />
  )

  return (
    <ResponsiveDataList
      items={orders}
      keyExtractor={(order) => order.id}
      tableAriaLabel={ordersTitle}
      tableMinWidth={640}
      emptyState={emptyState}
      renderCard={(order) => (
        <Card
          className="m-4 rounded-none border-0 shadow-none first:mt-0 hover:shadow-md transition-shadow sm:m-0 sm:border sm:shadow-sm"
          data-testid={`order-row-${order.id}`}
        >
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                  <CardTitle className="text-lg">
                    {t('page.orderNumber', {
                      id: order.id.slice(-8).toUpperCase(),
                    })}
                  </CardTitle>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[var(--text-muted)]" aria-hidden>
                      {getStatusIcon(order.status)}
                    </span>
                    <StatusBadge
                      status={order.status}
                      label={resolveOrderStatusLabel(
                        t,
                        order,
                        isSupplier ? 'SUPPLIER' : 'RESTAURANT'
                      )}
                    />
                    {isDisputeReplacementOrder(order) && (
                      <Badge variant="secondary">{t('page.replacement')}</Badge>
                    )}
                    {disputesEnabled && getActiveDisputeForOrder(allDisputes, order.id) && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 bg-amber-50 text-amber-800"
                      >
                        <Scale className="mr-1 h-3 w-3" aria-hidden />
                        {t('page.disputeOpen')}
                      </Badge>
                    )}
                    {!isSupplier &&
                      order.status === 'CANCELLED' &&
                      order.cancelled_by === 'SUPPLIER' &&
                      order.cancel_reason && (
                        <p className="mt-1 max-w-md text-xs text-red-700">{order.cancel_reason}</p>
                      )}
                  </span>
                  {order.status === 'PLACED' && isSupplier && (
                    <Badge variant="destructive">{t('page.actionRequired')}</Badge>
                  )}
                </div>
                <div className="space-y-1 text-sm text-[var(--text-muted)]">
                  <div>{t('page.restaurant', { name: order.restaurant_name })}</div>
                  <div>
                    {t('page.placed', {
                      date: new Date(order.placed_at || order.created_at).toLocaleString(),
                    })}
                  </div>
                  {!isSupplier && order.status === 'DELIVERED' && (
                    <div className="mt-2 rounded border border-[var(--app-border)] bg-[var(--brand-ultra)] p-2 text-xs text-[var(--brand-mid)]">
                      {t('page.deliveredReceiveHintBefore')}{' '}
                      <Link to={`/app/receiving?order=${order.id}`} className="underline">
                        {t('page.deliveredReceiveLink')}
                      </Link>{' '}
                      {t('page.deliveredReceiveHintAfter')}
                    </div>
                  )}
                  {isSupplier && order.status === 'DELIVERED' && (
                    <div className="mt-2 rounded border border-[var(--amber-mid)]/35 bg-[var(--amber-pale)] p-2 text-xs text-[var(--amber)]">
                      {t('page.awaitingReceivingHint')}
                    </div>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <div className="text-xl font-bold text-[var(--brand-mid)] sm:text-2xl">
                  ${formatPrice(order.total_amount)}
                </div>
                <div className="text-sm text-[var(--text-muted)]">
                  {t('page.itemsCount', { count: order.items?.length || 0 })}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 text-sm text-[var(--text-muted)]">{t('page.itemsLabel')}</div>
                <div className="flex flex-wrap gap-2">
                  {order.items?.slice(0, 3).map((item: any, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {item.product_name} × {item.quantity}
                    </Badge>
                  ))}
                  {order.items && order.items.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      {t('page.moreItems', { count: order.items.length - 3 })}
                    </Badge>
                  )}
                </div>
              </div>
              <CardActionGrid>
                {isSupplier && canEditOrders && order.status === 'PLACED' && (
                  <>
                    <Button
                      size="sm"
                      className={cardActionBtnClass()}
                      onClick={() => onStatusUpdate(order.id, 'ACKNOWLEDGED')}
                      data-testid={`order-${order.id}-acknowledge`}
                    >
                      {t('page.acknowledge')}
                    </Button>
                    {canDeclineOrder && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cardActionBtnClass()}
                        onClick={() => onDecline(order.id, order.restaurant_name)}
                        data-testid={`order-${order.id}-decline`}
                      >
                        {t('page.decline')}
                      </Button>
                    )}
                  </>
                )}
                {isSupplier && canEditOrders && order.status === 'ACKNOWLEDGED' && (
                  <Button
                    size="sm"
                    className={cardActionBtnClass()}
                    onClick={() => onStatusUpdate(order.id, 'PROCESSING')}
                    data-testid={`order-${order.id}-start-processing`}
                  >
                    {t('page.startProcessing')}
                  </Button>
                )}
                {isSupplier && canEditOrders && order.status === 'PROCESSING' && (
                  <Button
                    size="sm"
                    className={cardActionBtnClass()}
                    onClick={() => onStatusUpdate(order.id, 'SHIPPED')}
                    data-testid={`order-${order.id}-ship`}
                  >
                    {t('page.markShipped')}
                  </Button>
                )}
                {isSupplier &&
                  canEditOrders &&
                  order.status === 'SHIPPED' &&
                  updatingOrderId !== order.id && (
                    <Button
                      size="sm"
                      className={cardActionBtnClass()}
                      onClick={() => onStatusUpdate(order.id, 'DELIVERED')}
                      data-testid={`order-${order.id}-deliver`}
                    >
                      {t('page.markDelivered')}
                    </Button>
                  )}
                {isSupplier && (updatingOrderId === order.id || order.status === 'DELIVERED') && (
                  <Button
                    size="sm"
                    variant={order.status === 'DELIVERED' ? 'outline' : 'default'}
                    disabled
                    className={`${cardActionBtnClass()} cursor-not-allowed opacity-75`}
                  >
                    {updatingOrderId === order.id ? (
                      <>{t('page.updating')}</>
                    ) : (
                      <>
                        <CheckCircle className="mr-1 h-4 w-4" />
                        {t('page.delivered')}
                      </>
                    )}
                  </Button>
                )}
                {!isSupplier && order.status === 'PLACED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cardActionBtnClass()}
                    onClick={() => onSendReminder(order.id)}
                  >
                    <AlertCircle className="mr-1 h-4 w-4" />
                    {order.reminder_count > 0
                      ? t('page.remindCount', { count: order.reminder_count })
                      : t('page.sendReminder')}
                  </Button>
                )}
                <Button variant="outline" size="sm" className={cardActionBtnClass()} asChild>
                  <Link to={`/app/orders/${order.id}`}>
                    <FileText className="mr-1 h-4 w-4" />
                    {t('page.viewDetails')}
                  </Link>
                </Button>
                {isSupplier && (
                  <Button variant="outline" size="sm" className={cardActionBtnClass()} asChild>
                    <Link to={`/app/orders/${order.id}?tab=packing`}>
                      <Package className="mr-1 h-4 w-4" />
                      {t('page.packingSlip')}
                    </Link>
                  </Button>
                )}
              </CardActionGrid>
            </div>
          </CardContent>
        </Card>
      )}
      tableHeader={
        <thead className="bg-[var(--brand-ultra)]/80">
          <tr>
            <th className={thClass}>Order</th>
            <th className={cn(thClass, responsiveDataListClasses.columnSecondary)}>Restaurant</th>
            <th className={thClass}>Status</th>
            <th className={cn(thClass, responsiveDataListClasses.columnTertiary)}>Placed</th>
            <th className={cn(thClass, 'text-end', responsiveDataListClasses.columnSecondary)}>
              {t('page.itemsLabel')}
            </th>
            <th className={cn(thClass, 'text-end')}>
              {t('page.total', { defaultValue: 'Total' })}
            </th>
            <th className={cn(thClass, 'text-end')}>Actions</th>
          </tr>
        </thead>
      }
      renderTableRow={(order) => (
        <tr
          className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
          data-testid={`order-table-row-${order.id}`}
        >
          <td className={tdClass}>
            <Link
              to={`/app/orders/${order.id}`}
              className="font-medium text-[var(--brand-mid)] hover:underline"
            >
              {t('page.orderNumber', {
                id: order.id.slice(-8).toUpperCase(),
              })}
            </Link>
          </td>
          <td
            className={cn(
              tdClass,
              'max-w-[10rem] truncate',
              responsiveDataListClasses.columnSecondary
            )}
          >
            {order.restaurant_name}
          </td>
          <td className={tdClass}>
            <StatusBadge
              status={order.status}
              label={resolveOrderStatusLabel(t, order, isSupplier ? 'SUPPLIER' : 'RESTAURANT')}
            />
          </td>
          <td
            className={cn(
              tdClass,
              'text-[var(--text-muted)]',
              responsiveDataListClasses.columnTertiary
            )}
          >
            {new Date(order.placed_at || order.created_at).toLocaleDateString()}
          </td>
          <td
            className={cn(
              tdClass,
              'text-end tabular-nums',
              responsiveDataListClasses.columnSecondary
            )}
          >
            {order.items?.length || 0}
          </td>
          <td
            className={cn(tdClass, 'text-end font-semibold tabular-nums text-[var(--brand-mid)]')}
          >
            ${formatPrice(order.total_amount)}
          </td>
          <td className={cn(tdClass, 'text-end')}>
            <OrderTableActions
              order={order}
              t={t}
              isSupplier={isSupplier}
              canEditOrders={canEditOrders}
              canDeclineOrder={canDeclineOrder}
              updatingOrderId={updatingOrderId}
              onStatusUpdate={onStatusUpdate}
              onSendReminder={onSendReminder}
              onDecline={onDecline}
            />
          </td>
        </tr>
      )}
    />
  )
}
