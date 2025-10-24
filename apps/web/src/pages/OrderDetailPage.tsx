import { useParams } from 'react-router-dom'
import { useGetOrderQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ArrowLeft, Calendar, DollarSign, Package } from 'lucide-react'
import { Link } from 'react-router-dom'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  
  const { data, isLoading, error } = useGetOrderQuery(id!)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PLACED':
        return 'bg-blue-100 text-blue-800'
      case 'CONFIRMED':
        return 'bg-yellow-100 text-yellow-800'
      case 'FULFILLING':
        return 'bg-purple-100 text-purple-800'
      case 'COMPLETED':
        return 'bg-green-100 text-green-800'
      case 'CANCELLED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Order not found</p>
      </div>
    )
  }

  const order = data.order

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/orders">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Order #{order.id.slice(-8)}</CardTitle>
                  <CardDescription>
                    {order.restaurant_name} • {new Date(order.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
                <Badge className={getStatusColor(order.status)}>
                  {order.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{item.product_name}</h4>
                      <p className="text-sm text-gray-600">SKU: {item.product_sku}</p>
                      <p className="text-sm text-gray-600">Supplier: {item.supplier_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${item.line_total.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">
                        {item.quantity} × ${item.unit_price.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>${order.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span>$0.00</span>
              </div>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span>${order.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-gray-600">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              {order.placed_at && (
                <div className="flex items-center space-x-2 text-sm">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="font-medium">Placed</p>
                    <p className="text-gray-600">
                      {new Date(order.placed_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-2 text-sm">
                <Package className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="font-medium">Items</p>
                  <p className="text-gray-600">{order.items?.length || 0} items</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
