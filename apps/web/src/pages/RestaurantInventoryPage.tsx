import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Skeleton } from '../components/ui/skeleton'
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
  FileText,
  ShoppingCart,
  Recycle,
  Search,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  useGetRestaurantInventoryQuery,
  useGetRestaurantInventoryHistoryQuery,
  useAddRestaurantInventoryMutation,
  useAdjustRestaurantInventoryMutation,
  useGetEntitlementsQuery,
} from '../services/api'
import toast from 'react-hot-toast'
import { formatNumber } from '../utils/format'
import { featureEnabled } from '../lib/planLimits'
import { RestaurantWastePanel } from '../components/inventory/RestaurantWastePanel'
import { ExpiryInventoryTab } from '../components/inventory/ExpiryInventoryTab'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'

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
  const [wastePreselectProductId, setWastePreselectProductId] = useState<string | null>(null)
  const [historySource, setHistorySource] = useState('ALL')

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const wasteTrackingEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.waste_tracking
  )

  const { data, isLoading, error } = useGetRestaurantInventoryQuery()
  const { data: historyData, isLoading: isLoadingHistory } = useGetRestaurantInventoryHistoryQuery({
    limit: 50,
  })
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
          new Date(item.updated_at).toLocaleDateString(),
        ]
      }),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n')

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
      const data = lines
        .slice(1)
        .map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '')))

      toast.success(`Processing ${data.length} inventory items from CSV...`)
      // TODO: Implement bulk update API call
      console.log('CSV data:', data)
    }
    reader.readAsText(file)
  }

  const getMovementSource = (movement: any) =>
    movement.reference_type === 'RECEIVING_REPORT'
      ? 'Order'
      : movement.reference_type === 'MANUAL_ADD'
        ? 'Manual'
        : movement.reference_type || '—'

  const getMovementTypeLabel = (movement: any, source: string) => {
    const t = (movement.type || '').toUpperCase()
    if (source === 'Order') return 'ADD'
    if (t === 'ORDER' || t === 'RECEIVED') return 'ADD'
    if (t === 'ADD') return 'ADD'
    if (t === 'SUBTRACT') return 'SUBTRACT'
    if (t === 'COUNT_CORRECTION') return 'ADJUST'
    if (t === 'WASTAGE') return 'WASTE'
    if (t === 'SPOILAGE') return 'SPOIL'
    return t || '—'
  }

  const getMovementBadgeVariant = (typeLabel: string) =>
    typeLabel === 'ADD' ? 'default' : typeLabel === 'ADJUST' ? 'secondary' : 'destructive'

  const getMovementTypeText = (typeLabel: string) =>
    typeLabel === 'WASTE' ? 'Wastage' : typeLabel === 'SPOIL' ? 'Spoilage' : typeLabel

  const getStockStatus = (quantity: number, threshold: number) => {
    if (quantity === 0) return 'OUT_OF_STOCK'
    if (threshold && quantity <= threshold) return 'LOW_STOCK'
    return 'IN_STOCK'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_STOCK':
        return 'default'
      case 'LOW_STOCK':
        return 'secondary'
      case 'OUT_OF_STOCK':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const calculateReorderQuantity = (item: any) => {
    const { quantity, low_stock_threshold } = item
    if (!low_stock_threshold || quantity > low_stock_threshold) return 0
    const suggested = low_stock_threshold * 3 - quantity
    return Math.ceil(suggested)
  }

  const filteredInventory = inventory
    .filter((item: any) => {
      const matchesSearch =
        item.product_name.toLowerCase().includes(search.toLowerCase()) ||
        item.product_sku.toLowerCase().includes(search.toLowerCase())
      const matchesStatus =
        statusFilter === 'ALL' ||
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
    inStock: inventory.filter(
      (item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'IN_STOCK'
    ).length,
    lowStock: inventory.filter(
      (item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'LOW_STOCK'
    ).length,
    outOfStock: inventory.filter(
      (item: any) => getStockStatus(item.quantity, item.low_stock_threshold) === 'OUT_OF_STOCK'
    ).length,
  }

  const filteredHistory =
    historySource === 'ALL'
      ? history
      : history.filter((m: any) => getMovementSource(m) === historySource)

  if (isLoading) {
    return (
      <div className="page-stack p-4 sm:p-6">
        <div className="flex justify-between items-start">
          <div>
            <Skeleton className="h-9 w-40 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)] text-lg font-semibold mb-2">Failed to load inventory</p>
        <p className="text-[var(--text-muted)] text-sm">{error?.message || 'An error occurred'}</p>
      </div>
    )
  }

  const filterSelectClass =
    'h-10 w-full rounded-md border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]'

  return (
    <RequirePermission permission="INVENTORY_VIEW" title="inventory">
      <div className="page-stack p-4 sm:p-6">
        <PageHeader
          title="Inventory"
          description="Track your stock levels and manage inventory"
          actions={
            <>
              <Button
                onClick={() => setShowBulkUploadDialog(true)}
                variant="outline"
                className="flex-1 sm:flex-none"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button onClick={() => setShowAddProductDialog(true)} className="flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="inventory">Current Inventory</TabsTrigger>
            {wasteTrackingEnabled ? (
              <TabsTrigger value="waste">Waste & spoilage</TabsTrigger>
            ) : null}
            <TabsTrigger value="history">Movement History</TabsTrigger>
            <TabsTrigger value="expiry">Expiry tracking</TabsTrigger>
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--brand-pale)] bg-[var(--brand-pale)]/40 p-4">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text-muted)]">Total Movements</p>
                      <p className="text-2xl font-bold text-[var(--text)]">{history.length}</p>
                    </div>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] shadow-sm">
                      <FileText className="h-6 w-6 text-[var(--brand-mid)]" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--mint-pale)] bg-[var(--mint-pale)]/40 p-4">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text-muted)]">Recent Additions</p>
                      <p className="text-2xl font-bold text-[var(--mint)]">
                        {
                          history.filter(
                            (h: any) =>
                              h.type === 'ADD' &&
                              new Date(h.created_at) >
                                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                          ).length
                        }
                      </p>
                    </div>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] shadow-sm">
                      <TrendingUp className="h-6 w-6 text-[var(--mint)]" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--red-pale)] bg-[var(--red-pale)]/40 p-4">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text-muted)]">Recent Subtractions</p>
                      <p className="text-2xl font-bold text-[var(--red)]">
                        {
                          history.filter(
                            (h: any) =>
                              h.type === 'SUBTRACT' &&
                              new Date(h.created_at) >
                                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                          ).length
                        }
                      </p>
                    </div>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] shadow-sm">
                      <TrendingDown className="h-6 w-6 text-[var(--red)]" />
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4 sm:pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">
                        Total Products
                      </p>
                      <p className="text-xl font-bold sm:text-2xl">{summary.total}</p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-pale)] sm:h-11 sm:w-11">
                      <Package className="h-5 w-5 text-[var(--brand-mid)] sm:h-6 sm:w-6" />
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">
                        In Stock
                      </p>
                      <p className="text-xl font-bold text-[var(--mint)] sm:text-2xl">
                        {summary.inStock}
                      </p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--mint-pale)] sm:h-11 sm:w-11">
                      <TrendingUp className="h-5 w-5 text-[var(--mint)] sm:h-6 sm:w-6" />
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">
                        Low Stock
                      </p>
                      <p className="text-xl font-bold text-[var(--amber)] sm:text-2xl">
                        {summary.lowStock}
                      </p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--amber-pale)] sm:h-11 sm:w-11">
                      <AlertCircle className="h-5 w-5 text-[var(--amber-mid)] sm:h-6 sm:w-6" />
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">
                        Out of Stock
                      </p>
                      <p className="text-xl font-bold text-[var(--red)] sm:text-2xl">
                        {summary.outOfStock}
                      </p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--red-pale)] sm:h-11 sm:w-11">
                      <TrendingDown className="h-5 w-5 text-[var(--red)] sm:h-6 sm:w-6" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-4 pt-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                  <div className="min-w-0 sm:col-span-2 lg:col-span-6">
                    <Label htmlFor="inventory-search" className="sr-only">
                      Search products
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                      <Input
                        id="inventory-search"
                        placeholder="Search products..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-10 pl-10"
                      />
                    </div>
                  </div>
                  <div className="min-w-0 lg:col-span-3">
                    <Label htmlFor="inventory-supplier-filter" className="sr-only">
                      Supplier
                    </Label>
                    <select
                      id="inventory-supplier-filter"
                      value={supplierFilter}
                      onChange={(e) => setSupplierFilter(e.target.value)}
                      className={filterSelectClass}
                    >
                      <option value="ALL">All Suppliers</option>
                      {Array.from(
                        new Set<string>(
                          inventory
                            .map((item: { supplier_name?: string }) => item.supplier_name)
                            .filter((s): s is string => Boolean(s))
                        )
                      ).map((supplier) => (
                        <option key={supplier} value={supplier}>
                          {supplier}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 lg:col-span-3">
                    <Label htmlFor="inventory-status-filter" className="sr-only">
                      Status
                    </Label>
                    <select
                      id="inventory-status-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className={filterSelectClass}
                    >
                      <option value="ALL">All Status</option>
                      <option value="IN_STOCK">In Stock</option>
                      <option value="LOW_STOCK">Low Stock</option>
                      <option value="OUT_OF_STOCK">Out of Stock</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Inventory Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Inventory Items</CardTitle>
                    <CardDescription>View and manage your stock levels</CardDescription>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                    <label>
                      <Button variant="outline" size="sm" asChild>
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
                {filteredInventory.length === 0 ? (
                  <EmptyState
                    icon={<Package className="h-6 w-6" />}
                    title={inventory.length === 0 ? 'No inventory yet' : 'No matching items'}
                    description={
                      inventory.length === 0
                        ? 'Place an order and receive goods to see inventory here.'
                        : 'Try adjusting your search or filters.'
                    }
                    action={
                      inventory.length === 0 ? (
                        <Button asChild>
                          <Link to="/app/cart">
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            Create first order
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSearch('')
                            setStatusFilter('ALL')
                            setSupplierFilter('ALL')
                            setCategoryFilter('ALL')
                          }}
                        >
                          Clear filters
                        </Button>
                      )
                    }
                  />
                ) : (
                  <>
                    {/* Mobile: card list */}
                    <div className="space-y-3 md:hidden">
                      {filteredInventory.map((item: any) => {
                        const status = getStockStatus(item.quantity, item.low_stock_threshold)
                        const reorderQty = calculateReorderQuantity(item)
                        const isPinned = pinnedItems.has(item.product_id)
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-[var(--text)]">
                                  {item.product_name}
                                </p>
                                <p className="truncate text-xs text-[var(--text-muted)]">
                                  {item.product_sku}
                                  {item.supplier_name ? ` · ${item.supplier_name}` : ''}
                                </p>
                              </div>
                              <Badge variant={getStatusColor(status)} className="shrink-0">
                                {status.replace('_', ' ')}
                              </Badge>
                            </div>

                            <div className="mt-3 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                                  On hand
                                </p>
                                <p className="text-lg font-bold text-[var(--text)]">
                                  {item.quantity}{' '}
                                  <span className="text-sm font-medium text-[var(--text-muted)]">
                                    {item.product_unit}
                                  </span>
                                </p>
                              </div>
                              {reorderQty > 0 ? (
                                <div className="text-right">
                                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                                    Suggested reorder
                                  </p>
                                  <p className="text-lg font-bold text-[var(--amber)]">
                                    {reorderQty}{' '}
                                    <span className="text-sm font-medium text-[var(--text-muted)]">
                                      {item.product_unit}
                                    </span>
                                  </p>
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--app-border)] pt-3">
                              <Button
                                variant="outline"
                                size="touch"
                                onClick={() => handleOpenAdjustDialog(item, 'ADD')}
                              >
                                <Plus className="mr-1.5 h-4 w-4" />
                                Add
                              </Button>
                              <Button
                                variant="outline"
                                size="touch"
                                onClick={() => handleOpenAdjustDialog(item, 'SUBTRACT')}
                              >
                                <Minus className="mr-1.5 h-4 w-4" />
                                Reduce
                              </Button>
                              <Button
                                variant={isPinned ? 'default' : 'outline'}
                                size="touch"
                                onClick={() => handlePinToggle(item.product_id)}
                              >
                                <Pin
                                  className={`mr-1.5 h-4 w-4 ${isPinned ? 'fill-current' : ''}`}
                                />
                                {isPinned ? 'Pinned' : 'Pin'}
                              </Button>
                              {wasteTrackingEnabled ? (
                                <Button
                                  variant="outline"
                                  size="touch"
                                  className="border-[var(--amber-mid)]/40 text-[var(--amber-mid)]"
                                  onClick={() => {
                                    setWastePreselectProductId(item.product_id)
                                    setActiveTab('waste')
                                  }}
                                >
                                  <Recycle className="mr-1.5 h-4 w-4" />
                                  Waste
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden overflow-x-auto rounded-lg border border-[var(--app-border)] md:block">
                      <table className="w-full">
                        <thead className="bg-[var(--brand-ultra)]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                              Product
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                              Supplier
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                              Quantity
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                              Suggested Reorder
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                              Last Updated
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-border)]">
                          {filteredInventory.map((item: any) => {
                            const status = getStockStatus(item.quantity, item.low_stock_threshold)
                            const reorderQty = calculateReorderQuantity(item)
                            return (
                              <tr key={item.id} className="hover:bg-[var(--brand-ultra)]">
                                <td className="px-4 py-4">
                                  <div>
                                    <p className="font-medium text-[var(--text)]">
                                      {item.product_name}
                                    </p>
                                    <p className="text-sm text-[var(--text-muted)]">
                                      {item.product_sku}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-sm text-[var(--text)]">
                                  {item.supplier_name}
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{item.quantity}</span>
                                    <span className="text-sm text-[var(--text-muted)]">
                                      {item.product_unit}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  {reorderQty > 0 ? (
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-[var(--amber)]">
                                        {reorderQty}
                                      </span>
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
                                    <span className="text-[var(--text-muted)]">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-4">
                                  <Badge variant={getStatusColor(status)}>
                                    {status.replace('_', ' ')}
                                  </Badge>
                                </td>
                                <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                                  {new Date(item.updated_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex gap-2">
                                    <Button
                                      variant={
                                        pinnedItems.has(item.product_id) ? 'default' : 'outline'
                                      }
                                      size="sm"
                                      onClick={() => handlePinToggle(item.product_id)}
                                      title={
                                        pinnedItems.has(item.product_id)
                                          ? 'Unpin item'
                                          : 'Pin to top'
                                      }
                                    >
                                      <Pin
                                        className={`h-4 w-4 ${pinnedItems.has(item.product_id) ? 'fill-current' : ''}`}
                                      />
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
                                      title="Count correction (reduce stock)"
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                    {wasteTrackingEnabled ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-[var(--amber-mid)] border-[var(--amber-mid)]/40"
                                        onClick={() => {
                                          setWastePreselectProductId(item.product_id)
                                          setActiveTab('waste')
                                        }}
                                        title="Log waste or spoilage"
                                      >
                                        <Recycle className="h-4 w-4" />
                                      </Button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
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
                      : `Adjust inventory for ${adjustingItem?.product_name}`}
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
                    <p className="text-sm text-[var(--text-muted)]">
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
                  <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdjustInventory}>
                    {adjustType === 'ADD' ? 'Add Inventory' : 'Reduce Inventory'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {wasteTrackingEnabled ? (
            <TabsContent value="waste" className="space-y-6">
              <RestaurantWastePanel
                inventory={inventory}
                preselectedProductId={wastePreselectProductId}
                onPreselectConsumed={() => setWastePreselectProductId(null)}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="expiry" className="space-y-6">
            <ExpiryInventoryTab />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Movement History</CardTitle>
                <CardDescription>Recent inventory changes and adjustments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <label
                    htmlFor="history-source-filter"
                    className="text-sm text-[var(--text-muted)]"
                  >
                    Source
                  </label>
                  <select
                    id="history-source-filter"
                    value={historySource}
                    onChange={(e) => setHistorySource(e.target.value)}
                    className={`${filterSelectClass} sm:w-48`}
                  >
                    <option value="ALL">All</option>
                    <option value="Order">Order</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                {isLoadingHistory ? (
                  <div className="text-center py-12">Loading history...</div>
                ) : history.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                    <p className="text-[var(--text-muted)]">No inventory movements yet</p>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] py-12 text-center">
                    <p className="text-[var(--text-muted)]">No movements match this filter.</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile: card list */}
                    <div className="space-y-3 md:hidden">
                      {filteredHistory.map((movement: any) => {
                        const source = getMovementSource(movement)
                        const typeLabel = getMovementTypeLabel(movement, source)
                        return (
                          <div
                            key={movement.id}
                            className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-[var(--text)]">
                                  {movement.product_name}
                                </p>
                                <p className="truncate text-xs text-[var(--text-muted)]">
                                  {movement.product_sku} · {source}
                                </p>
                              </div>
                              <Badge
                                variant={getMovementBadgeVariant(typeLabel)}
                                className="shrink-0"
                              >
                                {getMovementTypeText(typeLabel)}
                              </Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                              <span className="font-semibold text-[var(--text)]">
                                {movement.quantity > 0 ? '+' : ''}
                                {movement.quantity}
                              </span>
                              <span className="text-[var(--text-muted)]">
                                {movement.balance_before} → {movement.balance_after}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                              {new Date(movement.created_at).toLocaleString()}
                            </p>
                            {movement.reason ? (
                              <p className="mt-1 text-xs text-[var(--text-mid)]">
                                {movement.reason}
                              </p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full">
                        <thead className="bg-[var(--brand-ultra)]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Product
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Source
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Quantity
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Balance Before
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Balance After
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Reason
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-border)]">
                          {filteredHistory.map((movement: any) => {
                            const source = getMovementSource(movement)
                            const typeLabel = getMovementTypeLabel(movement, source)
                            return (
                              <tr key={movement.id} className="hover:bg-[var(--brand-ultra)]">
                                <td className="px-4 py-4 text-sm text-[var(--text)]">
                                  {new Date(movement.created_at).toLocaleString()}
                                </td>
                                <td className="px-4 py-4">
                                  <div>
                                    <p className="font-medium text-[var(--text)]">
                                      {movement.product_name}
                                    </p>
                                    <p className="text-sm text-[var(--text-muted)]">
                                      {movement.product_sku}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <Badge variant={getMovementBadgeVariant(typeLabel)}>
                                    {getMovementTypeText(typeLabel)}
                                  </Badge>
                                </td>
                                <td className="px-4 py-4 text-sm text-[var(--text)]">{source}</td>
                                <td className="px-4 py-4 text-sm text-[var(--text)]">
                                  {movement.quantity > 0 ? '+' : ''}
                                  {movement.quantity}
                                </td>
                                <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                                  {movement.balance_before}
                                </td>
                                <td className="px-4 py-4 text-sm font-medium text-[var(--text)]">
                                  {movement.balance_after}
                                </td>
                                <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                                  {movement.reason || '-'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
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
                {inventory.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] py-12 text-center">
                    <p className="text-[var(--text-muted)]">No inventory yet.</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile: card list */}
                    <div className="space-y-3 md:hidden">
                      {inventory.map((item: any) => {
                        const lastMovement = history.find(
                          (m: any) => m.product_id === item.product_id
                        )
                        const source = lastMovement ? getMovementSource(lastMovement) : '—'
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-[var(--text)]">
                                  {item.product_name}
                                </p>
                                <p className="truncate text-xs text-[var(--text-muted)]">
                                  {item.product_sku}
                                </p>
                              </div>
                              <p className="shrink-0 text-right text-lg font-bold text-[var(--text)]">
                                {item.quantity}{' '}
                                <span className="text-sm font-medium text-[var(--text-muted)]">
                                  {item.product_unit}
                                </span>
                              </p>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                              <span>
                                Last source: <span className="text-[var(--text)]">{source}</span>
                              </span>
                              <span>
                                {lastMovement
                                  ? new Date(lastMovement.created_at).toLocaleString()
                                  : '—'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full">
                        <thead className="bg-[var(--brand-ultra)]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Product
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Current Total
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Unit
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Last Source
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                              Last Change
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-border)]">
                          {inventory.map((item: any) => {
                            const lastMovement = history.find(
                              (m: any) => m.product_id === item.product_id
                            )
                            const source = lastMovement ? getMovementSource(lastMovement) : '—'
                            return (
                              <tr key={item.id} className="hover:bg-[var(--brand-ultra)]">
                                <td className="px-4 py-4">
                                  <div>
                                    <p className="font-medium text-[var(--text)]">
                                      {item.product_name}
                                    </p>
                                    <p className="text-sm text-[var(--text-muted)]">
                                      {item.product_sku}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-4 font-semibold">{item.quantity}</td>
                                <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                                  {item.product_unit}
                                </td>
                                <td className="px-4 py-4 text-sm text-[var(--text)]">{source}</td>
                                <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                                  {lastMovement
                                    ? new Date(lastMovement.created_at).toLocaleString()
                                    : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Product Dialog */}
        <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Product to Inventory</DialogTitle>
              <DialogDescription>Manually add a product to your inventory</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="product">Select Product</Label>
                <p className="text-sm text-[var(--text-muted)] mb-2">
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

              <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
                <p className="text-sm text-[var(--brand-mid)]">
                  <strong>Tip:</strong> You can also add products by receiving orders or importing
                  from a CSV file.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddProductDialog(false)
                  setSelectedProductId('')
                  setAddQuantity('')
                }}
              >
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
              <DialogDescription>Import inventory items from a CSV or Excel file</DialogDescription>
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
                <p className="text-sm text-[var(--text-muted)] mt-2">
                  Accepted formats: CSV, Excel (.xlsx)
                </p>
              </div>

              <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
                <p className="text-sm text-[var(--brand-mid)]">
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
                <div className="border rounded-md p-3 bg-[var(--brand-ultra)]">
                  <p className="text-sm font-medium text-[var(--text-mid)]">
                    Selected: {bulkUploadFile.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Size: {formatNumber(bulkUploadFile.size / 1024, { maximumFractionDigits: 2 })}{' '}
                    KB
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkUploadDialog(false)
                  setBulkUploadFile(null)
                }}
              >
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
    </RequirePermission>
  )
}
