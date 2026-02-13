import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { 
  Package,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Plus,
  Minus,
  Pin,
  Download,
  Upload,
  FileText
} from 'lucide-react'
import { useGetRestaurantInventoryQuery, useGetRestaurantInventoryHistoryQuery, useAddRestaurantInventoryMutation, useAdjustRestaurantInventoryMutation } from '../services/api'
import toast from 'react-hot-toast'

export function RestaurantInventoryPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [showAdjustDialog, setShowAdjustDialog] = useState(false)
  const [showAddProductDialog, setShowAddProductDialog] = useState(false)
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false)
  const [adjustingItem, setAdjustingItem] = useState<any>(null)
  const [adjustQuantity, setAdjustQuantity] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustType, setAdjustType] = useState<'ADD' | 'SUBTRACT'>('SUBTRACT')
  const [pinnedItems, setPinnedItems] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState('inventory')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [addQuantity, setAddQuantity] = useState('')
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null)

  const { data, isLoading, error } = useGetRestaurantInventoryQuery()
  const { data: historyData, isLoading: isLoadingHistory } = useGetRestaurantInventoryHistoryQuery({ limit: 50 })
  const [addInventory] = useAddRestaurantInventoryMutation()
  const [adjustInventory] = useAdjustRestaurantInventoryMutation()

  const inventory = data?.inventory || []
  const history = historyData?.history || []

  const handlePinToggle = (productId: string) => {
    const newPinned = new Set(pinnedItems)
    if (newPinned.has(productId)) {
      newPinned.delete(productId)
      toast.success('Item unpinned')
    } else {
      newPinned.add(productId)
      toast.success('Item pinned to top')
    }
    setPinnedItems(newPinned)
  }

  const handleOpenAdjustDialog = (item: any, type: 'ADD' | 'SUBTRACT') => {
    setAdjustingItem(item)
    setAdjustType(type)
    setAdjustQuantity('')
    setAdjustReason('')
    setShowAdjustDialog(true)
  }

  const handleAdjustInventory = async () => {
    if (!adjustingItem || !adjustQuantity) {
      toast.error('Please enter a quantity')
      return
    }

    const quantity = parseFloat(adjustQuantity)
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Quantity must be a positive number')
      return
    }

    try {
      if (adjustType === 'ADD') {
        await addInventory({
          productId: adjustingItem.product_id,
          quantity,
          reason: adjustReason || undefined,
        }).unwrap()
        toast.success('Inventory added successfully')
      } else {
        await adjustInventory({
          productId: adjustingItem.product_id,
          adjustmentType: 'COUNT_CORRECTION',
          quantity,
          reason: adjustReason || 'Manual adjustment',
        }).unwrap()
        toast.success('Inventory adjusted successfully')
      }
      
      setShowAdjustDialog(false)
      setAdjustingItem(null)
      setAdjustQuantity('')
      setAdjustReason('')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to adjust inventory')
    }
  }

  const handleExportCSV = () => {
    const csv = [
      ['Product Name', 'SKU', 'Supplier', 'Quantity', 'Unit', 'Status', 'Last Updated'],
      ...inventory.map((item: any) => {
        const status = getStockStatus(item.quantity, item.low_stock_threshold)
        return [
          item.product_name,
          item.product_sku,
          item.supplier_name,
          item.quantity,
          item.product_unit,
          status,
          new Date(item.updated_at).toLocaleDateString()
        ]
      })
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('Inventory exported to CSV')
  }

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      // Parse CSV and update inventory
      const lines = text.split('\n')
      const data = lines.slice(1).map(line => line.split(',').map(cell => cell.replace(/^"|"$/g, '')))
      
      toast.success(`Processing ${data.length} inventory items from CSV...`)
      // TODO: Implement bulk update API call
      console.log('CSV data:', data)
    }
    reader.readAsText(file)
  }

  const getStockStatus = (quantity: number, threshold: number) => {
    if (quantity === 0) return 'OUT_OF_STOCK'
    if (threshold && quantity <= threshold) return 'LOW_STOCK'
    return 'IN_STOCK'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_STOCK': return 'default'
      case 'LOW_STOCK': return 'secondary'
      case 'OUT_OF_STOCK': return 'destructive'
      default: return 'secondary'
    }
  }

  const calculateReorderQuantity = (item: any) => {
    const { quantity, low_stock_threshold } = item
    if (!low_stock_threshold || quantity > low_stock_threshold) return 0
    const suggested = (low_stock_threshold * 3) - quantity
    return Math.ceil(suggested)
  }

  const filteredInventory = inventory
    .filter((item: any) => {
      const matchesSearch = item.product_name.toLowerCase().includes(search.toLowerCase()) ||
                           item.product_sku.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || 
                            getStockStatus(item.quantity, item.low_stock_threshold) === statusFilter
      const matchesSupplier = supplierFilter === 'ALL' || item.supplier_name === supplierFilter
      const matchesCategory = categoryFilter === 'ALL' || item.product_category === categoryFilter
      return matchesSearch && matchesStatus && matchesSupplier && matchesCategory
    })
    .sort((a: any, b: any) => {
      const aPinned = pinnedItems.has(a.product_id)
      const bPinned = pinnedItems.has(b.product_id)
      if (aPinned && !bPinned) return -1
      if (!aPinned && bPinned) return 1
      return 0
    })

  const summary = {
    total: inventory.length,
    inStock: inventory.filter((item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'IN_STOCK').length,
    lowStock: inventory.filter((item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'LOW_STOCK').length,
    outOfStock: inventory.filter((item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'OUT_OF_STOCK').length
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-lg font-semibold mb-2">Failed to load inventory</p>
        <p className="text-gray-600 text-sm">{error?.message || 'An error occurred'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600 mt-2">Track your stock levels and manage inventory</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowBulkUploadDialog(true)} variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Button>
          <Button onClick={() => setShowAddProductDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inventory">Current Inventory</TabsTrigger>
          <TabsTrigger value="history">Movement History</TabsTrigger>
          <TabsTrigger value="totals">Totals & Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6">
      {/* Inventory Trend Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Trend Analysis</CardTitle>
          <CardDescription>Visual overview of your inventory movements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Total Movements</p>
                <p className="text-2xl font-bold">{history.length}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Recent Additions</p>
                <p className="text-2xl font-bold text-green-600">
                  {history.filter((h: any) => h.type === 'ADD' && new Date(h.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Recent Subtractions</p>
                <p className="text-2xl font-bold text-red-600">
                  {history.filter((h: any) => h.type === 'SUBTRACT' && new Date(h.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-2xl font-bold">{summary.total}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Stock</p>
                <p className="text-2xl font-bold">{summary.inStock}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold">{summary.lowStock}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Out of Stock</p>
                <p className="text-2xl font-bold">{summary.outOfStock}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="ALL">All Suppliers</option>
              {Array.from(new Set<string>(inventory.map((item: { supplier_name?: string }) => item.supplier_name).filter((s): s is string => Boolean(s)))).map((supplier) => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="ALL">All Status</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventory Items</CardTitle>
              <CardDescription>View and manage your stock levels</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <label>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Suggested Reorder</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredInventory.map((item: any) => {
                  const status = getStockStatus(item.quantity, item.low_stock_threshold)
                  const reorderQty = calculateReorderQuantity(item)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{item.product_name}</p>
                          <p className="text-sm text-gray-500">{item.product_sku}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">{item.supplier_name}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{item.quantity}</span>
                          <span className="text-sm text-gray-500">{item.product_unit}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {reorderQty > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-orange-600">{reorderQty}</span>
                            <Badge variant="outline" className="text-xs">
                              Suggested
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                toast.success('Adding to cart...', {
                                  duration: 2000,
                                })
                                // TODO: Navigate to products page with search pre-filled
                              }}
                            >
                              Order
                            </Button>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={getStatusColor(status)}>
                          {status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Button 
                            variant={pinnedItems.has(item.product_id) ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePinToggle(item.product_id)}
                            title={pinnedItems.has(item.product_id) ? "Unpin item" : "Pin to top"}
                          >
                            <Pin className={`h-4 w-4 ${pinnedItems.has(item.product_id) ? 'fill-current' : ''}`} />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenAdjustDialog(item, 'ADD')}
                            title="Add inventory"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenAdjustDialog(item, 'SUBTRACT')}
                            title="Reduce inventory"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredInventory.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No inventory items found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust Inventory Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustType === 'ADD' ? 'Add Inventory' : 'Reduce Inventory'}
            </DialogTitle>
            <DialogDescription>
              {adjustType === 'ADD' 
                ? `Add ${adjustingItem?.product_name} to your inventory`
                : `Adjust inventory for ${adjustingItem?.product_name}`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter quantity"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(e.target.value)}
              />
              <p className="text-sm text-gray-500">
                Current quantity: {adjustingItem?.quantity} {adjustingItem?.product_unit}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                rows={3}
                placeholder="Optional: reason for this adjustment..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline"
              onClick={() => setShowAdjustDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAdjustInventory}>
              {adjustType === 'ADD' ? 'Add Inventory' : 'Reduce Inventory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Movement History</CardTitle>
              <CardDescription>Recent inventory changes and adjustments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <div>
                  <label className="text-sm text-gray-600 mr-2">Source</label>
                  <select
                    onChange={(e) => {
                      const val = e.target.value
                      const table = document.getElementById('history-table-body') as HTMLTableSectionElement | null
                      if (!table) return
                      const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[]
                      rows.forEach((row) => {
                        const cell = row.querySelector('[data-col="source"]') as HTMLElement | null
                        if (!cell) return
                        const src = cell.dataset?.value || cell.textContent || ''
                        row.style.display = val === 'ALL' || src === val ? '' : 'none'
                      })
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="ALL">All</option>
                    <option value="Order">Order</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
              </div>
              {isLoadingHistory ? (
                <div className="text-center py-12">Loading history...</div>
              ) : history.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No inventory movements yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance Before</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance After</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      </tr>
                    </thead>
                    <tbody id="history-table-body" className="divide-y divide-gray-200">
                      {history.map((movement: any) => {
                        const source = movement.reference_type === 'RECEIVING_REPORT' ? 'Order' : movement.reference_type === 'MANUAL_ADD' ? 'Manual' : (movement.reference_type || '—')
                        const typeLabel = (() => {
                          const t = (movement.type || '').toUpperCase()
                          if (source === 'Order') return 'ADD'
                          if (t === 'ORDER' || t === 'RECEIVED') return 'ADD'
                          if (t === 'ADD') return 'ADD'
                          if (t === 'SUBTRACT') return 'SUBTRACT'
                          if (t === 'COUNT_CORRECTION') return 'ADJUST'
                          if (t === 'WASTAGE' || t === 'SPOILAGE') return 'SUBTRACT'
                          return t || '—'
                        })()
                        return (
                        <tr key={movement.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {new Date(movement.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{movement.product_name}</p>
                              <p className="text-sm text-gray-500">{movement.product_sku}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={typeLabel === 'ADD' ? 'default' : typeLabel === 'ADJUST' ? 'secondary' : 'destructive'}>
                              {typeLabel}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900" data-col="source" data-value={source}>{source}</td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">{movement.balance_before}</td>
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">{movement.balance_after}</td>
                          <td className="px-4 py-4 text-sm text-gray-500">{movement.reason || '-'}</td>
                        </tr>)
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="totals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Totals After Receiving</CardTitle>
              <CardDescription>Current stock per product and last update source</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {inventory.map((item: any) => {
                      const lastMovement = history.find((m: any) => m.product_id === item.product_id);
                      const source = lastMovement?.reference_type === 'RECEIVING_REPORT' ? 'Order' : lastMovement?.reference_type === 'MANUAL_ADD' ? 'Manual' : (lastMovement?.reference_type || '—')
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{item.product_name}</p>
                              <p className="text-sm text-gray-500">{item.product_sku}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-semibold">{item.quantity}</td>
                          <td className="px-4 py-4 text-sm text-gray-500">{item.product_unit}</td>
                          <td className="px-4 py-4 text-sm text-gray-900">{source}</td>
                          <td className="px-4 py-4 text-sm text-gray-500">{lastMovement ? new Date(lastMovement.created_at).toLocaleString() : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Product Dialog */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Product to Inventory</DialogTitle>
            <DialogDescription>
              Manually add a product to your inventory
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="product">Select Product</Label>
              <p className="text-sm text-gray-500 mb-2">
                This feature requires API integration with product search
              </p>
              <Input
                id="product"
                placeholder="Start typing product name or SKU..."
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="quantity">Initial Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="0.01"
                value={addQuantity}
                onChange={(e) => setAddQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-sm text-blue-800">
                <strong>Tip:</strong> You can also add products by receiving orders 
                or importing from a CSV file.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddProductDialog(false)
              setSelectedProductId('')
              setAddQuantity('')
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                toast('Manual product addition coming soon')
                setShowAddProductDialog(false)
              }}
              disabled={!selectedProductId || !addQuantity}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={showBulkUploadDialog} onOpenChange={setShowBulkUploadDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Bulk Upload Inventory</DialogTitle>
            <DialogDescription>
              Import inventory items from a CSV or Excel file
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="file">Upload File</Label>
              <Input
                id="file"
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setBulkUploadFile(e.target.files?.[0] || null)}
              />
              <p className="text-sm text-gray-500 mt-2">
                Accepted formats: CSV, Excel (.xlsx)
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-sm text-blue-800">
                <strong>CSV Format Example:</strong>
                <br />
                Product SKU,Quantity,Notes
                <br />
                TOM-001,50,Weekly supply
                <br />
                LET-001,30,Fresh produce
              </p>
            </div>

            {bulkUploadFile && (
              <div className="border rounded-md p-3 bg-gray-50">
                <p className="text-sm font-medium text-gray-700">
                  Selected: {bulkUploadFile.name}
                </p>
                <p className="text-xs text-gray-500">
                  Size: {(bulkUploadFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowBulkUploadDialog(false)
              setBulkUploadFile(null)
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                toast.success('Bulk upload feature coming soon')
                setShowBulkUploadDialog(false)
              }}
              disabled={!bulkUploadFile}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}