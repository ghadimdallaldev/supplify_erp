import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGetOrderQuery, useUpdateOrderMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  Package,
  FileText,
  Truck,
  AlertCircle,
  Printer,
  Download,
  Edit,
  Check,
  X,
  ClipboardList,
  MapPin
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import toast from 'react-hot-toast'

const formatPrice = (price: any): string => {
  if (typeof price === 'number' && !isNaN(price)) {
    return price.toFixed(2)
  }
  if (typeof price === 'string' && !isNaN(parseFloat(price))) {
    return parseFloat(price).toFixed(2)
  }
  return '0.00'
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  const [showPickingNotes, setShowPickingNotes] = useState(false)
  const [showDeliveryNotes, setShowDeliveryNotes] = useState(false)
  
  const { data, isLoading, error, refetch } = useGetOrderQuery(id!)
  const [updateOrder] = useUpdateOrderMutation()

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

  const handleStatusUpdate = async (newStatus: string) => {
    if (!id) return
    try {
      await updateOrder({ id, data: { status: newStatus } }).unwrap()
      toast.success(`Order status updated to ${newStatus}`)
      refetch() // Refresh order data to show updated status
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update order status')
    }
  }

  const handlePrintPackingSlip = () => {
    window.print()
    toast.success('Preparing packing slip for printing...')
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/orders">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Orders
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Order #{order.id.slice(-8).toUpperCase()}</h1>
            <p className="text-gray-600">{order.restaurant_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusColor(order.status)} className="text-lg px-3 py-1">
            {order.status}
          </Badge>
          {isSupplier && (
            <div className="flex gap-2 ml-4">
              {order.status === 'PLACED' && (
                <>
                  <Button 
                    size="sm"
                    onClick={() => handleStatusUpdate('ACKNOWLEDGED')}
                  >
                    Acknowledge
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleStatusUpdate('CANCELLED')}
                  >
                    Decline
                  </Button>
                </>
              )}
              {order.status === 'ACKNOWLEDGED' && (
                <Button 
                  size="sm"
                  onClick={() => handleStatusUpdate('PROCESSING')}
                >
                  Start Processing
                </Button>
              )}
              {order.status === 'PROCESSING' && (
                <Button 
                  size="sm"
                  onClick={() => handleStatusUpdate('SHIPPED')}
                >
                  Mark as Shipped
                </Button>
              )}
              {order.status === 'SHIPPED' && (
                <Button 
                  size="sm"
                  variant="default"
                  onClick={() => handleStatusUpdate('COMPLETED')}
                >
                  Complete Order
                </Button>
              )}
              {order.status === 'COMPLETED' && (
                <Button 
                  size="sm"
                  variant="outline"
                  disabled
                >
                  <Check className="h-4 w-4 mr-1" />
                  Completed
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Order Details</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          {isSupplier && <TabsTrigger value="picking">Picking Notes</TabsTrigger>}
          {isSupplier && <TabsTrigger value="delivery">Delivery Info</TabsTrigger>}
          {isSupplier && <TabsTrigger value="packing">Packing Slip</TabsTrigger>}
        </TabsList>

        {/* Order Details Tab */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Order Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Order ID</p>
                      <p className="font-medium">{order.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <Badge variant={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Created</p>
                      <p className="font-medium">
                        {new Date(order.created_at).toLocaleString()}
                      </p>
                    </div>
                    {order.placed_at && (
                      <div>
                        <p className="text-sm text-gray-600">Placed</p>
                        <p className="font-medium">
                          {new Date(order.placed_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {order.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Order Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{order.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span>${formatPrice(order.total_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Shipping</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Tax</span>
                    <span>$0.00</span>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between font-semibold text-lg">
                      <span>Total</span>
                      <span>${formatPrice(order.total_amount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button className="w-full" variant="outline">
                    <Printer className="h-4 w-4 mr-2" />
                    Print Packing Slip
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                  {isSupplier && (
                    <Button className="w-full" variant="outline">
                      <Edit className="h-4 w-4 mr-2" />
                      Add Internal Note
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
              <CardDescription>{order.items?.length || 0} items</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items?.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-lg">{item.product_name || 'Product'}</h4>
                          <Badge variant="outline">SKU: {item.product_sku || 'N/A'}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Quantity:</span> {item.quantity}
                          </div>
                          <div>
                            <span className="font-medium">Unit Price:</span> ${formatPrice(item.unit_price)}
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
                        <p className="text-2xl font-bold text-primary">
                          ${formatPrice(item.line_total)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {item.quantity} × ${formatPrice(item.unit_price)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Picking Notes Tab (Supplier Only) */}
        {isSupplier && (
          <TabsContent value="picking">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5" />
                      Picking Notes & Labels
                    </CardTitle>
                    <CardDescription>Internal picking instructions and labels</CardDescription>
                  </div>
                  <Button onClick={() => handlePrintPackingSlip()}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Picking List
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.items?.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="border rounded-lg p-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Product</p>
                          <p className="font-semibold">{item.product_name}</p>
                          <p className="text-xs text-gray-500 mt-1">SKU: {item.product_sku}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Quantity</p>
                          <p className="text-lg font-bold">{item.quantity}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Warehouse Location</p>
                          <p className="font-medium">{item.location || 'A-12-B'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Lot/Expiry</p>
                          <p className="text-sm">LOT-{idx + 1} • Exp: 2024-12-31</p>
                        </div>
                      </div>
                      {item.picking_notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium text-gray-600">Picking Notes:</p>
                          <p className="text-sm">{item.picking_notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Delivery Info Tab (Supplier Only) */}
        {isSupplier && (
          <TabsContent value="delivery">
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
                    <p className="text-sm font-medium text-gray-600 mb-1">Delivery Time Window</p>
                    <p className="text-sm">Monday - Friday, 9:00 AM - 5:00 PM</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Access Instructions</p>
                    <p className="text-sm">Use back entrance. Ring doorbell. Contact: John (555-0123)</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Special Requirements</p>
                    <p className="text-sm">Please refrigerate perishables immediately upon arrival.</p>
                  </div>
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
                    <p className="text-sm text-gray-600">
                      123 Restaurant Street
                      <br />
                      Food City, FC 12345
                      <br />
                      United States
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* Packing Slip Tab (Supplier Only) */}
        {isSupplier && (
          <TabsContent value="packing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Packing Slip
                    </CardTitle>
                    <CardDescription>Print-ready packing slip for shipping</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handlePrintPackingSlip()}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                    <Button variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 space-y-6">
                  {/* Header */}
                  <div className="text-center">
                    <h2 className="text-2xl font-bold">PACKING SLIP</h2>
                    <p className="text-sm text-gray-600">Order #{order.id.slice(-8).toUpperCase()}</p>
                  </div>

                  {/* Ship To */}
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm font-bold text-gray-600 mb-2">SHIP TO:</p>
                      <p className="font-semibold">{order.restaurant_name}</p>
                      <p className="text-sm">123 Restaurant Street</p>
                      <p className="text-sm">Food City, FC 12345</p>
                      <p className="text-sm">United States</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-600 mb-2">ORDER DETAILS:</p>
                      <p className="text-sm">Order Date: {new Date(order.created_at).toLocaleDateString()}</p>
                      <p className="text-sm">Status: {order.status}</p>
                      <p className="text-sm">Items: {order.items?.length || 0}</p>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-300">
                          <th className="text-left py-2 px-3 text-sm font-bold">Item</th>
                          <th className="text-left py-2 px-3 text-sm font-bold">SKU</th>
                          <th className="text-right py-2 px-3 text-sm font-bold">Qty</th>
                          <th className="text-right py-2 px-3 text-sm font-bold">Unit Price</th>
                          <th className="text-right py-2 px-3 text-sm font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items?.map((item: any, idx: number) => (
                          <tr key={item.id || idx} className="border-b">
                            <td className="py-3 px-3 text-sm">{item.product_name}</td>
                            <td className="py-3 px-3 text-sm text-gray-600">{item.product_sku}</td>
                            <td className="py-3 px-3 text-sm text-right">{item.quantity}</td>
                            <td className="py-3 px-3 text-sm text-right">${formatPrice(item.unit_price)}</td>
                            <td className="py-3 px-3 text-sm text-right font-medium">${formatPrice(item.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="border-t-2 pt-4 flex justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Thank you for your business!</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">Total: ${formatPrice(order.total_amount)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
