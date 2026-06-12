import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { StatusBadge } from '../../ui/status-badge'
import { Input } from '../../ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import { Skeleton } from '../../ui/skeleton'
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
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  useGetRestaurantInventoryQuery,
  useGetRestaurantInventoryHistoryQuery,
  useAddRestaurantInventoryMutation,
  useAdjustRestaurantInventoryMutation,
} from '../../../services/api'
import { toast } from 'sonner'
import { EmptyState } from '../../ui/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import {
  SORT_OPTIONS,
  calculateReorderQuantity,
  getItemCategory,
  getStatusSortRank,
  getStockStatus,
  summaryCardClass,
  type SortOption,
} from './inventoryShared'

export interface InventoryTabProps {
  wasteTrackingEnabled: boolean
  onNavigateToWaste: (productId: string) => void
}

export function InventoryTab({ wasteTrackingEnabled, onNavigateToWaste }: InventoryTabProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc')
  const [showAdjustDialog, setShowAdjustDialog] = useState(false)
  const [adjustingItem, setAdjustingItem] = useState<any>(null)
  const [adjustQuantity, setAdjustQuantity] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustType, setAdjustType] = useState<'ADD' | 'SUBTRACT'>('SUBTRACT')
  const [pinnedItems, setPinnedItems] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useGetRestaurantInventoryQuery()
  const { data: historyData } = useGetRestaurantInventoryHistoryQuery({ limit: 50 })
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
      ['Product Name', 'SKU', 'Category', 'Supplier', 'Quantity', 'Unit', 'Status', 'Last Updated'],
      ...inventory.map((item: any) => {
        const status = getStockStatus(item.quantity, item.low_stock_threshold)
        return [
          item.product_name,
          item.product_sku,
          getItemCategory(item),
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
      const lines = text.split('\n')
      const data = lines
        .slice(1)
        .map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '')))

      toast.success(`Processing ${data.length} inventory items from CSV...`)
      console.log('CSV data:', data)
    }
    reader.readAsText(file)
  }

  const uniqueSuppliers = Array.from(
    new Set<string>(
      inventory
        .map((item: { supplier_name?: string }) => item.supplier_name)
        .filter((s): s is string => Boolean(s))
    )
  ).sort()

  const uniqueCategories = Array.from(
    new Set<string>(
      inventory.map((item: any) => getItemCategory(item)).filter((c): c is string => Boolean(c))
    )
  ).sort()

  const hasActiveFilters =
    search !== '' || statusFilter !== 'ALL' || supplierFilter !== 'ALL' || categoryFilter !== 'ALL'

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('ALL')
    setSupplierFilter('ALL')
    setCategoryFilter('ALL')
  }

  const handleSummaryCardClick = (status: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK') => {
    setStatusFilter((current) => (current === status ? 'ALL' : status))
  }

  const filteredInventory = inventory
    .filter((item: any) => {
      const itemCategory = getItemCategory(item)
      const matchesSearch =
        !search ||
        item.product_name.toLowerCase().includes(search.toLowerCase()) ||
        item.product_sku.toLowerCase().includes(search.toLowerCase()) ||
        itemCategory.toLowerCase().includes(search.toLowerCase())
      const matchesStatus =
        statusFilter === 'ALL' ||
        getStockStatus(item.quantity, item.low_stock_threshold) === statusFilter
      const matchesSupplier = supplierFilter === 'ALL' || item.supplier_name === supplierFilter
      const matchesCategory = categoryFilter === 'ALL' || itemCategory === categoryFilter
      return matchesSearch && matchesStatus && matchesSupplier && matchesCategory
    })
    .sort((a: any, b: any) => {
      const aPinned = pinnedItems.has(a.product_id)
      const bPinned = pinnedItems.has(b.product_id)
      if (aPinned && !bPinned) return -1
      if (!aPinned && bPinned) return 1

      switch (sortBy) {
        case 'name_asc':
          return a.product_name.localeCompare(b.product_name)
        case 'name_desc':
          return b.product_name.localeCompare(a.product_name)
        case 'quantity_asc':
          return a.quantity - b.quantity
        case 'quantity_desc':
          return b.quantity - a.quantity
        case 'status': {
          const aRank = getStatusSortRank(getStockStatus(a.quantity, a.low_stock_threshold))
          const bRank = getStatusSortRank(getStockStatus(b.quantity, b.low_stock_threshold))
          return aRank - bRank || a.product_name.localeCompare(b.product_name)
        }
        case 'updated_desc':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
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

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
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

  return (
    <div className="space-y-6">
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
                        new Date(h.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
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
                        new Date(h.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
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

      {/* Summary Cards — click to filter by status */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card
          className={summaryCardClass(statusFilter === 'ALL')}
          onClick={() => handleSummaryCardClick('ALL')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleSummaryCardClick('ALL')}
        >
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
        <Card
          className={summaryCardClass(statusFilter === 'IN_STOCK')}
          onClick={() => handleSummaryCardClick('IN_STOCK')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleSummaryCardClick('IN_STOCK')}
        >
          <CardContent className="p-4 sm:pt-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">In Stock</p>
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
        <Card
          className={summaryCardClass(statusFilter === 'LOW_STOCK')}
          onClick={() => handleSummaryCardClick('LOW_STOCK')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleSummaryCardClick('LOW_STOCK')}
        >
          <CardContent className="p-4 sm:pt-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">Low Stock</p>
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
        <Card
          className={summaryCardClass(statusFilter === 'OUT_OF_STOCK')}
          onClick={() => handleSummaryCardClick('OUT_OF_STOCK')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleSummaryCardClick('OUT_OF_STOCK')}
        >
          <CardContent className="p-4 sm:pt-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">Out of Stock</p>
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
        <CardContent className="space-y-3 p-4 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              <label
                htmlFor="inventory-search"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
              >
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  id="inventory-search"
                  placeholder="Search by name, SKU, or category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 pl-10 pr-9"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Category
              </span>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="inventory-category-filter" className="w-full">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  {uniqueCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Supplier
              </span>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger id="inventory-supplier-filter" className="w-full">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Suppliers</SelectItem>
                  {uniqueSuppliers.map((supplier) => (
                    <SelectItem key={supplier} value={supplier}>
                      {supplier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Status
              </span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="inventory-status-filter" className="w-full">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="IN_STOCK">In Stock</SelectItem>
                  <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
                  <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Sort by
              </span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger id="inventory-sort" className="w-full">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                Clear filters
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--app-border)] pt-3 text-sm">
            <span className="text-[var(--text-muted)]">
              Showing{' '}
              <span className="font-semibold text-[var(--text)]">{filteredInventory.length}</span>{' '}
              of {inventory.length} items
            </span>
            {statusFilter !== 'ALL' ? (
              <Badge variant="secondary" className="gap-1">
                {statusFilter.replace(/_/g, ' ')}
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className="ml-0.5 rounded-sm hover:bg-[var(--app-border)]"
                  aria-label="Remove status filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {categoryFilter !== 'ALL' ? (
              <Badge variant="secondary" className="gap-1">
                {categoryFilter}
                <button
                  type="button"
                  onClick={() => setCategoryFilter('ALL')}
                  className="ml-0.5 rounded-sm hover:bg-[var(--app-border)]"
                  aria-label="Remove category filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {supplierFilter !== 'ALL' ? (
              <Badge variant="secondary" className="gap-1">
                {supplierFilter}
                <button
                  type="button"
                  onClick={() => setSupplierFilter('ALL')}
                  className="ml-0.5 rounded-sm hover:bg-[var(--app-border)]"
                  aria-label="Remove supplier filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
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
                <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
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
                  <Button variant="outline" onClick={clearFilters}>
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
                            {getItemCategory(item) ? ` · ${getItemCategory(item)}` : ''}
                            {item.supplier_name ? ` · ${item.supplier_name}` : ''}
                          </p>
                        </div>
                        <StatusBadge status={status} className="shrink-0" />
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
                          <Pin className={`mr-1.5 h-4 w-4 ${isPinned ? 'fill-current' : ''}`} />
                          {isPinned ? 'Pinned' : 'Pin'}
                        </Button>
                        {wasteTrackingEnabled ? (
                          <Button
                            variant="outline"
                            size="touch"
                            className="border-[var(--amber-mid)]/40 text-[var(--amber-mid)]"
                            onClick={() => {
                              onNavigateToWaste(item.product_id)
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
                        Category
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
                              <p className="font-medium text-[var(--text)]">{item.product_name}</p>
                              <p className="text-sm text-[var(--text-muted)]">{item.product_sku}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                            {getItemCategory(item) || '—'}
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
                              {item.days_of_stock != null ? (
                                <span className="text-xs text-[var(--text-muted)]">
                                  (~{Math.round(Number(item.days_of_stock))}d left)
                                </span>
                              ) : null}
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
                            <StatusBadge status={status} />
                          </td>
                          <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                            {new Date(item.updated_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              <Button
                                variant={pinnedItems.has(item.product_id) ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePinToggle(item.product_id)}
                                title={
                                  pinnedItems.has(item.product_id) ? 'Unpin item' : 'Pin to top'
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
                                    onNavigateToWaste(item.product_id)
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
            <DialogTitle>{adjustType === 'ADD' ? 'Add Inventory' : 'Reduce Inventory'}</DialogTitle>
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
    </div>
  )
}
