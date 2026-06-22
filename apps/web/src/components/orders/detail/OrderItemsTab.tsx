import { useTranslation } from 'react-i18next'
import { useGetOrderQuery } from '../../../services/api'
import { AppPanel } from '../../ui/app-panel'
import { Badge } from '../../ui/badge'
import { formatPrice } from '../../../utils/format'
import { OrderDetailTabLoading } from './orderDetailShared'

export interface OrderItemsTabProps {
  orderId: string
}

export function OrderItemsTab({ orderId }: OrderItemsTabProps) {
  const { t } = useTranslation('orders')
  const { data, isLoading } = useGetOrderQuery(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order

  return (
    <AppPanel
      title={t('itemsTab.title')}
      description={t('itemsTab.description', { count: order.items?.length || 0 })}
    >
      {(order as any).multiLocationFulfillment && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {t('itemsTab.multiLocationHint')}
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
                      {item.product_name || t('itemsTab.productFallback')}
                    </h4>
                    <Badge variant="outline">
                      {t('itemsTab.sku', { sku: item.product_sku || t('itemsTab.notAvailable') })}
                    </Badge>
                    {assignment && (
                      <Badge variant="secondary">
                        {assignment.warehouse_name} · {assignment.status}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[var(--text-muted)]">
                    <div>
                      <span className="font-medium">{t('itemsTab.quantity')}</span> {item.quantity}
                    </div>
                    <div>
                      <span className="font-medium">{t('itemsTab.unitPrice')}</span> $
                      {formatPrice(item.unit_price)}
                    </div>
                    {item.supplier_name && (
                      <div>
                        <span className="font-medium">{t('itemsTab.supplier')}</span>{' '}
                        {item.supplier_name}
                      </div>
                    )}
                    {item.location && (
                      <div>
                        <span className="font-medium">{t('itemsTab.location')}</span>{' '}
                        {item.location}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[var(--brand-mid)]">
                    ${formatPrice(item.line_total)}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('itemsTab.lineTotal', {
                      quantity: item.quantity,
                      price: formatPrice(item.unit_price),
                    })}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </AppPanel>
  )
}
