import { useState } from 'react'
import { useGetOrdersQuery, useUpdateOrderMutation, useCreateManualOrderMutation, useGetRestaurantsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { 
  ShoppingCart, 
  Calendar, 
  DollarSign, 
  Search,
  Package,
  Truck,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Filter,
  Plus,
  X
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import toast from 'react-hot-toast'

export function OrdersPage() {
  const [status, setStatus] = useState('')
  const [customer, setCustomer] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [showManualOrderDialog, setShowManualOrderDialog] = useState(false)
  const [selectedRestaurant, setSelectedRestaurant] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [manualOrderItems, setManualOrderItems] = useState<Array<{ productId: string; quantity: number; notes?: string }>>([])
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  
  const { data, isLoading, error, refetch } = useGetOrdersQuery({
    status: status || undefined,
    limit: 100,
    offset: 0,
  })
  
  const { data: restaurantsData } = useGetRestaurantsQuery()
  const [updateOrder] = useUpdateOrderMutation()
  const [createManualOrder, { isLoading: isCreatingManualOrder }] = useCreateManualOrderMutation()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PLACED':
        return 'default'
      case 'ACKNOWLEDGED':
        return 'secondary'
      case 'PROCESSING':
        return 'default'
      case 'SHIPPED':
      case 'DISPATCHED':
        return 'default'
      case 'DELIVERED':
        return 'default'
      case 'COMPLETED':
        return 'default'
      case 'CANCELLED':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACKNOWLEDGED':
        return <CheckCircle className="h-4 w-4" />
      case 'PROCESSING':
        return <Package className="h-4 w-4" />
      case 'SHIPPED':
      case 'DISPATCHED':
        return <Truck className="h-4 w-4" />
      case 'DELIVERED':
        return <CheckCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await updateOrder({ id: orderId, status: newStatus }).unwrap()
      toast.success(`Order status updated to ${newStatus}`)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update order status')
    }
  }

  // Filter orders based on search and status
  const filteredOrders = data?.orders.filter((order: any) => {
    const matchesSearch = search === '' || 
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.restaurant_name?.toLowerCase().includes(search.toLowerCase())
    
    const matchesStatus = activeTab === 'all' || 
      (activeTab === 'new' && order.status === 'PLACED') ||
      (activeTab === 'processing' && ['ACKNOWLEDGED', 'PROCESSING'].includes(order.status)) ||
      (activeTab === 'shipped' && ['SHIPPED', 'DISPATCHED'].includes(order.status)) ||
      (activeTab === 'completed' && order.status === 'DELIVERED')
    
    return matchesSearch && matchesStatus
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    const errorMessage = (error as any)?.data?.error?.message || 'Failed to load orders'
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-lg font-semibold mb-2">Failed to load orders</p>
        <p className="text-gray-600 text-sm">{errorMessage}</p>
        <Button onClick={() => refetch()} className="mt-4">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders Inbox</h1>
          <p className="text-gray-600 mt-2">
            {isSupplier 
              ? 'Manage inbound orders from restaurants' 
              : 'Track your orders and their status'}
          </p>
        </div>
        {isSupplier && (
          <Button onClick={() => setShowManualOrderDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Order
          </Button>
        )}
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by order ID or restaurant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All Statuses</option>
                <option value="PLACED">Placed</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="PROCESSING">Processing</option>
                <option value="SHIPPED">Shipped</option>
                <option value="DELIVERED">Delivered</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                More Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Orders</TabsTrigger>
          <TabsTrigger value="new">New (Needs Action)</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="shipped">Shipped</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <div className="space-y-4">
            {filteredOrders?.map((order: any) => (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg">
                          Order #{order.id.slice(-8).toUpperCase()}
                        </CardTitle>
                        <Badge variant={getStatusColor(order.status)} className="flex items-center gap-1">
                          {getStatusIcon(order.status)}
                          {order.status}
                        </Badge>
                        {order.status === 'PLACED' && isSupplier && (
                          <Badge variant="destructive">Action Required</Badge>
                        )}
                      </div>
                      <CardDescription className="space-y-1">
                        <div>Restaurant: {order.restaurant_name}</div>
                        <div>
                          Placed: {new Date(order.placed_at || order.created_at).toLocaleString()}
                        </div>
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        ${order.total_amount?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-sm text-gray-600">
                        {order.items?.length || 0} items
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    {/* Order Items Preview */}
                    <div className="flex-1">
                      <div className="text-sm text-gray-600 mb-2">Items:</div>
                      <div className="flex flex-wrap gap-2">
                        {order.items?.slice(0, 3).map((item: any, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {item.product_name} × {item.quantity}
                          </Badge>
                        ))}
                        {order.items && order.items.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{order.items.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {isSupplier && order.status === 'PLACED' && (
                        <>
                          <Button 
                            size="sm"
                            onClick={() => handleStatusUpdate(order.id, 'ACKNOWLEDGED')}
                          >
                            Acknowledge
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleStatusUpdate(order.id, 'CANCELLED')}
                          >
                            Decline
                          </Button>
                        </>
                      )}
                      {isSupplier && order.status === 'ACKNOWLEDGED' && (
                        <Button 
                          size="sm"
                          onClick={() => handleStatusUpdate(order.id, 'PROCESSING')}
                        >
                          Start Processing
                        </Button>
                      )}
                      {isSupplier && order.status === 'PROCESSING' && (
                        <Button 
                          size="sm"
                          onClick={() => handleStatusUpdate(order.id, 'SHIPPED')}
                        >
                          Mark as Shipped
                        </Button>
                      )}
                      {isSupplier && order.status === 'SHIPPED' && (
                        <Button 
                          size="sm"
                          variant="default"
                          onClick={() => handleStatusUpdate(order.id, 'DELIVERED')}
                        >
                          Mark as Delivered
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/app/orders/${order.id}`}>
                          <FileText className="h-4 w-4 mr-1" />
                          View Details
                        </Link>
                      </Button>
                      {isSupplier && (
                        <Button variant="outline" size="sm">
                          <Package className="h-4 w-4 mr-1" />
                          Packing Slip
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {(!filteredOrders || filteredOrders.length === 0) && (
            <div className="text-center py-12">
              <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No orders found</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Manual Order Creation Dialog */}
      {isSupplier && (
        <Dialog open={showManualOrderDialog} onOpenChange={setShowManualOrderDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Manual Order</DialogTitle>
              <DialogDescription>
                Create an order for a restaurant (for phone calls, chat orders, etc.)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Restaurant Selection */}
              <div className="space-y-2">
                <Label htmlFor="restaurant">Restaurant *</Label>
                <select
                  id="restaurant"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={selectedRestaurant}
                  onChange={(e) => setSelectedRestaurant(e.target.value)}
                >
                  <option value="">Select a restaurant</option>
                  {restaurantsData?.restaurants?.map((restaurant: any) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Order Notes */}
              <div className="space-y-2">
                <Label htmlFor="orderNotes">Order Notes</Label>
                <textarea
                  id="orderNotes"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Additional notes for this order..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Product selection will be available in the next step.
                  For now, use the existing order interface to create a complete order.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowManualOrderDialog(false)
                  setSelectedRestaurant('')
                  setOrderNotes('')
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedRestaurant || isCreatingManualOrder}
                onClick={async () => {
                  if (!selectedRestaurant) {
                    toast.error('Please select a restaurant')
                    return
                  }

                  // For now, show a message that this feature is coming soon
                  toast.success('Manual order creation is coming soon! Use the existing order flow for now.')
                  setShowManualOrderDialog(false)
                  
                  // TODO: Implement full order creation with product selection
                  // const order = await createManualOrder({
                  //   restaurant_id: selectedRestaurant,
                  //   items: manualOrderItems,
                  //   notes: orderNotes
                  // }).unwrap()
                  
                  // toast.success('Order created successfully!')
                  // setShowManualOrderDialog(false)
                  // refetch()
                }}
              >
                {isCreatingManualOrder ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
