import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { useAppSelector } from '../hooks/redux'
import { PackageCheck, History, Star, FileText, Loader2, Clock, AlertCircle, Truck, CheckCircle } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useGetPendingOrdersForReceivingQuery, useCreateReceivingReportMutation, useGetReceivingHistoryQuery } from '../services/api'
import toast from 'react-hot-toast'
import { formatPrice } from '../utils/format'

export function ReceivingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const orderIdFromUrl = searchParams.get('order')
  const { user } = useAppSelector((state) => state.auth)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showDialog, setShowDialog] = useState(false)
  
  // Load received order IDs from localStorage on mount
  const [receivingOrderIds, setReceivingOrderIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('receivingOrderIds')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    }
    return new Set()
  })

  // Update localStorage whenever receivingOrderIds changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('receivingOrderIds', JSON.stringify(Array.from(receivingOrderIds)))
    }
  }, [receivingOrderIds])

  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useGetPendingOrdersForReceivingQuery()
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useGetReceivingHistoryQuery()
  const [createReport, { isLoading: isCreating }] = useCreateReceivingReportMutation()

  const handleReceive = (order: any) => {
    setSelectedOrder(order)
    setShowDialog(true)
  }

  const handleSubmitReceiving = async (formData: any) => {
    const orderId = selectedOrder.id
    try {
      // Add to receivingOrderIds to show "Processing..." state
      setReceivingOrderIds(prev => new Set([...prev, orderId]))
      
      const result = await createReport({
        orderId: selectedOrder.id,
        lineItems: selectedOrder.items.map((item: any) => ({
          productId: item.product_id,
          orderItemId: item.id,
          product_name: item.product_name,
          sku: item.sku,
          ordered_quantity: item.ordered_quantity,
          received_quantity: formData[`received_${item.id}`] || item.ordered_quantity,
          unit: item.unit,
          expected_unit_price: item.unit_price,
          actual_unit_price: formData[`price_${item.id}`] || item.unit_price,
          quality_status: formData[`quality_${item.id}`] || 'ACCEPTED',
          notes: formData[`notes_${item.id}`] || '',
        })),
        deliveryNotes: formData.deliveryNotes,
        qualityScore: formData.qualityScore,
        qualityNotes: formData.qualityNotes,
        receivedBy: user?.id,
      }).unwrap()

      toast.success('Receiving report created successfully')
      setShowDialog(false)
      setSelectedOrder(null)
      
      // Wait a moment for database transaction to commit
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Refetch both pending and history
      const [refetchPendingResult, refetchHistoryResult] = await Promise.all([
        refetchPending(),
        refetchHistory()
      ])
      
      // Check if order is now in history - retry if not found
      let historyCheckResult = refetchHistoryResult
      let reports = historyCheckResult?.data?.reports || []
      let reportFound = reports.some((r: any) => r.order_id === orderId)
      let retries = 0
      const maxRetries = 5
      
      while (!reportFound && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500))
        const retryResult = await refetchHistory()
        reports = retryResult?.data?.reports || []
        reportFound = reports.some((r: any) => r.order_id === orderId)
        
        if (reportFound) {
          historyCheckResult = retryResult
          break
        }
        retries++
      }

      // Order will be automatically removed from pending list by backend filter
      // Keep it in receivingOrderIds if it's still in pending OR if it's not yet in history
      const orderStillPending = refetchPendingResult.data?.orders?.some((o: any) => o.id === orderId)
      
      if (!orderStillPending && reportFound) {
        // Order is gone from pending AND found in history - success!
        setReceivingOrderIds(prev => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
      } else if (!reportFound) {
        // Report not found in history - something went wrong
        console.error('Receiving report not found in history after', maxRetries, 'retries')
        // Keep it in receivingOrderIds to show "Processing..." state
      } else {
        // Order still in pending but we created report - keep showing processing state
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create receiving report')
      // Remove from receivingOrderIds on error
      setReceivingOrderIds(prev => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  // Deep link: open receive dialog when ?order=id is in URL and that order is in pending list
  useEffect(() => {
    if (!orderIdFromUrl || !pendingData?.orders?.length) return
    const order = pendingData.orders.find((o: any) => o.id === orderIdFromUrl)
    if (order) {
      setSelectedOrder(order)
      setShowDialog(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('order')
        return next
      }, { replace: true })
    }
  }, [orderIdFromUrl, pendingData?.orders, setSearchParams])

  // Sync receivingOrderIds with backend data
  // Remove IDs for orders that are no longer in pending list OR have has_receiving_report = true
  // This cleans up the state after orders are properly received
  useEffect(() => {
    if (pendingData?.orders) {
      setReceivingOrderIds(prev => {
        const next = new Set(prev)
        const pendingIds = new Set(pendingData.orders.map((o: any) => o.id))
        let changed = false
        
        // Remove IDs that are no longer in pending list (order was successfully received and filtered out)
        next.forEach(id => {
          if (!pendingIds.has(id)) {
            next.delete(id)
            changed = true
          }
        })
        
        // Also check if any pending orders have has_receiving_report = true
        // These were received but still showing in list (shouldn't happen but handle it)
        pendingData.orders.forEach((order: any) => {
          if (order.has_receiving_report && next.has(order.id)) {
            // Keep it disabled but it should be filtered out on next refetch
          }
        })
        
        return changed ? next : prev
      })
    }
  }, [pendingData?.orders])

  const pendingOrders = (pendingData?.orders || []).map((order: any) => ({
    ...order,
    // Ensure has_receiving_report is true if order is in receivingOrderIds or if backend says it has a report
    has_receiving_report: order.has_receiving_report || receivingOrderIds.has(order.id)
  }))
  const historyReports = historyData?.reports || []

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="flex items-center gap-2 text-[21px] font-black text-[var(--text)]">
              <PackageCheck className="h-7 w-7 shrink-0 text-[var(--brand-mid)]" />
              Receiving & Quality Control
            </h1>
          </div>

          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList className="h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4" />
            Pending Orders
            {pendingOrders.length > 0 && (
              <Badge variant="destructive">{pendingOrders.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Receiving History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingLoading ? (
            <div className="text-center py-8 text-[var(--text-muted)]">Loading...</div>
          ) : pendingOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <PackageCheck className="h-16 w-16 text-[var(--text-muted)] mb-4" />
                <p className="text-lg font-semibold mb-2">No Pending Orders</p>
                <p className="text-sm text-[var(--text-muted)]">All delivered orders have been received</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingOrders.map((order: any) => {
                return (
                  <Card key={order.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          Order #{order.id.slice(0, 8)}
                          <Badge variant="outline">{order.supplier_name}</Badge>
                          <Badge 
                            variant={
                              (order.status?.toUpperCase() || order.status) === 'COMPLETED' ? 'default' :
                              (order.status?.toUpperCase() || order.status) === 'SHIPPED' ? 'secondary' :
                              (order.status?.toUpperCase() || order.status) === 'PROCESSING' ? 'secondary' :
                              'outline'
                            }
                          >
                            {order.status || 'UNKNOWN'}
                          </Badge>
                        </CardTitle>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                          Placed: {new Date(order.created_at).toLocaleString()}
                        </p>
                        {/* Status message explaining why order can't be received */}
                        {((order.status?.toUpperCase() || order.status) !== 'COMPLETED') && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">
                            {(() => {
                              const status = order.status?.toUpperCase() || order.status

                              if (status === 'PLACED') {
                                return (
                                  <>
                                    <Clock className="h-4 w-4" />
                                    <span>Waiting for supplier to acknowledge order</span>
                                  </>
                                )
                              }
                              if (status === 'ACKNOWLEDGED') {
                                return (
                                  <>
                                    <CheckCircle className="h-4 w-4" />
                                    <span>Supplier acknowledged. Order is being prepared.</span>
                                  </>
                                )
                              }
                              if (status === 'PROCESSING') {
                                return (
                                  <>
                                    <PackageCheck className="h-4 w-4" />
                                    <span>Supplier is processing your order</span>
                                  </>
                                )
                              }
                              if (status === 'SHIPPED') {
                                return (
                                  <>
                                    <Truck className="h-4 w-4" />
                                    <span>Order is in transit. Waiting for supplier to mark as completed.</span>
                                  </>
                                )
                              }
                              // Fallback for any other status
                              return (
                                <>
                                  <AlertCircle className="h-4 w-4" />
                                  <span>Order status: {status}. Waiting for supplier to complete the order.</span>
                                </>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                      {order.has_receiving_report || receivingOrderIds.has(order.id) ? (
                        <Button disabled variant="outline" className="cursor-not-allowed opacity-75">
                          <PackageCheck className="h-4 w-4 mr-2" />
                          Received
                        </Button>
                      ) : ((order.status?.toUpperCase() || order.status) === 'COMPLETED') ? (
                        <Button 
                          onClick={() => handleReceive(order)}
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
                          title="Order must be completed by supplier before receiving"
                        >
                          <AlertCircle className="h-4 w-4 mr-2" />
                          Waiting for Completion
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {order.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <p className="font-medium">{item.product_name}</p>
                            <p className="text-sm text-[var(--text-muted)]">{item.sku} • Qty: {item.ordered_quantity} {item.unit}</p>
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
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {historyLoading ? (
            <div className="text-center py-8 text-[var(--text-muted)]">Loading...</div>
          ) : historyReports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <History className="h-16 w-16 text-[var(--text-muted)] mb-4" />
                <p className="text-lg font-semibold mb-2">No Receiving History</p>
                <p className="text-sm text-[var(--text-muted)]">Receiving reports will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {historyReports.map((report: any) => (
                <Card key={report.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {report.order_id?.slice(0, 8) || 'N/A'}
                          <Badge variant="outline">{report.supplier_name}</Badge>
                        </CardTitle>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                          Received: {new Date(report.received_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {report.quality_score && (
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-medium">{report.quality_score}</span>
                          </div>
                        )}
                        <Badge variant={report.status === 'ACCEPTED' ? 'default' : 'secondary'}>
                          {report.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-[var(--text-muted)]">Items Ordered</p>
                        <p className="font-semibold">{report.total_items_ordered}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)]">Items Received</p>
                        <p className="font-semibold">{report.total_items_received}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)]">Total Cost</p>
                        <p className="font-semibold">{formatPrice(report.total_actual_cost)}</p>
                      </div>
                    </div>
                    {report.delivery_notes && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-[var(--text-muted)] mb-2">Delivery Notes:</p>
                        <p className="text-sm">{report.delivery_notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
        </CardContent>
      </Card>

      {/* Receiving Dialog */}
      {selectedOrder && (
        <ReceivingDialog
          order={selectedOrder}
          open={showDialog}
          onOpenChange={setShowDialog}
          onSubmit={handleSubmitReceiving}
          isLoading={isCreating}
        />
      )}
    </div>
  )
}

function ReceivingDialog({ order, open, onOpenChange, onSubmit, isLoading }: any) {
  const [formData, setFormData] = useState<any>({
    deliveryNotes: '',
    qualityScore: 5,
    qualityNotes: '',
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Order #{order.id.slice(0, 8)}</DialogTitle>
          <DialogDescription>
            Review received items and enter receiving details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label>Items Received</Label>
            <div className="space-y-3 mt-2">
              {order.items.map((item: any) => (
                <Card key={item.id} className="p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-sm text-[var(--text-muted)]">SKU: {item.sku}</p>
                      <p className="text-sm text-[var(--text-muted)]">Ordered: {item.ordered_quantity} {item.unit}</p>
                    </div>
                    <div className="border-t pt-3 mt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`received_${item.id}`}>Received Qty</Label>
                        <Input
                          id={`received_${item.id}`}
                          type="number"
                          defaultValue={item.ordered_quantity}
                          step="0.01"
                          onChange={(e) => setFormData({ ...formData, [`received_${item.id}`]: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`quality_${item.id}`}>Quality Status</Label>
                        <select
                          id={`quality_${item.id}`}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          defaultValue="ACCEPTED"
                          onChange={(e) => setFormData({ ...formData, [`quality_${item.id}`]: e.target.value })}
                        >
                          <option value="ACCEPTED">Accepted</option>
                          <option value="DAMAGED">Damaged</option>
                          <option value="EXPIRED">Expired</option>
                          <option value="WRONG_ITEM">Wrong Item</option>
                          <option value="SHORT">Short</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`notes_${item.id}`}>Notes (Optional)</Label>
                        <Input
                          id={`notes_${item.id}`}
                          onChange={(e) => setFormData({ ...formData, [`notes_${item.id}`]: e.target.value })}
                        />
                      </div>
                    </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="qualityScore">Overall Quality Score</Label>
            <div className="flex items-center gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <Button
                  key={score}
                  type="button"
                  variant={formData.qualityScore === score ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, qualityScore: score })}
                >
                  <Star className={`h-4 w-4 ${formData.qualityScore === score ? 'fill-yellow-400' : ''}`} />
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="qualityNotes">Quality Notes</Label>
            <Textarea
              id="qualityNotes"
              placeholder="Enter any quality observations..."
              onChange={(e) => setFormData({ ...formData, qualityNotes: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="deliveryNotes">Delivery Notes</Label>
            <Textarea
              id="deliveryNotes"
              placeholder="Enter delivery notes (truck number, driver, etc.)..."
              onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(formData)} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Complete Receiving'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

