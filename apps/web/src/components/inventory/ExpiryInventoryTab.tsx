import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Skeleton } from '../ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import {
  useGetExpiryLotsQuery,
  useCreateExpiryLotMutation,
  useDeleteExpiryLotMutation,
} from '../../services/api'
import { toast } from 'sonner'
import { usePermissions } from '../../hooks/usePermissions'

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'safe', label: 'Safe' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
]

function statusBadge(status: string) {
  if (status === 'expired') return <Badge variant="destructive">Expired</Badge>
  if (status === 'expiring_soon')
    return <Badge className="bg-amber-100 text-amber-900">Expiring soon</Badge>
  return <Badge variant="secondary">Safe</Badge>
}

export function ExpiryInventoryTab() {
  const { t } = useTranslation('inventory')
  const { can } = usePermissions()
  const canManage = can('INVENTORY_MANAGE')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    itemName: '',
    expiryDate: '',
    quantity: '1',
    unit: 'unit',
    batchLotNumber: '',
    storageLocation: '',
    notes: '',
  })

  const queryParams = useMemo(
    () => ({
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      supplierId: supplierFilter === 'ALL' ? undefined : supplierFilter,
    }),
    [statusFilter, supplierFilter]
  )

  const { data, isLoading, refetch } = useGetExpiryLotsQuery(queryParams)
  const [createLot, { isLoading: creating }] = useCreateExpiryLotMutation()
  const [deleteLot] = useDeleteExpiryLotMutation()

  const lots = useMemo(() => data?.lots ?? [], [data?.lots])
  const suppliers = useMemo(() => {
    const map = new Map<string, string>()
    for (const lot of lots) {
      if (lot.supplierId && lot.supplierName) map.set(lot.supplierId, lot.supplierName)
    }
    return Array.from(map.entries())
  }, [lots])

  const handleCreate = async () => {
    if (!form.itemName.trim() || !form.expiryDate) {
      toast.error(t('toast.expiryItemAndDateRequired'))
      return
    }
    try {
      await createLot({
        itemName: form.itemName.trim(),
        expiryDate: form.expiryDate,
        quantity: parseFloat(form.quantity) || 1,
        unit: form.unit || 'unit',
        batchLotNumber: form.batchLotNumber || undefined,
        storageLocation: form.storageLocation || undefined,
        notes: form.notes || undefined,
      }).unwrap()
      toast.success(t('toast.expiryLotAdded'))
      setShowAdd(false)
      setForm({
        itemName: '',
        expiryDate: '',
        quantity: '1',
        unit: 'unit',
        batchLotNumber: '',
        storageLocation: '',
        notes: '',
      })
      refetch()
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('toast.expiryAddLotFailed'))
    }
  }

  const handleDelete = async (lotId: string) => {
    try {
      await deleteLot(lotId).unwrap()
      toast.success(t('toast.expiryLotRemoved'))
      refetch()
    } catch {
      toast.error(t('toast.expiryRemoveLotFailed'))
    }
  }

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />
  }

  return (
    <div className="space-y-4" data-testid="expiry-inventory-tab">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={statusFilter === opt.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="add-expiry-lot">
            Add expiry lot
          </Button>
        )}
      </div>

      {suppliers.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--text-muted)]">Supplier:</span>
          <Button
            size="sm"
            variant={supplierFilter === 'ALL' ? 'default' : 'outline'}
            onClick={() => setSupplierFilter('ALL')}
          >
            All
          </Button>
          {suppliers.map(([id, name]) => (
            <Button
              key={id}
              size="sm"
              variant={supplierFilter === id ? 'default' : 'outline'}
              onClick={() => setSupplierFilter(id)}
            >
              {name}
            </Button>
          ))}
        </div>
      )}

      {lots.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-8 text-center rounded-xl border border-dashed border-[var(--app-border)]">
          No tracked expiry lots yet. Add during receiving or manually above.
        </p>
      ) : (
        <div className="rounded-xl border border-[var(--app-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs text-[var(--text-muted)]">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Location</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {lots.map(
                (lot: {
                  id: string
                  itemName: string
                  productSku?: string
                  quantity: number
                  unit: string
                  expiryDate: string
                  storageLocation?: string
                  status: string
                  batchLotNumber?: string
                }) => (
                  <tr key={lot.id} className="border-t border-[var(--app-border)]">
                    <td className="p-3">
                      <div className="font-medium">{lot.itemName}</div>
                      {lot.productSku && (
                        <div className="text-xs text-[var(--text-muted)]">{lot.productSku}</div>
                      )}
                      {lot.batchLotNumber && (
                        <div className="text-xs text-[var(--text-muted)]">
                          Lot: {lot.batchLotNumber}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {lot.quantity} {lot.unit}
                    </td>
                    <td className="p-3">{new Date(lot.expiryDate).toLocaleDateString()}</td>
                    <td className="p-3">{lot.storageLocation || '—'}</td>
                    <td className="p-3">{statusBadge(lot.status)}</td>
                    <td className="p-3">
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => handleDelete(lot.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track expiry lot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Item name</Label>
              <Input
                value={form.itemName}
                onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Expiry date</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Batch / lot #</Label>
                <Input
                  value={form.batchLotNumber}
                  onChange={(e) => setForm((f) => ({ ...f, batchLotNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label>Storage location</Label>
                <Input
                  value={form.storageLocation}
                  onChange={(e) => setForm((f) => ({ ...f, storageLocation: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
