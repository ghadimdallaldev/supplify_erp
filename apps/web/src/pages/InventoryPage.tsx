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
import { Warehouse, Package, AlertTriangle, TrendingUp, Settings, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useGetInventoryListQuery,
  useGetWarehousesQuery,
  useCreateInventoryAdjustmentMutation,
} from '../services/api'
import { RequirePermission } from '../components/RequirePermission'
import { formatNumber } from '../utils/format'
import { AdminKpiCard } from '../components/admin/AdminKpiCard'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { StatusBadge } from '../components/ui/status-badge'
import { Skeleton } from '../components/ui/skeleton'

const ADJUSTMENT_TYPES = [
  { value: 'IN', label: 'Add Stock' },
  { value: 'OUT', label: 'Remove Stock' },
]

export function InventoryPage() {
  const [showAdjustment, setShowAdjustment] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [showWarehouseView, setShowWarehouseView] = useState(false)
  const [adjustmentForm, setAdjustmentForm] = useState({
    adjustmentType: 'IN' as 'IN' | 'OUT',
    quantity: '',
    reason: '',
    notes: '',
  })

  const { data, error, isLoading, refetch } = useGetInventoryListQuery()
  const { data: warehousesData, isLoading: isLoadingWarehouses } = useGetWarehousesQuery()
  const [createAdjustment, { isLoading: isAdjusting }] = useCreateInventoryAdjustmentMutation()

  const inventory = data?.inventory || []
  const warehouses = warehousesData?.warehouses || []

  const handleAdjustment = async () => {
    if (!selectedProduct?.product_id) return
    const qty = parseFloat(adjustmentForm.quantity)
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity')
      return
    }
    if (!adjustmentForm.reason.trim()) {
      toast.error('Reason is required')
      return
    }
    try {
      await createAdjustment({
        productId: selectedProduct.product_id,
        adjustmentType: adjustmentForm.adjustmentType,
        quantity: qty,
        reason: adjustmentForm.reason,
        notes: adjustmentForm.notes || undefined,
      }).unwrap()
      toast.success('Inventory adjustment recorded')
      setShowAdjustment(false)
      setAdjustmentForm({ adjustmentType: 'IN', quantity: '', reason: '', notes: '' })
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to record adjustment')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" style={{ background: 'var(--brand-ultra)' }} />
          <Skeleton className="h-4 w-72" style={{ background: 'var(--brand-ultra)' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--app-border)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <Skeleton className="h-3 w-20" style={{ background: 'var(--brand-ultra)' }} />
              <Skeleton className="h-8 w-16" style={{ background: 'var(--brand-ultra)' }} />
            </div>
          ))}
        </div>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--app-border)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton
                key={i}
                className="h-11 w-full rounded-lg"
                style={{ background: 'var(--brand-ultra)' }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <p className="mb-1 font-semibold text-red-900">Failed to load inventory</p>
        <p className="mb-4 text-sm text-red-700">There was a problem fetching inventory data.</p>
        <Button onClick={() => refetch()} variant="outline" className="border-red-300 text-red-800">
          Try again
        </Button>
      </div>
    )
  }

  return (
    <RequirePermission permission="INVENTORY_VIEW" title="inventory">
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          description="Manage stock levels and adjustments across all warehouses"
          actions={
            <Button variant="outline" onClick={() => setShowWarehouseView(!showWarehouseView)}>
              <Warehouse className="mr-2 h-4 w-4" />
              {showWarehouseView ? 'Table view' : 'By warehouse'}
            </Button>
          }
        />

        {/* KPI summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminKpiCard
            label="Total Products"
            value={inventory.length}
            icon={Package}
            tone="brand"
          />
          <AdminKpiCard
            label="Reserved"
            value={formatNumber(
              inventory.reduce(
                (sum: number, item: any) => sum + parseFloat(item.reserved_qty || 0),
                0
              ),
              { maximumFractionDigits: 1 }
            )}
            icon={Warehouse}
            tone="warning"
          />
          <AdminKpiCard
            label="Low Stock"
            value={inventory.filter((item: any) => item.isLowStock).length}
            icon={AlertTriangle}
            tone="danger"
          />
          <AdminKpiCard
            label="Available"
            value={formatNumber(
              inventory.reduce(
                (sum: number, item: any) => sum + parseFloat(item.available_qty || 0),
                0
              ),
              { maximumFractionDigits: 1 }
            )}
            icon={TrendingUp}
            tone="success"
          />
        </div>

        {/* Main inventory table */}
        {!showWarehouseView && (
          <>
            {inventory.length === 0 ? (
              <EmptyState
                title="No inventory items"
                description="Add products and configure stock levels to start tracking inventory."
                icon={<Package className="h-6 w-6" />}
              />
            ) : (
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--app-border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--app-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span className="text-sm font-semibold text-[var(--text)]">
                    Inventory Overview
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {inventory.length} {inventory.length === 1 ? 'product' : 'products'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--app-border)' }}>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Product
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Warehouse
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          On Hand
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Reserved
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Available
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Status
                        </th>
                        <th className="py-3 px-4 text-center text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((item: any) => (
                        <tr
                          key={item.id}
                          style={{ borderBottom: '1px solid var(--app-border)' }}
                          className="transition-colors hover:bg-[var(--brand-ultra)]"
                        >
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-sm font-medium text-[var(--text)]">
                                {item.product_name}
                              </p>
                              <p className="text-xs text-[var(--text-muted)]">{item.sku}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {item.warehouse_name ? (
                              <div className="flex items-center gap-2">
                                <Warehouse className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                                <div>
                                  <p className="text-sm font-medium text-[var(--text)]">
                                    {item.warehouse_name}
                                  </p>
                                  {item.warehouse_code && (
                                    <p className="text-xs text-[var(--text-muted)]">
                                      {item.warehouse_code}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-medium text-[var(--text)]">
                              {formatNumber(
                                parseFloat(String(item.available_qty || 0)) +
                                  parseFloat(String(item.reserved_qty || 0)),
                                { maximumFractionDigits: 2 }
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm" style={{ color: 'var(--amber)' }}>
                              {item.reserved_qty || 0}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-medium" style={{ color: 'var(--mint)' }}>
                              {item.available_qty || 0}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {item.isLowStock ? (
                              <StatusBadge status="PENDING" label="Low Stock" />
                            ) : (
                              <StatusBadge status="ACTIVE" label="In Stock" />
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
              </div>
            )}
          </>
        )}

        {/* Warehouse view */}
        {showWarehouseView && (
          <div className="space-y-6">
            {isLoadingWarehouses ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--app-border)',
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <Skeleton
                      className="mb-2 h-5 w-48"
                      style={{ background: 'var(--brand-ultra)' }}
                    />
                    <Skeleton
                      className="mb-4 h-3 w-32"
                      style={{ background: 'var(--brand-ultra)' }}
                    />
                    <div className="space-y-2">
                      {[1, 2, 3].map((j) => (
                        <Skeleton
                          key={j}
                          className="h-10 w-full rounded"
                          style={{ background: 'var(--brand-ultra)' }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : warehouses.length === 0 ? (
              <EmptyState
                title="No warehouses found"
                description="You haven't created any warehouses yet. Create warehouses in your settings."
                icon={<Warehouse className="h-6 w-6" />}
                action={
                  <Button variant="outline" onClick={() => setShowWarehouseView(false)}>
                    Return to table view
                  </Button>
                }
              />
            ) : (
              warehouses.map((warehouse: any) => (
                <Card key={warehouse.id} className="overflow-hidden">
                  <CardHeader className="bg-[var(--brand-ultra)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Warehouse className="h-5 w-5" />
                          {warehouse.name}
                          {warehouse.code && (
                            <Badge variant="outline" className="ml-2">
                              {warehouse.code}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {warehouse.product_count || 0} products ·{' '}
                          {warehouse.total_available_qty || 0} total available
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold" style={{ color: 'var(--mint)' }}>
                          Available: {warehouse.total_available_qty || 0}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--amber)' }}>
                          Reserved: {warehouse.total_reserved_qty || 0}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {warehouse.inventory && warehouse.inventory.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-[var(--brand-ultra)]">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)]">
                                Product
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                                On Hand
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                                Reserved
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                                Available
                              </th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-[var(--text-muted)]">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {warehouse.inventory.map((item: any) => (
                              <tr key={item.id} className="border-b hover:bg-[var(--brand-ultra)]">
                                <td className="px-4 py-2">
                                  <div>
                                    <p className="text-sm font-medium">{item.product_name}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{item.sku}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className="text-sm">
                                    {formatNumber(
                                      parseFloat(String(item.available_qty || 0)) +
                                        parseFloat(String(item.reserved_qty || 0)),
                                      { maximumFractionDigits: 2 }
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className="text-sm" style={{ color: 'var(--amber)' }}>
                                    {item.reserved_qty || 0}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span
                                    className="text-sm font-medium"
                                    style={{ color: 'var(--mint)' }}
                                  >
                                    {item.available_qty || 0}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {item.isLowStock ? (
                                    <StatusBadge status="PENDING" label="Low Stock" />
                                  ) : (
                                    <StatusBadge status="ACTIVE" label="In Stock" />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                        No inventory in this warehouse
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

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
                <select
                  className="w-full rounded-md border border-[var(--app-border-mid)] px-3 py-2 text-sm"
                  value={adjustmentForm.adjustmentType}
                  onChange={(e) =>
                    setAdjustmentForm((f) => ({
                      ...f,
                      adjustmentType: e.target.value as 'IN' | 'OUT',
                    }))
                  }
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Enter quantity"
                  value={adjustmentForm.quantity}
                  onChange={(e) => setAdjustmentForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason *</label>
                <Input
                  placeholder="Enter reason for adjustment"
                  value={adjustmentForm.reason}
                  onChange={(e) => setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  className="w-full rounded-md border border-[var(--app-border-mid)] px-3 py-2 text-sm"
                  rows={3}
                  value={adjustmentForm.notes}
                  onChange={(e) => setAdjustmentForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdjustment(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdjustment} disabled={isAdjusting}>
                {isAdjusting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <Button
                onClick={() => {
                  toast.success('Settings saved')
                  setShowSettings(false)
                }}
              >
                Save Settings
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  )
}
