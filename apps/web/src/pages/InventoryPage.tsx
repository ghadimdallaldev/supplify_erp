import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Warehouse, Package, AlertTriangle, TrendingUp, TrendingDown, Settings } from 'lucide-react'
import toast from 'react-hot-toast'

export function InventoryPage() {
  const [showAdjustment, setShowAdjustment] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  
  // Mock inventory data
  const inventory = [
    {
      id: '1',
      product: { name: 'Organic Tomatoes', sku: 'FP-001' },
      warehouse: { name: 'Main Warehouse', code: 'WH-001' },
      availableQty: 150,
      reservedQty: 10,
      onHandQty: 160,
      lowStockThreshold: 20,
      isLowStock: true,
    },
    {
      id: '2',
      product: { name: 'Fresh Lettuce', sku: 'FP-002' },
      warehouse: { name: 'Main Warehouse', code: 'WH-001' },
      availableQty: 80,
      reservedQty: 5,
      onHandQty: 85,
      lowStockThreshold: 30,
      isLowStock: false,
    },
    {
      id: '3',
      product: { name: 'Organic Carrots', sku: 'FP-003' },
      warehouse: { name: 'Secondary Warehouse', code: 'WH-002' },
      availableQty: 200,
      reservedQty: 15,
      onHandQty: 215,
      lowStockThreshold: 50,
      isLowStock: false,
    },
  ]

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
                <p className="text-2xl font-bold">24</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Warehouses</p>
                <p className="text-2xl font-bold">2</p>
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
                <p className="text-2xl font-bold">3</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Value</p>
                <p className="text-2xl font-bold">$12,450</p>
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
              <Button variant="outline">
                <Package className="h-4 w-4 mr-2" />
                View All Warehouses
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
                {inventory.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{item.product.name}</p>
                        <p className="text-sm text-gray-600">{item.product.sku}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium">{item.warehouse.name}</p>
                          <p className="text-xs text-gray-500">{item.warehouse.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-medium">{item.onHandQty}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-orange-600">{item.reservedQty}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-green-600 font-medium">{item.availableQty}</span>
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
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Adjustment Dialog */}
      <Dialog open={showAdjustment} onOpenChange={setShowAdjustment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Inventory</DialogTitle>
            <DialogDescription>
              Record an inventory adjustment for {selectedProduct?.product.name}
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
              Configure inventory settings for {selectedProduct?.product.name}
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
