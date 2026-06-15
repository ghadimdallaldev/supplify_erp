import { useState, useEffect } from 'react'
import { Star } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectTrigger } from '../ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  getQuantityUnitRules,
  normalizeReceivedQuantity,
  snapQuantityToUnit,
} from '../../lib/quantityUnit'

export function ReceivingDialog({
  order,
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  canReceive,
  canOpenDispute,
  onOpenDispute,
}: {
  order: { id: string; items: Array<Record<string, unknown>> }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (formData: Record<string, unknown>) => void
  isLoading: boolean
  canReceive: boolean
  canOpenDispute: boolean
  onOpenDispute: (formData: Record<string, unknown>) => void
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({
    deliveryNotes: '',
    qualityScore: 5,
    qualityNotes: '',
  })

  useEffect(() => {
    if (!open) return
    setFormData({
      deliveryNotes: '',
      qualityScore: 5,
      qualityNotes: '',
    })
  }, [open, order.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90dvh,100vh)] max-w-3xl overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle>Receive Order #{order.id.slice(0, 8)}</DialogTitle>
          <DialogDescription>
            Enter quantities and quality for each line. When you complete receiving, if any items
            had issues, one dispute form opens for the whole order (not per item).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Line items</p>
            <p className="mt-0.5 text-xs text-[var(--text-mid)]">
              Enter received quantities and quality for each product.
            </p>
            <div className="mt-3 divide-y divide-[var(--app-border)] overflow-hidden rounded-xl border border-[var(--app-border)]">
              {order.items.map((item: any) => {
                const unit = item.unit
                const ordered = Number(item.ordered_quantity ?? 0)
                const qtyRules = getQuantityUnitRules(unit)
                const receivedKey = `received_${item.id}`
                const receivedValue =
                  formData[receivedKey] !== undefined
                    ? Number(formData[receivedKey])
                    : snapQuantityToUnit(ordered, unit)

                return (
                  <div key={item.id} className="space-y-3 bg-[var(--surface)] p-4">
                    <div>
                      <p className="font-medium text-[var(--text)]">{item.product_name}</p>
                      <p className="text-xs text-[var(--text-mid)]">SKU: {item.sku}</p>
                      <p className="text-xs text-[var(--text-mid)]">
                        Ordered: {ordered} {unit}
                        {qtyRules.allowDecimals ? ` (step ${qtyRules.step})` : ' (whole units)'}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label
                          htmlFor={`received_${item.id}`}
                          className="text-xs font-medium text-[var(--text-mid)]"
                        >
                          Received qty
                        </Label>
                        <Input
                          id={`received_${item.id}`}
                          type="number"
                          step={qtyRules.step}
                          min={qtyRules.min}
                          max={ordered}
                          inputMode={qtyRules.allowDecimals ? 'decimal' : 'numeric'}
                          value={receivedValue}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value)
                            if (Number.isNaN(parsed)) return
                            setFormData({
                              ...formData,
                              [receivedKey]: normalizeReceivedQuantity(parsed, ordered, unit),
                            })
                          }}
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`quality_${item.id}`}
                          className="text-xs font-medium text-[var(--text-mid)]"
                        >
                          Quality status
                        </Label>
                        <Select
                          value={String(formData[`quality_${item.id}`] ?? 'ACCEPTED')}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              [`quality_${item.id}`]: value,
                            })
                          }
                        >
                          <SelectTrigger id={`quality_${item.id}`}>
                            <option value="ACCEPTED">Accepted</option>
                            <option value="DAMAGED">Damaged</option>
                            <option value="EXPIRED">Expired</option>
                            <option value="WRONG_ITEM">Wrong Item</option>
                            <option value="SHORT">Short</option>
                          </SelectTrigger>
                        </Select>
                      </div>
                      <div>
                        <Label
                          htmlFor={`notes_${item.id}`}
                          className="text-xs font-medium text-[var(--text-mid)]"
                        >
                          Notes (optional)
                        </Label>
                        <Input
                          id={`notes_${item.id}`}
                          onChange={(e) =>
                            setFormData({ ...formData, [`notes_${item.id}`]: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`expiry_${item.id}`}
                          className="text-xs font-medium text-[var(--text-mid)]"
                        >
                          Expiry date (optional)
                        </Label>
                        <Input
                          id={`expiry_${item.id}`}
                          type="date"
                          onChange={(e) =>
                            setFormData({ ...formData, [`expiry_${item.id}`]: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`batch_${item.id}`}
                          className="text-xs font-medium text-[var(--text-mid)]"
                        >
                          Batch / lot #
                        </Label>
                        <Input
                          id={`batch_${item.id}`}
                          onChange={(e) =>
                            setFormData({ ...formData, [`batch_${item.id}`]: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`storage_${item.id}`}
                          className="text-xs font-medium text-[var(--text-mid)]"
                        >
                          Storage location
                        </Label>
                        <Input
                          id={`storage_${item.id}`}
                          onChange={(e) =>
                            setFormData({ ...formData, [`storage_${item.id}`]: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/40 p-4 space-y-4">
            <div>
              <Label htmlFor="qualityScore" className="text-sm font-semibold text-[var(--text)]">
                Overall quality score
              </Label>
              <div className="flex items-center gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((score) => (
                  <Button
                    key={score}
                    type="button"
                    variant={formData.qualityScore === score ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, qualityScore: score })}
                  >
                    <Star
                      className={`h-4 w-4 ${formData.qualityScore === score ? 'fill-yellow-400' : ''}`}
                    />
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="qualityNotes" className="text-xs font-medium text-[var(--text-mid)]">
                Quality notes
              </Label>
              <Textarea
                id="qualityNotes"
                placeholder="Enter any quality observations..."
                onChange={(e) => setFormData({ ...formData, qualityNotes: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="deliveryNotes" className="text-xs font-medium text-[var(--text-mid)]">
                Delivery notes
              </Label>
              <Textarea
                id="deliveryNotes"
                placeholder="Enter delivery notes (truck number, driver, etc.)..."
                onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {canOpenDispute && (
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] w-full sm:w-auto"
                data-testid="receiving-open-dispute"
                onClick={() => onOpenDispute(formData)}
              >
                Open dispute
              </Button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => onSubmit(formData)}
              disabled={isLoading || !canReceive}
            >
              {isLoading ? 'Processing...' : 'Complete Receiving'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
