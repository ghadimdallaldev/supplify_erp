import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  useAdjustRestaurantInventoryMutation,
  useGetRestaurantWasteAnalyticsQuery,
} from '../../services/api'
import { formatCurrency, formatNumber } from '../../utils/format'
import toast from 'react-hot-toast'
import { AlertTriangle, Loader2, Recycle, TrendingDown } from 'lucide-react'

const WASTE_CATEGORIES = [
  { value: 'OVER_PRODUCTION', label: 'Over-production' },
  { value: 'SPOILAGE', label: 'Spoilage (prep)' },
  { value: 'BREAKAGE', label: 'Breakage / damage' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'OVERPORTIONING', label: 'Over-portioning' },
  { value: 'OTHER', label: 'Other' },
] as const

type InventoryItem = {
  product_id: string
  product_name: string
  product_sku?: string
  product_unit?: string
  quantity: number
  supplier_name?: string
  last_unit_cost?: number
  unit_cost?: number
}

type Props = {
  inventory: InventoryItem[]
  preselectedProductId?: string | null
  onPreselectConsumed?: () => void
}

export function RestaurantWastePanel({
  inventory,
  preselectedProductId,
  onPreselectConsumed,
}: Props) {
  const [period, setPeriod] = useState(30)
  const [showLogDialog, setShowLogDialog] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<'WASTAGE' | 'SPOILAGE'>('WASTAGE')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [wasteCategory, setWasteCategory] =
    useState<(typeof WASTE_CATEGORIES)[number]['value']>('OTHER')
  const [reason, setReason] = useState('')

  const { data, isLoading, isFetching, refetch } = useGetRestaurantWasteAnalyticsQuery({ period })
  const [adjustInventory, { isLoading: isSaving }] = useAdjustRestaurantInventoryMutation()

  const analytics = data?.analytics || []
  const summary = (data?.summary || {}) as Record<string, unknown>
  const trend = data?.trend || []

  const totalCost = Number(summary.total_waste_cost || 0)
  const totalQty = Number(summary.total_waste_qty || 0)
  const incidents = Number(summary.total_incidents || 0)
  const wastageQty = Number(summary.total_wastage_qty || 0)
  const spoilageQty = Number(summary.total_spoilage_qty || 0)

  const maxTrendCost = useMemo(
    () => Math.max(...trend.map((t) => Number(t.waste_cost || 0)), 1),
    [trend]
  )

  const openLogForProduct = (productId: string) => {
    setSelectedProductId(productId)
    const item = inventory.find((i) => i.product_id === productId)
    const hint = item?.last_unit_cost ?? item?.unit_cost
    setUnitCost(hint != null && Number(hint) > 0 ? String(hint) : '')
    setQuantity('')
    setReason('')
    setWasteCategory('OTHER')
    setAdjustmentType('WASTAGE')
    setShowLogDialog(true)
  }

  useEffect(() => {
    if (!preselectedProductId) return
    openLogForProduct(preselectedProductId)
    onPreselectConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when parent sets preselect once
  }, [preselectedProductId])

  const selectedItem = inventory.find((i) => i.product_id === selectedProductId)

  const handleLogWaste = async () => {
    if (!selectedProductId || !quantity) {
      toast.error('Select a product and quantity')
      return
    }
    const qty = parseFloat(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantity must be a positive number')
      return
    }
    const cost = unitCost.trim() ? parseFloat(unitCost) : undefined
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      toast.error('Unit cost must be zero or positive')
      return
    }
    if (selectedItem && qty > Number(selectedItem.quantity)) {
      toast.error(
        `Cannot log more than on hand (${selectedItem.quantity} ${selectedItem.product_unit || ''})`
      )
      return
    }

    try {
      await adjustInventory({
        productId: selectedProductId,
        adjustmentType,
        quantity: qty,
        reason: reason.trim() || undefined,
        unitCost: cost,
        wasteCategory,
      }).unwrap()
      toast.success('Waste logged and stock updated')
      setShowLogDialog(false)
      refetch()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to log waste'
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
            <Recycle className="h-5 w-5 text-[var(--amber-mid)]" />
            Waste & spoilage
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Log prep waste and spoilage with cost impact. Stock levels update automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div>
            <Label className="text-xs text-[var(--text-muted)]">Period</Label>
            <select
              className="mt-1 block h-9 rounded-md border px-3 text-sm"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          <Button className="mt-5" onClick={() => setShowLogDialog(true)}>
            Log waste
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--text-muted)]">Total waste cost</p>
            <p className="text-2xl font-bold text-[var(--red)]">{formatCurrency(totalCost)}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{formatNumber(totalQty)} units</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--text-muted)]">Incidents</p>
            <p className="text-2xl font-bold">{formatNumber(incidents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--text-muted)]">Prep wastage</p>
            <p className="text-2xl font-bold">{formatNumber(wastageQty)}</p>
            <p className="text-xs text-[var(--text-muted)]">WASTAGE type</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--text-muted)]">Spoilage</p>
            <p className="text-2xl font-bold">{formatNumber(spoilageQty)}</p>
            <p className="text-xs text-[var(--text-muted)]">SPOILAGE type</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">7-day cost trend</CardTitle>
          <CardDescription>Daily waste cost (most recent week)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          ) : trend.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">
              No waste logged yet. Use &quot;Log waste&quot; from a product row or here.
            </p>
          ) : (
            <div className="flex items-end gap-2 h-28">
              {trend.map((row) => {
                const cost = Number(row.waste_cost || 0)
                const height = Math.max(8, (cost / maxTrendCost) * 100)
                const dateLabel = row.date
                  ? new Date(String(row.date)).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : ''
                return (
                  <div key={String(row.date)} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-[var(--red)]/80 min-h-[8px] transition-all"
                      style={{ height: `${height}%` }}
                      title={`${dateLabel}: ${formatCurrency(cost)}`}
                    />
                    <span className="text-[10px] text-[var(--text-muted)] text-center leading-tight">
                      {dateLabel.split(',')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Top wasted products</CardTitle>
              <CardDescription>By cost in the selected period</CardDescription>
            </div>
            {isFetching && !isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <div className="text-center py-10 text-sm text-[var(--text-muted)]">
              <TrendingDown className="h-10 w-10 mx-auto mb-2 opacity-50" />
              No waste data for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="py-2 pr-4 font-medium">Product</th>
                    <th className="py-2 pr-4 font-medium">Supplier</th>
                    <th className="py-2 pr-4 font-medium">Qty</th>
                    <th className="py-2 pr-4 font-medium">Cost</th>
                    <th className="py-2 pr-4 font-medium">Incidents</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {analytics.map((row) => (
                    <tr key={String(row.product_id)} className="hover:bg-[var(--brand-ultra)]">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{String(row.product_name)}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {String(row.product_sku)}
                        </p>
                      </td>
                      <td className="py-3 pr-4">{String(row.supplier_name || '—')}</td>
                      <td className="py-3 pr-4">
                        {formatNumber(Number(row.total_waste_qty || 0))}{' '}
                        <span className="text-[var(--text-muted)]">
                          {String(row.product_unit || '')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-semibold text-[var(--red)]">
                        {formatCurrency(Number(row.total_waste_cost || 0))}
                      </td>
                      <td className="py-3 pr-4">
                        {formatNumber(Number(row.waste_incidents || 0))}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLogForProduct(String(row.product_id))}
                        >
                          Log again
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--amber-mid)]" />
              Log waste or spoilage
            </DialogTitle>
            <DialogDescription>
              Reduces on-hand stock and records cost for analytics and reports.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value)
                  const item = inventory.find((i) => i.product_id === e.target.value)
                  const hint = item?.last_unit_cost ?? item?.unit_cost
                  if (hint != null && Number(hint) > 0) setUnitCost(String(hint))
                }}
              >
                <option value="">Select product…</option>
                {inventory.map((item) => (
                  <option key={item.product_id} value={item.product_id}>
                    {item.product_name} ({item.quantity} {item.product_unit} on hand)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="w-full h-10 rounded-md border px-3 text-sm"
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as 'WASTAGE' | 'SPOILAGE')}
                >
                  <option value="WASTAGE">Prep wastage</option>
                  <option value="SPOILAGE">Spoilage (bad stock)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  className="w-full h-10 rounded-md border px-3 text-sm"
                  value={wasteCategory}
                  onChange={(e) =>
                    setWasteCategory(e.target.value as (typeof WASTE_CATEGORIES)[number]['value'])
                  }
                >
                  {WASTE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Optional"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                />
              </div>
            </div>

            {selectedItem && quantity && unitCost ? (
              <p className="text-xs text-[var(--text-muted)]">
                Estimated impact:{' '}
                <strong>
                  {formatCurrency(parseFloat(quantity) * parseFloat(unitCost || '0'))}
                </strong>
              </p>
            ) : null}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                placeholder="Shift, station, or cause…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogWaste} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save waste entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
