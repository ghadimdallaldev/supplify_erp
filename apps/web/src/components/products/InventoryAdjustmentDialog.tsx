import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { formatNumber } from '../../utils/format'
import { useCreateInventoryAdjustmentMutation } from '../../services/api'

type InventoryAdjustmentDialogProps = {
  showInventoryAdjustment: boolean
  setShowInventoryAdjustment: (open: boolean) => void
  selectedProductForAdjustment: any
  setSelectedProductForAdjustment: (p: any) => void
  adjustmentType: 'ADD' | 'REMOVE'
  setAdjustmentType: (t: 'ADD' | 'REMOVE') => void
  adjustmentQuantity: string
  setAdjustmentQuantity: (v: string) => void
  adjustmentReason: string
  setAdjustmentReason: (v: string) => void
  adjustmentNotes: string
  setAdjustmentNotes: (v: string) => void
}

export function InventoryAdjustmentDialog({
  showInventoryAdjustment,
  setShowInventoryAdjustment,
  selectedProductForAdjustment,
  setSelectedProductForAdjustment,
  adjustmentType,
  setAdjustmentType,
  adjustmentQuantity,
  setAdjustmentQuantity,
  adjustmentReason,
  setAdjustmentReason,
  adjustmentNotes,
  setAdjustmentNotes,
}: InventoryAdjustmentDialogProps) {
  const { t } = useTranslation('products')
  const [createInventoryAdjustment, { isLoading: isAdjustingInventory }] =
    useCreateInventoryAdjustmentMutation()

  const reasonOptions = ['STOCK_TAKE', 'DAMAGE', 'RETURN', 'ADJUSTMENT', 'OTHER'] as const

  return (
    <Dialog open={showInventoryAdjustment} onOpenChange={setShowInventoryAdjustment}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('inventory.title')}</DialogTitle>
          <DialogDescription>
            {adjustmentType === 'ADD'
              ? t('inventory.descriptionAdd', { name: selectedProductForAdjustment?.name })
              : t('inventory.descriptionRemove', { name: selectedProductForAdjustment?.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('inventory.adjustmentType')}</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant={adjustmentType === 'ADD' ? 'default' : 'outline'}
                onClick={() => setAdjustmentType('ADD')}
                className="flex-1"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                {t('inventory.addStock')}
              </Button>
              <Button
                type="button"
                variant={adjustmentType === 'REMOVE' ? 'default' : 'outline'}
                onClick={() => setAdjustmentType('REMOVE')}
                className="flex-1"
              >
                <TrendingDown className="h-4 w-4 mr-2" />
                {t('inventory.removeStock')}
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="quantity">{t('inventory.quantity')}</Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              step="0.01"
              value={adjustmentQuantity}
              onChange={(e) => setAdjustmentQuantity(e.target.value)}
              placeholder={t('inventory.quantityPlaceholder')}
            />
          </div>

          <div>
            <Label htmlFor="reason">{t('inventory.reason')}</Label>
            <Select value={adjustmentReason} onValueChange={setAdjustmentReason}>
              <SelectTrigger id="reason">
                <option value="">{t('inventory.selectReason')}</option>
                {reasonOptions.map((reason) => (
                  <option key={reason} value={reason}>
                    {t(`inventory.reasons.${reason}`)}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">{t('inventory.notes')}</Label>
            <textarea
              id="notes"
              className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]"
              rows={3}
              value={adjustmentNotes}
              onChange={(e) => setAdjustmentNotes(e.target.value)}
              placeholder={t('inventory.notesPlaceholder')}
            />
          </div>

          {selectedProductForAdjustment && (
            <div className="bg-[var(--brand-ultra)] p-4 rounded-md">
              <p className="text-sm font-medium text-[var(--text-mid)]">
                {t('inventory.currentStock')}
              </p>
              <p className="text-lg font-semibold text-[var(--mint)]">
                {formatNumber(selectedProductForAdjustment.available_qty, {
                  maximumFractionDigits: 2,
                })}{' '}
                {selectedProductForAdjustment.unit || t('inventory.units')}
              </p>
              {adjustmentQuantity && (
                <p className="text-sm text-[var(--text-muted)] mt-2">
                  {t('inventory.newStock', {
                    qty: formatNumber(
                      parseFloat(String(selectedProductForAdjustment.available_qty || 0)) +
                        (adjustmentType === 'ADD' ? 1 : -1) * parseFloat(adjustmentQuantity),
                      { maximumFractionDigits: 2 }
                    ),
                    unit: selectedProductForAdjustment.unit || t('inventory.units'),
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowInventoryAdjustment(false)
              setSelectedProductForAdjustment(null)
              setAdjustmentQuantity('')
              setAdjustmentReason('')
              setAdjustmentNotes('')
            }}
          >
            {t('inventory.cancel')}
          </Button>
          <Button
            onClick={async () => {
              const qty = parseFloat(adjustmentQuantity)
              if (!qty || qty <= 0 || !adjustmentReason || !selectedProductForAdjustment?.id) return
              try {
                await createInventoryAdjustment({
                  productId: selectedProductForAdjustment.id,
                  adjustmentType: adjustmentType === 'ADD' ? 'IN' : 'OUT',
                  quantity: qty,
                  reason: adjustmentReason,
                  notes: adjustmentNotes || undefined,
                }).unwrap()
                toast.success(
                  adjustmentType === 'ADD' ? t('toast.stockAdded') : t('toast.stockRemoved')
                )
                setShowInventoryAdjustment(false)
                setSelectedProductForAdjustment(null)
                setAdjustmentQuantity('')
                setAdjustmentReason('')
                setAdjustmentNotes('')
              } catch (err: any) {
                toast.error(err?.data?.error?.message || t('toast.inventoryUpdateFailed'))
              }
            }}
            disabled={!adjustmentQuantity || !adjustmentReason || isAdjustingInventory}
          >
            {adjustmentType === 'ADD' ? t('inventory.addStock') : t('inventory.removeStock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
