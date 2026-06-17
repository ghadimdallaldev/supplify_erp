import { useGetOrderQuery } from '../../../services/api'
import { AppPanel } from '../../ui/app-panel'
import { Badge } from '../../ui/badge'
import { formatPrice } from '../../../utils/format'
import { OrderDetailTabLoading } from './orderDetailShared'

export interface OrderItemsTabProps {
  orderId: string
}

export function OrderItemsTab({ orderId }: OrderItemsTabProps) {
  const { data, isLoading } = useGetOrderQuery(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order

  return (
    <AppPanel title="Order Items" description={`${order.items?.length || 0} items`}>
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
                    <h4 className="font-semibold text-lg">{item.product_name || 'Product'}</h4>
                    <Badge variant="outline">SKU: {item.product_sku || 'N/A'}</Badge>
                    {assignment && (
                      <Badge variant="secondary">
                        {assignment.warehouse_name} · {assignment.status}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[var(--text-muted)]">
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
    </AppPanel>
  )
}
