import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Package, Plus, Clock, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../../utils/parseDaysOfWeek'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function QuickListDetailsDialog(props: any) {
  const {
    showListDetails,
    setShowListDetails,
    selectedListForDetails,
    selectedListDetails,
    catalogProducts,
    formatFrequency,
    formatNextExecution,
    handleAddProducts,
    handleOrderFromList,
  } = props

  return (
    <Dialog open={showListDetails} onOpenChange={setShowListDetails}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{selectedListForDetails?.name}</DialogTitle>
          <DialogDescription>
            {selectedListForDetails?.description || 'View quick list details and items'}
          </DialogDescription>
        </DialogHeader>

        {selectedListDetails && (
          <div className="space-y-4">
            {/* Schedule Info */}
            {selectedListDetails.is_scheduled && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Schedule Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--text-muted)]">Status:</span>
                    <Badge
                      variant={selectedListDetails.status === 'ACTIVE' ? 'default' : 'secondary'}
                    >
                      {selectedListDetails.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--text-muted)]">Frequency:</span>
                    <span className="text-sm font-medium">
                      {formatFrequency(
                        selectedListDetails.frequency,
                        selectedListDetails.days_of_week
                      )}
                    </span>
                  </div>
                  {(() => {
                    const detailDays = parseDaysOfWeek(selectedListDetails.days_of_week)
                    if (!detailDays.length) return null
                    return (
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Days:</span>
                        <span className="text-sm font-medium">
                          {formatDaysOfWeekLabel(detailDays)}
                        </span>
                      </div>
                    )
                  })()}
                  {selectedListDetails.preferred_time && (
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--text-muted)]">Preferred Time:</span>
                      <span className="text-sm font-medium">
                        {selectedListDetails.preferred_time.slice(0, 5)}
                      </span>
                    </div>
                  )}
                  {selectedListDetails.next_execution_date &&
                    formatNextExecution(selectedListDetails) && (
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Next Execution:</span>
                        <span className="text-sm font-medium">
                          {formatNextExecution(selectedListDetails)}
                        </span>
                      </div>
                    )}
                  {selectedListDetails.last_execution_date && (
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--text-muted)]">Last Execution:</span>
                      <span className="text-sm font-medium">
                        {new Date(selectedListDetails.last_execution_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--text-muted)]">Auto Create Order:</span>
                    <Badge
                      variant={selectedListDetails.auto_create_order ? 'default' : 'secondary'}
                    >
                      {selectedListDetails.auto_create_order ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Items List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Items ({selectedListDetails.items?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedListDetails.items && selectedListDetails.items.length > 0 ? (
                  <div className="space-y-3">
                    {selectedListDetails.items.map((item: any, itemIndex: number) => {
                      const product = catalogProducts.find((p: any) => p.id === item.product_id)
                      return (
                        <div
                          key={`${selectedListForDetails?.id ?? 'list'}-${item.id ?? item.product_id}-${itemIndex}`}
                          className="flex items-center justify-between p-3 border rounded-md"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{product?.name || 'Product not found'}</p>
                            {product?.sku && (
                              <p className="text-sm text-[var(--text-muted)]">SKU: {product.sku}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">Qty: {item.quantity}</p>
                            {product?.price && (
                              <p className="text-sm text-[var(--text-muted)]">
                                {formatPrice(Number(product.price) * item.quantity)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[var(--text-muted)]">
                    <Package className="h-12 w-12 mx-auto mb-2 text-[var(--text-muted)]" />
                    <p>No items in this list</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setShowListDetails(false)
                        handleAddProducts(selectedListForDetails.id)
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Items
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowListDetails(false)}>
            Close
          </Button>
          {selectedListForDetails && (
            <Button
              onClick={() => {
                setShowListDetails(false)
                handleOrderFromList(selectedListForDetails.id)
              }}
              disabled={
                !selectedListDetails ||
                !selectedListDetails.items ||
                selectedListDetails.items.length === 0
              }
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Order Now
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
