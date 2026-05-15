import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGetOrderQuery, useUpdateOrderMutation, useGetOrderInvoicesQuery, useSendOrderReminderMutation } from '../services/api'
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
import { formatPrice } from '../utils/format'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function formatAddressLines(address?: Record<string, string | undefined> | null): string[] {
  if (!address || typeof address !== 'object') return []
  const lines: string[] = []
  if (address.street) lines.push(address.street)
  const cityLine = [address.city, address.region, address.postalCode || address.zip]
    .filter(Boolean)
    .join(', ')
  if (cityLine) lines.push(cityLine)
  if (address.country) lines.push(address.country)
  return lines
}

function formatOperatingHours(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object') return null
  const entries = Object.entries(hours as Record<string, { open?: string; close?: string }>)
  if (!entries.length) return null
  return entries
    .map(([day, window]) => `${day}: ${window?.open ?? '—'} – ${window?.close ?? '—'}`)
    .join('; ')
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  const [showPickingNotes, setShowPickingNotes] = useState(false)
  const [showDeliveryNotes, setShowDeliveryNotes] = useState(false)
  
  const { data, isLoading, error, refetch } = useGetOrderQuery(id!)
  const { data: invoicesData, isLoading: isLoadingInvoices, refetch: refetchInvoices } = useGetOrderInvoicesQuery(id!, { skip: !id })
  const [updateOrder] = useUpdateOrderMutation()
  const [sendReminder, { isLoading: isSendingReminder }] = useSendOrderReminderMutation()

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

  const [isUpdating, setIsUpdating] = useState(false)
  
  const handleStatusUpdate = async (newStatus: string) => {
    if (!id || isUpdating) return // Prevent multiple clicks
    
    try {
      setIsUpdating(true) // Set immediately - button will be replaced by disabled button
      await updateOrder({ id, data: { status: newStatus } }).unwrap()
      toast.success(`Order status updated to ${newStatus}`)
      
      // Refetch to get updated data
      const refetchResult = await refetch()
      
      // For COMPLETED status, keep button disabled (component will show disabled "Completed" button)
      // Don't clear isUpdating immediately - let component re-render with new order.status
      if (newStatus === 'COMPLETED') {
        if (refetchResult.data?.status === 'COMPLETED') {
          // Order confirmed as COMPLETED - component will show disabled "Completed" button
          // Clear isUpdating after a delay to allow component to re-render
          setTimeout(() => {
            setIsUpdating(false)
          }, 1000)
        }
      } else {
        // For other statuses, clear immediately
        setIsUpdating(false)
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update order status')
      setIsUpdating(false)
    }
  }

  const handlePrintPackingSlip = () => {
    window.print()
    toast.success('Preparing packing slip for printing...')
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const handleDownloadPackingSlipPdf = async () => {
    if (!id || downloadingPdf) return
    setDownloadingPdf(true)
    try {
      const res = await fetch(`${API_URL}/api/orders/${id}/packing-slip/pdf`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to download PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Packing slip PDF downloaded')
    } catch {
      toast.error('Could not download packing slip PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleSendReminder = async () => {
    if (!id || isSendingReminder) return
    
    try {
      await sendReminder(id).unwrap()
      toast.success('Reminder sent to supplier successfully')
      refetch() // Refresh order data to update reminder count
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to send reminder')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Order not found</p>
      </div>
    )
  }

  const order = data.order
  const deliveryAddress = (order as any).branch_address ?? (order as any).restaurant_address
  const deliveryInstructions =
    (order as any).branch_delivery_instructions ?? (order as any).restaurant_delivery_instructions
  const deliveryPhone = (order as any).branch_phone ?? (order as any).restaurant_phone
  const addressLines = formatAddressLines(deliveryAddress)
  const operatingHoursLabel = formatOperatingHours((order as any).restaurant_operating_hours)

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
            <p className="text-[var(--text-muted)]">{order.restaurant_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusColor(order.status)} className="text-lg px-3 py-1">
            {order.status}
          </Badge>
          {!isSupplier && order.status === 'PLACED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendReminder}
              disabled={isSendingReminder}
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              {isSendingReminder ? 'Sending...' : order.reminder_count > 0 ? `Send Reminder (${order.reminder_count})` : 'Send Reminder'}
            </Button>
          )}
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
              {order.status === 'SHIPPED' && !isUpdating && (
                <Button 
                  size="sm"
                  variant="default"
                  onClick={() => handleStatusUpdate('COMPLETED')}
                  disabled={false}
                >
                  Complete Order
                </Button>
              )}
              {(isUpdating || order.status === 'COMPLETED') && (
                <Button 
                  size="sm"
                  variant={order.status === 'COMPLETED' ? 'outline' : 'default'}
                  disabled
                  className="cursor-not-allowed opacity-75"
                >
                  {isUpdating ? (
                    <>Completing...</>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Completed
                    </>
                  )}
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
          {!isSupplier && (invoicesData?.invoices?.length > 0 || order.status === 'COMPLETED') && (
            <TabsTrigger value="invoice">
              Invoice {invoicesData?.invoices?.length > 0 && `(${invoicesData.invoices.length})`}
            </TabsTrigger>
          )}
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
                      <p className="text-sm text-[var(--text-muted)]">Order ID</p>
                      <p className="font-medium">{order.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Status</p>
                      <Badge variant={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Created</p>
                      <p className="font-medium">
                        {new Date(order.created_at).toLocaleString()}
                      </p>
                    </div>
                    {order.placed_at && (
                      <div>
                        <p className="text-sm text-[var(--text-muted)]">Placed</p>
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
                    <span className="text-[var(--text-muted)]">Subtotal</span>
                    <span>${formatPrice(order.total_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Shipping</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Tax</span>
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
                  {!isSupplier && (order.status === 'COMPLETED' || order.status === 'DELIVERED') && (
                    <Button className="w-full" variant="default" asChild>
                      <Link to={`/app/receiving?order=${order.id}`}>
                        <Package className="h-4 w-4 mr-2" />
                        Receive this order
                      </Link>
                    </Button>
                  )}
                  <Button className="w-full" variant="outline" onClick={() => handlePrintPackingSlip()}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Packing Slip
                  </Button>
                  <Button className="w-full" variant="outline" onClick={handleDownloadPackingSlipPdf} disabled={downloadingPdf}>
                    <Download className="h-4 w-4 mr-2" />
                    {downloadingPdf ? 'Downloading...' : 'Download PDF'}
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
                  <div key={item.id || idx} className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)]">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-lg">{item.product_name || 'Product'}</h4>
                          <Badge variant="outline">SKU: {item.product_sku || 'N/A'}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-[var(--text-muted)]">
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
                        <p className="text-2xl font-bold text-[var(--brand-mid)]">
                          ${formatPrice(item.line_total)}
                        </p>
                        <p className="text-sm text-[var(--text-muted)]">
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

        {/* Invoice Tab (Restaurant Only) */}
        {!isSupplier && (
          <TabsContent value="invoice">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Invoice{invoicesData?.invoices && invoicesData.invoices.length > 1 ? 's' : ''}{' '}
                      {invoicesData?.invoices?.length > 0 && `(${invoicesData.invoices.length})`}
                    </CardTitle>
                    <CardDescription>
                      {order.status === 'COMPLETED'
                        ? 'Invoice details and payment information'
                        : 'Invoice will be generated when order is completed'}
                    </CardDescription>
                  </div>
                  {invoicesData?.invoices?.length > 0 && (
                    <Button variant="outline" asChild>
                      <Link to="/app/invoices">
                        View All Invoices
                        <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
                      </Link>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingInvoices ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand)]"></div>
                  </div>
                ) : invoicesData?.invoices && invoicesData.invoices.length > 0 ? (
                  <div className="space-y-4">
                    {invoicesData.invoices.map((invoice: any) => {
                      const remaining = parseFloat(invoice.total_amount || 0) - parseFloat(invoice.total_paid || 0)
                      const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && remaining > 0
                      
                      return (
                        <div
                          key={invoice.id}
                          className={`border rounded-lg p-6 hover:shadow-md transition-shadow ${
                            isOverdue ? 'border-red-300 bg-[var(--red-pale)]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-semibold">{invoice.invoice_number}</h3>
                                <Badge variant={getStatusColor(invoice.status)}>
                                  {invoice.status}
                                </Badge>
                                {isOverdue && (
                                  <Badge variant="destructive">Overdue</Badge>
                                )}
                              </div>
                              <p className="text-sm text-[var(--text-muted)] font-medium">{invoice.supplier_name}</p>
                              <div className="flex gap-4 text-xs text-[var(--text-muted)] mt-2">
                                <span>Invoice Date: {new Date(invoice.invoice_date).toLocaleDateString()}</span>
                                <span>Due Date: {new Date(invoice.due_date).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold">${formatPrice(invoice.total_amount)}</p>
                              <p className={`text-sm font-semibold ${remaining > 0 ? 'text-[var(--red)]' : 'text-[var(--mint)]'}`}>
                                Balance: ${formatPrice(remaining)}
                              </p>
                              {parseFloat(String(invoice.total_paid || 0)) > 0 && (
                                <p className="text-xs text-[var(--mint)]">
                                  Paid: ${formatPrice(invoice.total_paid)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/app/invoices?invoice=${invoice.id}`}>
                                <FileText className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </Button>
                            {remaining > 0 && (
                              <Button size="sm" asChild>
                                <Link to={`/app/invoices?invoice=${invoice.id}&pay=true`}>
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  Pay Invoice
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : order.status === 'COMPLETED' ? (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                    <p className="text-lg font-semibold text-[var(--text)] mb-2">Invoice Not Yet Generated</p>
                    <p className="text-[var(--text-muted)]">Invoice will be created automatically. Please check back shortly.</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                    <p className="text-lg font-semibold text-[var(--text)] mb-2">Invoice Not Available</p>
                    <p className="text-[var(--text-muted)]">Invoice will be generated when the order is completed.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

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
                          <p className="text-sm font-medium text-[var(--text-muted)]">Product</p>
                          <p className="font-semibold">{item.product_name}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">SKU: {item.product_sku}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-muted)]">Quantity</p>
                          <p className="text-lg font-bold">{item.quantity}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-muted)]">Warehouse Location</p>
                          <p className="font-medium">{item.location_code || 'Not assigned'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-muted)]">Lot/Expiry</p>
                          <p className="text-sm">—</p>
                        </div>
                      </div>
                      {item.picking_notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium text-[var(--text-muted)]">Picking Notes:</p>
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
                    <p className="text-sm font-medium text-[var(--text-muted)] mb-1">Delivery Time Window</p>
                    <p className="text-sm">{operatingHoursLabel || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)] mb-1">Access Instructions</p>
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
                      <p className="text-sm text-[var(--text-muted)]">Branch: {(order as any).branch_name}</p>
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
                    <Button variant="outline" onClick={handleDownloadPackingSlipPdf} disabled={downloadingPdf}>
                      <Download className="h-4 w-4 mr-2" />
                      {downloadingPdf ? 'Downloading...' : 'Download PDF'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-[var(--app-border-mid)] rounded-lg p-8 space-y-6">
                  {/* Header */}
                  <div className="text-center">
                    <h2 className="text-2xl font-bold">PACKING SLIP</h2>
                    <p className="text-sm text-[var(--text-muted)]">Order #{order.id.slice(-8).toUpperCase()}</p>
                  </div>

                  {/* Ship To */}
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm font-bold text-[var(--text-muted)] mb-2">SHIP TO:</p>
                      <p className="font-semibold">{order.restaurant_name}</p>
                      {addressLines.length > 0 ? (
                        addressLines.map((line) => (
                          <p key={line} className="text-sm">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">No delivery address on file</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-muted)] mb-2">ORDER DETAILS:</p>
                      <p className="text-sm">Order Date: {new Date(order.created_at).toLocaleDateString()}</p>
                      <p className="text-sm">Status: {order.status}</p>
                      <p className="text-sm">Items: {order.items?.length || 0}</p>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-[var(--app-border-mid)]">
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
                            <td className="py-3 px-3 text-sm text-[var(--text-muted)]">{item.product_sku}</td>
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
                      <p className="text-sm text-[var(--text-muted)]">Thank you for your business!</p>
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
