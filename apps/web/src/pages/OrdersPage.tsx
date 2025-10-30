import { useState } from 'react'
import { useGetOrdersQuery, useUpdateOrderMutation, useCreateManualOrderMutation, useGetRestaurantsQuery, useGetProductsQuery, useSendOrderReminderMutation } from '../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { 
  ShoppingCart, 
  Search,
  Package,
  Truck,
  FileText,
  CheckCircle,
  Clock,
  Filter,
  Plus,
  AlertCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import toast from 'react-hot-toast'

export function OrdersPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [showManualOrderDialog, setShowManualOrderDialog] = useState(false)
  const [showProductSelection, setShowProductSelection] = useState(false)
  const [selectedRestaurant, setSelectedRestaurant] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [manualOrderItems, setManualOrderItems] = useState<Array<{ productId: string; quantity: number; notes?: string; productName?: string; price?: number }>>([])
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  
  const { data, isLoading, error, refetch } = useGetOrdersQuery({
    status: status || undefined,
    limit: 100,
    offset: 0,
  }, {
    // Refetch when component mounts or when query is invalidated
    refetchOnMountOrArgChange: true,
  })
  
  const { data: restaurantsData } = useGetRestaurantsQuery(undefined, { skip: !isSupplier })
  const { data: productsData } = useGetProductsQuery({ limit: 1000 })
  const [updateOrder] = useUpdateOrderMutation()
  const [createManualOrder, { isLoading: isCreatingManualOrder }] = useCreateManualOrderMutation()
  const [sendReminder] = useSendOrderReminderMutation()

  const handleAddProductToOrder = (product: any) => {
    const existingItem = manualOrderItems.find(item => item.productId === product.id)
    if (existingItem) {
      setManualOrderItems(manualOrderItems.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setManualOrderItems([...manualOrderItems, {
        productId: product.id,
        quantity: 1,
        productName: product.name,
        price: product.price
      }])
    }
  }

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setManualOrderItems(manualOrderItems.filter(item => item.productId !== productId))
    } else {
      setManualOrderItems(manualOrderItems.map(item =>
        item.productId === productId
          ? { ...item, quantity }
          : item
      ))
    }
  }

  const handleCreateOrder = async () => {
    if (!selectedRestaurant) {
      toast.error('Please select a restaurant')
      return
    }

    if (manualOrderItems.length === 0) {
      toast.error('Please add at least one product to the order')
      return
    }

    try {
      await createManualOrder({
        restaurant_id: selectedRestaurant,
        items: manualOrderItems,
        notes: orderNotes
      }).unwrap()
      
      toast.success('Order created successfully!')
      setShowManualOrderDialog(false)
      setShowProductSelection(false)
      setSelectedRestaurant('')
      setOrderNotes('')
      setManualOrderItems([])
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create order')
    }
  }

  const filteredProducts = productsData?.products?.filter((product: any) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.sku?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PLACED':
        return 'default'
      case 'ACKNOWLEDGED':
        return 'secondary'
      case 'PROCESSING':
        return 'default'
      case 'SHIPPED':
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
        return <Truck className="h-4 w-4" />
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  
  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    if (updatingOrderId === orderId) return // Prevent multiple clicks
    
    try {
      setUpdatingOrderId(orderId) // Set immediately - button will be replaced by disabled button
      await updateOrder({ id: orderId, data: { status: newStatus } }).unwrap()
      toast.success(`Order status updated to ${newStatus}`)
      
      // Refetch to get updated data
      const refetchResult = await refetch()
      
      // For COMPLETED status, keep button disabled permanently (it will be replaced by disabled "Completed" button)
      // Don't clear updatingOrderId - let the component re-render with new order.status to show the correct button
      if (newStatus === 'COMPLETED') {
        const updatedOrder = refetchResult.data?.orders?.find((o: any) => o.id === orderId)
        if (updatedOrder?.status === 'COMPLETED') {
          // Order confirmed as COMPLETED - component will show disabled "Completed" button
          // Clear updatingOrderId after a delay to allow component to re-render
          setTimeout(() => {
            setUpdatingOrderId(null)
          }, 1000)
        }
      } else {
        // For other statuses, clear immediately
        setUpdatingOrderId(null)
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update order status')
      setUpdatingOrderId(null)
    }
  }

  const handleSendReminder = async (orderId: string) => {
    try {
      await sendReminder(orderId).unwrap()
      toast.success('Reminder sent to supplier successfully')
      refetch() // Refresh orders to update reminder count
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to send reminder')
    }
  }

  // Filter orders based on search and status
  const filteredOrders = data?.orders.filter((order: any) => {
    const matchesSearch = search === '' || 
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.restaurant_name?.toLowerCase().includes(search.toLowerCase())
    
    const matchesStatus = activeTab === 'all' || 
      (activeTab === 'new' && order.status === 'PLACED') ||
      (activeTab === 'processing' && ['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED'].includes(order.status)) ||
      (activeTab === 'completed' && order.status === 'COMPLETED')
    
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
        <div className="flex gap-2">
          {isSupplier && (
            <Button onClick={() => setShowManualOrderDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Order
            </Button>
          )}
          {!isSupplier && (
            <Button asChild>
              <Link to="/app/cart">
                <Plus className="h-4 w-4 mr-2" />
                Create New Order
              </Link>
            </Button>
          )}
        </div>
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
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>Restaurant: {order.restaurant_name}</div>
                        <div>
                          Placed: {new Date(order.placed_at || order.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {typeof order.total_amount === 'number' && !isNaN(order.total_amount)
                          ? `$${order.total_amount.toFixed(2)}`
                          : typeof order.total_amount === 'string' && !isNaN(parseFloat(order.total_amount))
                          ? `$${parseFloat(order.total_amount).toFixed(2)}`
                          : '$0.00'}
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
                      {isSupplier && order.status === 'SHIPPED' && updatingOrderId !== order.id && (
                        <Button 
                          size="sm"
                          onClick={() => handleStatusUpdate(order.id, 'COMPLETED')}
                          disabled={false}
                        >
                          Complete Order
                        </Button>
                      )}
                      {isSupplier && (updatingOrderId === order.id || order.status === 'COMPLETED') && (
                        <Button 
                          size="sm"
                          variant={order.status === 'COMPLETED' ? 'outline' : 'default'}
                          disabled
                          className="cursor-not-allowed opacity-75"
                        >
                          {updatingOrderId === order.id ? (
                            <>Completing...</>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Completed
                            </>
                          )}
                        </Button>
                      )}
                      {!isSupplier && order.status === 'PLACED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendReminder(order.id)}
                        >
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {order.reminder_count > 0 ? `Remind (${order.reminder_count})` : 'Send Reminder'}
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

              {/* Products in Order */}
              {manualOrderItems.length > 0 && (
                <div className="space-y-2">
                  <Label>Products in Order</Label>
                  <div className="border rounded-md divide-y">
                    {manualOrderItems.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between p-3">
                        <div className="flex-1">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-sm text-gray-600">${item.price?.toFixed(2)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1)}
                          >
                            -
                          </Button>
                          <span className="w-12 text-center">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Products Button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowProductSelection(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Products
              </Button>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowManualOrderDialog(false)
                  setSelectedRestaurant('')
                  setOrderNotes('')
                  setManualOrderItems([])
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedRestaurant || manualOrderItems.length === 0 || isCreatingManualOrder}
                onClick={handleCreateOrder}
              >
                {isCreatingManualOrder ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Product Selection Dialog */}
      <Dialog open={showProductSelection} onOpenChange={setShowProductSelection}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Products</DialogTitle>
            <DialogDescription>
              Search and add products to the order
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Product List */}
            <div className="border rounded-md max-h-96 overflow-y-auto divide-y">
              {filteredProducts?.map((product: any) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.sku}</p>
                    <p className="text-sm font-semibold text-green-600">
                      ${product.price?.toFixed(2)} / {product.unit}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      handleAddProductToOrder(product)
                      toast.success(`Added ${product.name} to order`)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              ))}

              {(!filteredProducts || filteredProducts.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  No products found
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductSelection(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
