import { Link } from 'react-router-dom'
import { PackageCheck, Loader2, Clock, AlertCircle, Truck, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/skeleton'
import { formatPrice } from '../../utils/format'
import { isOrderReadyForReceiving } from '../../lib/orderReceiving'

type ReceivingPendingTabProps = {
  pendingLoading: boolean
  pendingOrders: any[]
  receivingOrderIds: Set<string>
  canReceive: boolean
  isCreating: boolean
  onReceive: (order: any) => void
}

export function ReceivingPendingTab({
  pendingLoading,
  pendingOrders,
  receivingOrderIds,
  canReceive,
  isCreating,
  onReceive,
}: ReceivingPendingTabProps) {
  if (pendingLoading) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  if (pendingOrders.length === 0) {
    return (
      <EmptyState
        title="No orders awaiting receiving"
        description="Delivered orders ready to receive will show up here."
        icon={<PackageCheck className="h-10 w-10" aria-hidden />}
      />
    )
  }

  return (
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
                          <span>Supplier acknowledged. Order is being prepared.</span>
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
                            Order is in transit. Waiting for supplier to mark as delivered.
                          </span>
                        </>
                      )}
                      {!['PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED'].includes(status) && (
                        <>
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>
                            Order status: {status || 'unknown'}. Waiting for supplier to mark as
                            delivered.
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {order.has_receiving_report || receivingOrderIds.has(order.id) ? (
                  <Button disabled variant="outline" className="cursor-not-allowed opacity-75">
                    <PackageCheck className="h-4 w-4 mr-2" />
                    Received
                  </Button>
                ) : readyToReceive && canReceive ? (
                  <Button
                    className="min-h-[44px] w-full shrink-0 sm:w-auto"
                    onClick={() => onReceive(order)}
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
  )
}
