import { useState } from 'react'
import { useGetOrdersQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ShoppingCart, Calendar, DollarSign } from 'lucide-react'
import { Link } from 'react-router-dom'

export function OrdersPage() {
  const [status, setStatus] = useState('')
  
  const { data, isLoading, error } = useGetOrdersQuery({
    status: status || undefined,
    limit: 20,
    offset: 0,
  })

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

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load orders</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-600 mt-2">
            Manage your orders and track their status
          </p>
        </div>
      </div>

      <div className="flex space-x-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          <option value="PLACED">Placed</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="FULFILLING">Fulfilling</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="space-y-4">
        {data?.orders.map((order) => (
          <Card key={order.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Order #{order.id.slice(-8)}</CardTitle>
                  <CardDescription>
                    {order.restaurant_name} • {new Date(order.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className={getStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/app/orders/${order.id}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <DollarSign className="h-4 w-4" />
                  <span>${order.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {order.placed_at 
                      ? new Date(order.placed_at).toLocaleDateString()
                      : 'Not placed yet'
                    }
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <ShoppingCart className="h-4 w-4" />
                  <span>{order.items?.length || 0} items</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.orders.length === 0 && (
        <div className="text-center py-12">
          <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No orders found</p>
        </div>
      )}
    </div>
  )
}
