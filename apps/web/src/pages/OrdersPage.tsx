import { useState } from 'react'
import {
  useGetOrdersQuery,
  useUpdateOrderMutation,
  useCreateManualOrderMutation,
  useGetRestaurantsQuery,
  useGetProductsQuery,
  useSendOrderReminderMutation,
} from '../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { ShoppingCart, Search, Plus, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import toast from 'react-hot-toast'
import { formatPrice } from '../utils/format'
import { OrderStatusPill } from '../components/OrderStatusPill'

export function OrdersPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [showManualOrderDialog, setShowManualOrderDialog] = useState(false)
  const [showProductSelection, setShowProductSelection] = useState(false)
  const [selectedRestaurant, setSelectedRestaurant] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [manualOrderItems, setManualOrderItems] = useState<
    Array<{
      productId: string
      quantity: number
      notes?: string
      productName?: string
      price?: number
    }>
  >([])
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'

  const { data, isLoading, error, refetch } = useGetOrdersQuery(
    {
      status: status || undefined,
      limit: 100,
      offset: 0,
    },
    {
      // Refetch when component mounts or when query is invalidated
      refetchOnMountOrArgChange: true,
      // Auto-refresh lightly: when window regains focus or reconnects
      refetchOnFocus: true,
      refetchOnReconnect: true,
      // Poll every 20s to catch status changes without user action
      pollingInterval: 20000,
    }
  )

  const { data: restaurantsData } = useGetRestaurantsQuery(undefined, { skip: !isSupplier })
  const { data: productsData } = useGetProductsQuery({ limit: 1000 })
  const [updateOrder] = useUpdateOrderMutation()
  const [createManualOrder, { isLoading: isCreatingManualOrder }] = useCreateManualOrderMutation()
  const [sendReminder] = useSendOrderReminderMutation()

  const handleAddProductToOrder = (product: any) => {
    const existingItem = manualOrderItems.find((item) => item.productId === product.id)
    if (existingItem) {
      setManualOrderItems(
        manualOrderItems.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      setManualOrderItems([
        ...manualOrderItems,
        {
          productId: product.id,
          quantity: 1,
          productName: product.name,
          price: product.price,
        },
      ])
    }
  }

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setManualOrderItems(manualOrderItems.filter((item) => item.productId !== productId))
    } else {
      setManualOrderItems(
        manualOrderItems.map((item) =>
          item.productId === productId ? { ...item, quantity } : item
        )
      )
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
        notes: orderNotes,
      }).unwrap()

      toast.success('Order created successfully!')
      setShowManualOrderDialog(false)
      setShowProductSelection(false)
      setSelectedRestaurant('')
      setOrderNotes('')
      setManualOrderItems([])
      refetch()
    } catch (error: any) {
      const errorMessage = error?.data?.error?.message || 'Failed to create order'
      const errorName = error?.data?.error?.name

      // For limit exceeded errors, show a more helpful message with upgrade suggestion
      if (errorName === 'LIMIT_EXCEEDED') {
        toast.error(errorMessage, {
          duration: 6000,
          icon: '⚠️',
        })
        // Show additional toast with upgrade link
        setTimeout(() => {
          toast(
            (t) => (
              <div className="flex items-center gap-3">
                <span>💡 Want more orders? Upgrade your subscription!</span>
                <button
                  onClick={() => {
                    toast.dismiss(t.id)
                    window.location.href = '/app/settings'
                  }}
                  className="px-3 py-1 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
                >
                  View Plans
                </button>
              </div>
            ),
            {
              duration: 8000,
            }
          )
        }, 500)
      } else {
        toast.error(errorMessage)
      }
    }
  }

  const filteredProducts = productsData?.products?.filter(
    (product: any) =>
      product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      product.sku?.toLowerCase().includes(productSearch.toLowerCase())
  )

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
    const matchesSearch =
      search === '' ||
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.restaurant_name?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      activeTab === 'all' ||
      (activeTab === 'new' && order.status === 'PLACED') ||
      (activeTab === 'processing' &&
        ['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED'].includes(order.status)) ||
      (activeTab === 'shipped' && order.status === 'SHIPPED') ||
      (activeTab === 'completed' &&
        ['RECEIVED_FULL', 'INVOICED', 'COMPLETED'].includes(order.status))

    return matchesSearch && matchesStatus
  })

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-start">
          <div>
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardContent>
        </Card>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
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
    <div className="space-y-4" data-testid="orders-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
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
              <Link to="/app/cart" data-testid="orders-create-new-order">
                <Plus className="h-4 w-4 mr-2" />
                Create New Order
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Sticky filters */}
      <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-gray-50/95 backdrop-blur border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by order ID or restaurant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="PLACED">Placed</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="PROCESSING">Processing</option>
              <option value="SHIPPED">Shipped</option>
              <option value="DELIVERED">Delivered</option>
              <option value="RECEIVED_PARTIAL">Received (Partial)</option>
              <option value="RECEIVED_FULL">Received (Full)</option>
              <option value="INVOICED">Invoiced</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-white">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="new">New</TabsTrigger>
                <TabsTrigger value="processing">Processing</TabsTrigger>
                <TabsTrigger value="shipped">Shipped</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} className="space-y-4">
        <TabsContent value={activeTab} className="space-y-3 mt-4">
          {filteredOrders?.map((order: any) => (
            <Card
              key={order.id}
              className="hover:shadow-md transition-shadow overflow-hidden"
              data-testid={`order-row-${order.id}`}
            >
              {/* Top row: ID + name | Status | Primary action */}
              <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">
                    #{order.id.slice(-8).toUpperCase()}
                    <span className="text-gray-500 font-normal ml-1">
                      {order.restaurant_name || order.supplier_name || ''}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(order.placed_at || order.created_at).toLocaleString()}
                    {order.items?.length != null && ` · ${order.items.length} items`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <OrderStatusPill status={order.status} />
                  {order.status === 'PLACED' && isSupplier && (
                    <Badge variant="destructive" className="text-xs">
                      Action required
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isSupplier && order.status === 'PLACED' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(order.id, 'ACKNOWLEDGED')}
                        data-testid={`order-${order.id}-acknowledge`}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusUpdate(order.id, 'CANCELLED')}
                        data-testid={`order-${order.id}-decline`}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                  {isSupplier && order.status === 'ACKNOWLEDGED' && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusUpdate(order.id, 'PROCESSING')}
                      data-testid={`order-${order.id}-start-processing`}
                    >
                      Start Processing
                    </Button>
                  )}
                  {isSupplier && order.status === 'PROCESSING' && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusUpdate(order.id, 'SHIPPED')}
                      data-testid={`order-${order.id}-ship`}
                    >
                      Mark Shipped
                    </Button>
                  )}
                  {isSupplier && order.status === 'SHIPPED' && updatingOrderId !== order.id && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusUpdate(order.id, 'DELIVERED')}
                      data-testid={`order-${order.id}-deliver`}
                    >
                      Mark Delivered
                    </Button>
                  )}
                  {isSupplier && (updatingOrderId === order.id || order.status === 'DELIVERED') && (
                    <Button size="sm" variant="outline" disabled className="opacity-75">
                      {updatingOrderId === order.id ? 'Updating...' : 'Delivered'}
                    </Button>
                  )}
                  {!isSupplier && order.status === 'PLACED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendReminder(order.id)}
                    >
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {order.reminder_count > 0 ? `Remind (${order.reminder_count})` : 'Remind'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/app/orders/${order.id}`}>View</Link>
                  </Button>
                </div>
              </div>
              {/* Details row */}
              <CardContent className="p-4 pt-0">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    {order.items?.slice(0, 3).map((item: any, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {item.product_name} × {item.quantity}
                      </Badge>
                    ))}
                    {order.items?.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{order.items.length - 3} more
                      </Badge>
                    )}
                  </div>
                  <div className="text-lg font-semibold text-gray-900">
                    {formatPrice(order.total_amount)}
                  </div>
                </div>
                {!isSupplier && order.status === 'DELIVERED' && (
                  <div className="mt-3 p-2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                    Supplier marked as delivered.{' '}
                    <Link to={`/app/receiving?order=${order.id}`} className="underline">
                      Receive this order
                    </Link>
                  </div>
                )}
                {isSupplier && order.status === 'DELIVERED' && (
                  <div className="mt-3 p-2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-xs">
                    Awaiting restaurant receiving.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {(!filteredOrders || filteredOrders.length === 0) && (
            <div className="text-center py-12 rounded-lg border border-dashed border-gray-300 bg-gray-50/50">
              <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">No orders match your filters</p>
              <p className="text-sm text-gray-500 mt-1">
                {!isSupplier
                  ? 'Create your first order to get started.'
                  : 'Orders from restaurants will appear here.'}
              </p>
              {!isSupplier && (
                <Button asChild className="mt-4">
                  <Link to="/app/cart">
                    <Plus className="h-4 w-4 mr-2" />
                    Create first order
                  </Link>
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                          <p className="text-sm text-gray-600">${formatPrice(item.price)} each</p>
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
                disabled={
                  !selectedRestaurant || manualOrderItems.length === 0 || isCreatingManualOrder
                }
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
            <DialogDescription>Search and add products to the order</DialogDescription>
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
                      ${formatPrice(product.price)} / {product.unit}
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
                <div className="text-center py-8 text-gray-500">No products found</div>
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
