import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Warehouse, Package, AlertTriangle, TrendingUp, TrendingDown, Settings } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGetInventoryListQuery, useGetWarehousesQuery } from '../services/api'
import { formatNumber } from '../utils/format'

export function InventoryPage() {
  const [showAdjustment, setShowAdjustment] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [showWarehouseView, setShowWarehouseView] = useState(false)
  
  const { data, error, isLoading, refetch } = useGetInventoryListQuery()
  const { data: warehousesData, isLoading: isLoadingWarehouses } = useGetWarehousesQuery()
  
  // Get inventory from API or show loading
  const inventory = data?.inventory || []
  const warehouses = warehousesData?.warehouses || []

  const adjustmentForm = {
    type: 'ADD',
    quantity: '',
    reason: 'STOCK_TAKE',
    notes: '',
  }

  const handleAdjustment = () => {
    // TODO: Implement API call
    toast.success('Inventory adjustment recorded')
    setShowAdjustment(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-lg font-semibold mb-2">Failed to load inventory</p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
        <p className="text-gray-600 mt-2">Manage inventory across all warehouses</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-2xl font-bold">{inventory.length}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Reserved</p>
                <p className="text-2xl font-bold">{inventory.reduce((sum, item) => sum + parseFloat(item.reserved_qty || 0), 0)}</p>
              </div>
              <Warehouse className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low Stock Items</p>
                <p className="text-2xl font-bold">{inventory.filter((item: any) => item.isLowStock).length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Available Stock</p>
                <p className="text-2xl font-bold">{inventory.reduce((sum, item) => sum + parseFloat(item.available_qty || 0), 0)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventory Overview</CardTitle>
              <CardDescription>View and manage inventory across warehouses</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowWarehouseView(!showWarehouseView)}>
                <Warehouse className="h-4 w-4 mr-2" />
                {showWarehouseView ? 'Hide Warehouses' : 'View All Warehouses'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!showWarehouseView && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Product</th>
                  <th className="text-left py-3 px-4">Warehouse</th>
                  <th className="text-right py-3 px-4">On Hand</th>
                  <th className="text-right py-3 px-4">Reserved</th>
                  <th className="text-right py-3 px-4">Available</th>
                  <th className="text-right py-3 px-4">Status</th>
                  <th className="text-center py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      No inventory items found
                    </td>
                  </tr>
                ) : (
                  inventory.map((item: any) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-sm text-gray-600">{item.sku}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {item.warehouse_name ? (
                          <div className="flex items-center gap-2">
                            <Warehouse className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm font-medium">{item.warehouse_name}</p>
                              {item.warehouse_code && (
                                <p className="text-xs text-gray-500">{item.warehouse_code}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">No warehouse</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium">{formatNumber(parseFloat(String(item.available_qty || 0)) + parseFloat(String(item.reserved_qty || 0)), { maximumFractionDigits: 2 })}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-orange-600">{item.reserved_qty || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-green-600 font-medium">{item.available_qty || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {item.isLowStock ? (
                          <Badge variant="destructive">Low Stock</Badge>
                        ) : (
                          <Badge variant="secondary">In Stock</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedProduct(item)
                              setShowAdjustment(true)
                            }}
                          >
                            Adjust
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedProduct(item)
                              setShowSettings(true)
                            }}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
          
          {showWarehouseView && (
            <div className="space-y-6">
              {isLoadingWarehouses ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading warehouses...</p>
                </div>
              ) : warehouses.length === 0 ? (
                <div className="text-center py-12">
                  <Warehouse className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">No Warehouses Found</p>
                  <p className="text-gray-600 mb-4">You haven't created any warehouses yet. Create warehouses in your settings.</p>
                  <Button variant="outline" onClick={() => setShowWarehouseView(false)}>
                    Return to Inventory View
                  </Button>
                </div>
              ) : (
                warehouses.map((warehouse: any) => (
                  <Card key={warehouse.id} className="overflow-hidden">
                    <CardHeader className="bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Warehouse className="h-5 w-5" />
                            {warehouse.name}
                            {warehouse.code && (
                              <Badge variant="outline" className="ml-2">{warehouse.code}</Badge>
                            )}
                          </CardTitle>
                          <CardDescription>
                            {warehouse.product_count || 0} products · {warehouse.total_available_qty || 0} total available
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">
                            Available: {warehouse.total_available_qty || 0}
                          </p>
                          <p className="text-sm text-orange-600">
                            Reserved: {warehouse.total_reserved_qty || 0}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {warehouse.inventory && warehouse.inventory.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left py-2 px-4 text-xs font-medium text-gray-600">Product</th>
                                <th className="text-right py-2 px-4 text-xs font-medium text-gray-600">On Hand</th>
                                <th className="text-right py-2 px-4 text-xs font-medium text-gray-600">Reserved</th>
                                <th className="text-right py-2 px-4 text-xs font-medium text-gray-600">Available</th>
                                <th className="text-center py-2 px-4 text-xs font-medium text-gray-600">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {warehouse.inventory.map((item: any) => (
                                <tr key={item.id} className="border-b hover:bg-gray-50">
                                  <td className="py-2 px-4">
                                    <div>
                                      <p className="text-sm font-medium">{item.product_name}</p>
                                      <p className="text-xs text-gray-500">{item.sku}</p>
                                    </div>
                                  </td>
                                  <td className="py-2 px-4 text-right">
                                    <span className="text-sm">{formatNumber(parseFloat(String(item.available_qty || 0)) + parseFloat(String(item.reserved_qty || 0)), { maximumFractionDigits: 2 })}</span>
                                  </td>
                                  <td className="py-2 px-4 text-right">
                                    <span className="text-sm text-orange-600">{item.reserved_qty || 0}</span>
                                  </td>
                                  <td className="py-2 px-4 text-right">
                                    <span className="text-sm text-green-600 font-medium">{item.available_qty || 0}</span>
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    {item.isLowStock ? (
                                      <Badge variant="destructive" className="text-xs">Low Stock</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs">In Stock</Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-gray-500 text-sm">
                          No inventory in this warehouse
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inventory Adjustment Dialog */}
      <Dialog open={showAdjustment} onOpenChange={setShowAdjustment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Inventory</DialogTitle>
            <DialogDescription>
              Record an inventory adjustment for {selectedProduct?.product_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Adjustment Type *</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="ADD">Add Stock</option>
                <option value="REMOVE">Remove Stock</option>
                <option value="STOCK_TAKE">Stock Take</option>
                <option value="DAMAGE">Damage</option>
                <option value="RETURN">Return</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity *</label>
              <Input type="number" placeholder="Enter quantity" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason *</label>
              <Input placeholder="Enter reason for adjustment" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustment(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdjustment}>
              Record Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inventory Settings</DialogTitle>
            <DialogDescription>
              Configure inventory settings for {selectedProduct?.product_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">MOQ (Minimum Order Quantity)</label>
                <Input type="number" placeholder="1" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Order Multiple</label>
                <Input type="number" placeholder="1" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Lead Time (days)</label>
                <Input type="number" placeholder="2" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Low Stock Threshold</label>
                <Input type="number" placeholder="20" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="rounded" />
                <span className="text-sm font-medium">Backorders Allowed</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success('Settings saved')
              setShowSettings(false)
            }}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
