import { useGetOrderQuery } from '../../../services/api'
import { OrderProofOfDeliveryPanel } from '../../fulfillment/OrderProofOfDeliveryPanel'
import { useImpersonation } from '../../../hooks/useImpersonation'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Truck, MapPin } from 'lucide-react'
import {
  OrderDetailTabLoading,
  formatAddressLines,
  formatOperatingHours,
} from './orderDetailShared'

export interface OrderDeliveryTabProps {
  orderId: string
}

export function OrderDeliveryTab({ orderId }: OrderDeliveryTabProps) {
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { data, isLoading } = useGetOrderQuery(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order
  const deliveryAddress = (order as any).branch_address ?? (order as any).restaurant_address
  const deliveryInstructions =
    (order as any).branch_delivery_instructions ?? (order as any).restaurant_delivery_instructions
  const deliveryPhone = (order as any).branch_phone ?? (order as any).restaurant_phone
  const addressLines = formatAddressLines(deliveryAddress)
  const operatingHoursLabel = formatOperatingHours((order as any).restaurant_operating_hours)

  return (
    <div className="space-y-6">
      {isSupplier && <OrderProofOfDeliveryPanel orderId={orderId} />}
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
                <p className="text-sm text-[var(--text-muted)]">No delivery address on file</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
