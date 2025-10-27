import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { 
  Package,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Plus,
  Minus,
  Filter
} from 'lucide-react'

export function RestaurantInventoryPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // ALL, IN_STOCK, LOW_STOCK, OUT_OF_STOCK

  // TODO: Replace with actual API call
  const inventory = [
    {
      id: '1',
      product_name: 'Fresh Tomatoes',
      product_sku: 'TOM-001',
      supplier_name: 'Farm Fresh',
      quantity: 45.5,
      unit: 'kg',
      low_stock_threshold: 20,
      updated_at: '2024-10-20T10:30:00Z'
    },
    {
      id: '2',
      product_name: 'Fresh Lettuce',
      product_sku: 'LET-001',
      supplier_name: 'Garden Greens',
      quantity: 12.0,
      unit: 'kg',
      low_stock_threshold: 15,
      updated_at: '2024-10-21T14:20:00Z'
    },
    {
      id: '3',
      product_name: 'Chicken Breast',
      product_sku: 'MEAT-001',
      supplier_name: 'Premium Meats',
      quantity: 25.0,
      unit: 'kg',
      low_stock_threshold: 10,
      updated_at: '2024-10-22T08:15:00Z'
    }
  ]

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

  const filteredInventory = inventory.filter((item: any) => {
    const matchesSearch = item.product_name.toLowerCase().includes(search.toLowerCase()) ||
                         item.product_sku.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || 
                          getStockStatus(item.quantity, item.low_stock_threshold) === statusFilter
    return matchesSearch && matchesStatus
  })

  const summary = {
    total: inventory.length,
    inStock: inventory.filter((item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'IN_STOCK').length,
    lowStock: inventory.filter((item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'LOW_STOCK').length,
    outOfStock: inventory.filter((item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'OUT_OF_STOCK').length
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
        <p className="text-gray-600 mt-2">Track your stock levels and manage inventory</p>
      </div>

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
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
          <CardTitle>Inventory Items</CardTitle>
          <CardDescription>View and manage your stock levels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredInventory.map((item: any) => {
                  const status = getStockStatus(item.quantity, item.low_stock_threshold)
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
                          <span className="text-sm text-gray-500">{item.unit}</span>
                        </div>
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
                          <Button variant="outline" size="sm">
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Filter className="h-4 w-4" />
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
    </div>
  )
}

