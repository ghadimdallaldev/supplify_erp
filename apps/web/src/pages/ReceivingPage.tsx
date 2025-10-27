import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { useAppSelector } from '../hooks/redux'
import { PackageCheck, History, Star, FileText } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useGetPendingOrdersForReceivingQuery, useCreateReceivingReportMutation, useGetReceivingHistoryQuery } from '../services/api'
import toast from 'react-hot-toast'

export function ReceivingPage() {
  const { user } = useAppSelector((state) => state.auth)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showDialog, setShowDialog] = useState(false)

  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useGetPendingOrdersForReceivingQuery()
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useGetReceivingHistoryQuery()
  const [createReport, { isLoading: isCreating }] = useCreateReceivingReportMutation()

  const handleReceive = (order: any) => {
    setSelectedOrder(order)
    setShowDialog(true)
  }

  const handleSubmitReceiving = async (formData: any) => {
    try {
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
      refetchPending()
      refetchHistory()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create receiving report')
    }
  }

  const pendingOrders = pendingData?.orders || []
  const historyReports = historyData?.reports || []

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <PackageCheck className="h-8 w-8" />
          Receiving & Quality Control
        </h2>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
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
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : pendingOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <PackageCheck className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-semibold mb-2">No Pending Orders</p>
                <p className="text-sm text-muted-foreground">All delivered orders have been received</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingOrders.map((order: any) => (
                <Card key={order.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          Order #{order.id.slice(0, 8)}
                          <Badge variant="outline">{order.supplier_name}</Badge>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Completed: {new Date(order.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Button onClick={() => handleReceive(order)}>
                        <PackageCheck className="h-4 w-4 mr-2" />
                        Receive Now
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {order.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <p className="font-medium">{item.product_name}</p>
                            <p className="text-sm text-muted-foreground">{item.sku} • Qty: {item.ordered_quantity} {item.unit}</p>
                          </div>
                          <p className="font-medium">${(item.unit_price || 0).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {historyLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : historyReports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <History className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-semibold mb-2">No Receiving History</p>
                <p className="text-sm text-muted-foreground">Receiving reports will appear here</p>
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
                        <p className="text-sm text-muted-foreground mt-1">
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
                        <p className="text-muted-foreground">Items Ordered</p>
                        <p className="font-semibold">{report.total_items_ordered}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Items Received</p>
                        <p className="font-semibold">{report.total_items_received}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Cost</p>
                        <p className="font-semibold">${parseFloat(report.total_actual_cost || 0).toFixed(2)}</p>
                      </div>
                    </div>
                    {report.delivery_notes && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-2">Delivery Notes:</p>
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
                      <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>
                      <p className="text-sm text-muted-foreground">Ordered: {item.ordered_quantity} {item.unit}</p>
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
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

