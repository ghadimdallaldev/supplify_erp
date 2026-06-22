import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ensureNamespace } from '../i18n'
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
import { Warehouse, Package, AlertTriangle, Settings, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetInventoryListQuery,
  useGetWarehousesQuery,
  useCreateInventoryAdjustmentMutation,
} from '../services/api'
import { RequirePermission } from '../components/RequirePermission'
import { usePermissions } from '../hooks/usePermissions'
import { SummaryStrip } from '../components/ui/app-panel'
import { PageShell } from '../components/ui/page-shell'
import { PageHeader } from '../components/ui/page-header'
import { formatNumber } from '../utils/format'
import { EmptyState } from '../components/ui/empty-state'
import { StatusBadge } from '../components/ui/status-badge'
import { Skeleton } from '../components/ui/skeleton'
import { Select, SelectTrigger } from '../components/ui/select'
import { DataTableShell } from '../components/ui/data-table-shell'
import {
  resolveSupplierInventoryStatus,
  countSupplierLowStockItems,
} from '../lib/supplierStockStatus'

export function InventoryPage() {
  const { t } = useTranslation('inventory')

  useEffect(() => {
    void ensureNamespace('inventory')
  }, [])

  const { can } = usePermissions()
  const canViewInventory = can('INVENTORY_VIEW')
  const canViewWarehouses = can('WAREHOUSES_VIEW')
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

  const { data, error, isLoading, refetch } = useGetInventoryListQuery(undefined, {
    skip: !canViewInventory,
  })
  const { data: warehousesData, isLoading: isLoadingWarehouses } = useGetWarehousesQuery(
    undefined,
    {
      skip: !canViewWarehouses,
    }
  )
  const [createAdjustment, { isLoading: isAdjusting }] = useCreateInventoryAdjustmentMutation()

  const adjustmentTypes = [
    { value: 'IN' as const, label: t('supplierPage.adjustDialog.addStock') },
    { value: 'OUT' as const, label: t('supplierPage.adjustDialog.removeStock') },
  ]

  const inventory = data?.inventory || []
  const warehouses = warehousesData?.warehouses || []
  const lowStockCount = countSupplierLowStockItems(inventory)

  const renderInventoryStatus = (item: {
    available_qty?: number | string | null
    isLowStock?: boolean
    low_stock_threshold?: number | string | null
  }) => {
    const { status, label } = resolveSupplierInventoryStatus(item)
    return <StatusBadge status={status} label={label} />
  }

  const handleAdjustment = async () => {
    if (!selectedProduct?.product_id) return
    const qty = parseFloat(adjustmentForm.quantity)
    if (!qty || qty <= 0) {
      toast.error(t('supplierPage.toasts.validQuantity'))
      return
    }
    if (!adjustmentForm.reason.trim()) {
      toast.error(t('supplierPage.toasts.reasonRequired'))
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
      toast.success(t('supplierPage.toasts.adjustmentRecorded'))
      setShowAdjustment(false)
      setAdjustmentForm({ adjustmentType: 'IN', quantity: '', reason: '', notes: '' })
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('supplierPage.toasts.adjustmentFailed'))
    }
  }

  if (isLoading) {
    return (
      <RequirePermission permission="INVENTORY_VIEW" title={t('supplierPage.gateTitle')}>
        <PageShell maxWidth="wide">
          <div className="space-y-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-48" style={{ background: 'var(--brand-ultra)' }} />
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
        </PageShell>
      </RequirePermission>
    )
  }

  if (error) {
    return (
      <RequirePermission permission="INVENTORY_VIEW" title={t('supplierPage.gateTitle')}>
        <PageShell maxWidth="wide">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <p className="mb-1 font-semibold text-red-900">{t('supplierPage.error.title')}</p>
            <p className="mb-4 text-sm text-red-700">{t('supplierPage.error.description')}</p>
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="border-red-300 text-red-800"
            >
              {t('supplierPage.error.retry')}
            </Button>
          </div>
        </PageShell>
      </RequirePermission>
    )
  }

  return (
    <RequirePermission permission="INVENTORY_VIEW" title={t('supplierPage.gateTitle')}>
      <PageShell maxWidth="wide">
        <PageHeader
          title={t('supplierPage.title')}
          description={t('supplierPage.description')}
          actions={
            <Button variant="outline" onClick={() => setShowWarehouseView(!showWarehouseView)}>
              <Warehouse className="mr-2 h-4 w-4" />
              {showWarehouseView ? t('supplierPage.tableView') : t('supplierPage.byWarehouse')}
            </Button>
          }
        />

        <SummaryStrip
          testId="inventory-summary"
          metrics={[
            { label: t('supplierPage.summary.totalProducts'), value: inventory.length },
            {
              label: t('supplierPage.summary.reserved'),
              value: formatNumber(
                inventory.reduce(
                  (sum: number, item: any) => sum + parseFloat(item.reserved_qty || 0),
                  0
                ),
                { maximumFractionDigits: 1 }
              ),
              tone: 'amber',
            },
            {
              label: t('supplierPage.summary.lowStock'),
              value: lowStockCount,
              tone: lowStockCount > 0 ? 'danger' : 'default',
            },
            {
              label: t('supplierPage.summary.available'),
              value: formatNumber(
                inventory.reduce(
                  (sum: number, item: any) => sum + parseFloat(item.available_qty || 0),
                  0
                ),
                { maximumFractionDigits: 1 }
              ),
              tone: 'mint',
            },
          ]}
        />

        {/* Main inventory table */}
        {!showWarehouseView && (
          <>
            {inventory.length === 0 ? (
              <EmptyState
                title={t('supplierPage.empty.title')}
                description={t('supplierPage.empty.description')}
                icon={<Package className="h-6 w-6" />}
              />
            ) : (
              <DataTableShell
                data-testid="inventory-table-shell"
                actions={
                  <span className="text-xs text-[var(--text-muted)]">
                    {t('supplierPage.table.productCount', { count: inventory.length })}
                  </span>
                }
              >
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--app-border)' }}>
                      <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {t('supplierPage.table.product')}
                      </th>
                      <th className="hidden py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] md:table-cell">
                        {t('supplierPage.table.warehouse')}
                      </th>
                      <th className="hidden py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] sm:table-cell">
                        {t('supplierPage.table.onHand')}
                      </th>
                      <th className="hidden py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] md:table-cell">
                        {t('supplierPage.table.reserved')}
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {t('supplierPage.table.available')}
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {t('supplierPage.table.status')}
                      </th>
                      <th className="py-3 px-4 text-center text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {t('supplierPage.table.actions')}
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
                        <td className="hidden py-3 px-4 md:table-cell">
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
                        <td className="hidden py-3 px-4 text-right sm:table-cell">
                          <span className="text-sm font-medium text-[var(--text)]">
                            {formatNumber(
                              parseFloat(String(item.available_qty || 0)) +
                                parseFloat(String(item.reserved_qty || 0)),
                              { maximumFractionDigits: 2 }
                            )}
                          </span>
                        </td>
                        <td className="hidden py-3 px-4 text-right md:table-cell">
                          <span className="text-sm" style={{ color: 'var(--amber)' }}>
                            {item.reserved_qty || 0}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm font-medium" style={{ color: 'var(--mint)' }}>
                            {item.available_qty || 0}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">{renderInventoryStatus(item)}</td>
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
                              {t('supplierPage.table.adjust')}
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
              </DataTableShell>
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
                title={t('supplierPage.warehouseView.emptyTitle')}
                description={t('supplierPage.warehouseView.emptyDescription')}
                icon={<Warehouse className="h-6 w-6" />}
                action={
                  <Button variant="outline" onClick={() => setShowWarehouseView(false)}>
                    {t('supplierPage.warehouseView.returnToTable')}
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
                          {t('supplierPage.warehouseView.productCount', {
                            count: warehouse.product_count || 0,
                          })}{' '}
                          ·{' '}
                          {t('supplierPage.warehouseView.totalAvailable', {
                            count: warehouse.total_available_qty || 0,
                          })}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold" style={{ color: 'var(--mint)' }}>
                          {t('supplierPage.warehouseView.availableLabel', {
                            count: warehouse.total_available_qty || 0,
                          })}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--amber)' }}>
                          {t('supplierPage.warehouseView.reservedLabel', {
                            count: warehouse.total_reserved_qty || 0,
                          })}
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
                                {t('supplierPage.table.product')}
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                                {t('supplierPage.table.onHand')}
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                                {t('supplierPage.table.reserved')}
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                                {t('supplierPage.table.available')}
                              </th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-[var(--text-muted)]">
                                {t('supplierPage.table.status')}
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
                                  {renderInventoryStatus(item)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                        {t('supplierPage.warehouseView.noInventory')}
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
              <DialogTitle>{t('supplierPage.adjustDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('supplierPage.adjustDialog.description', {
                  product: selectedProduct?.product_name,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('supplierPage.adjustDialog.type')}</label>
                <Select
                  value={adjustmentForm.adjustmentType}
                  onValueChange={(value) =>
                    setAdjustmentForm((f) => ({
                      ...f,
                      adjustmentType: value as 'IN' | 'OUT',
                    }))
                  }
                >
                  <SelectTrigger>
                    {adjustmentTypes.map((adjType) => (
                      <option key={adjType.value} value={adjType.value}>
                        {adjType.label}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('supplierPage.adjustDialog.quantity')}
                </label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={t('supplierPage.adjustDialog.quantityPlaceholder')}
                  value={adjustmentForm.quantity}
                  onChange={(e) => setAdjustmentForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('supplierPage.adjustDialog.reason')}
                </label>
                <Input
                  placeholder={t('supplierPage.adjustDialog.reasonPlaceholder')}
                  value={adjustmentForm.reason}
                  onChange={(e) => setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('supplierPage.adjustDialog.notes')}
                </label>
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
                {t('supplierPage.adjustDialog.cancel')}
              </Button>
              <Button onClick={handleAdjustment} disabled={isAdjusting}>
                {isAdjusting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('supplierPage.adjustDialog.record')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Inventory Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>{t('supplierPage.settingsDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('supplierPage.settingsDialog.description', {
                  product: selectedProduct?.product_name,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('supplierPage.settingsDialog.moq')}
                  </label>
                  <Input type="number" placeholder="1" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('supplierPage.settingsDialog.orderMultiple')}
                  </label>
                  <Input type="number" placeholder="1" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('supplierPage.settingsDialog.leadTime')}
                  </label>
                  <Input type="number" placeholder="2" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('supplierPage.settingsDialog.lowStockThreshold')}
                  </label>
                  <Input type="number" placeholder="20" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm font-medium">
                    {t('supplierPage.settingsDialog.backordersAllowed')}
                  </span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSettings(false)}>
                {t('supplierPage.settingsDialog.cancel')}
              </Button>
              <Button
                onClick={() => {
                  toast.success(t('supplierPage.toasts.settingsSaved'))
                  setShowSettings(false)
                }}
              >
                {t('supplierPage.settingsDialog.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </RequirePermission>
  )
}
