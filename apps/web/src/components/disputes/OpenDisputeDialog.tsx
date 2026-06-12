import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { Textarea } from '../ui/textarea'
import { useCreateDisputeMutation, useGetOrderQuery } from '../../services/api'
import {
  disputeEligibilityMessage,
  isOrderEligibleForDispute,
} from '../../lib/orderDisputeEligibility'
import {
  buildDisputeItemsPayload,
  orderItemsToDisputeDrafts,
  type DisputeLineItemDraft,
} from '../../lib/disputeHelpers'
import { getQuantityUnitRules, normalizeReceivedQuantity } from '../../lib/quantityUnit'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

const DISPUTE_TYPES = [
  'short_delivery',
  'damaged_goods',
  'wrong_items',
  'quality_issue',
  'billing_error',
  'other',
] as const

type OpenDisputeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  defaultSupplierId?: string
  receivingReportId?: string
  initialLineItems?: DisputeLineItemDraft[]
  onCreated?: () => void
}

export function OpenDisputeDialog({
  open,
  onOpenChange,
  orderId,
  defaultSupplierId = '',
  receivingReportId,
  initialLineItems,
  onCreated,
}: OpenDisputeDialogProps) {
  const [, setSearchParams] = useSearchParams()
  const { data: orderData, isLoading: loadingOrder } = useGetOrderQuery(orderId, {
    skip: !orderId || !open,
  })
  const [createDispute, { isLoading: creating }] = useCreateDisputeMutation()

  const [supplierId, setSupplierId] = useState(defaultSupplierId)
  const [type, setType] = useState<(typeof DISPUTE_TYPES)[number]>('short_delivery')
  const [description, setDescription] = useState('')
  const [lineItems, setLineItems] = useState<DisputeLineItemDraft[]>([])

  const order = orderData?.order
  const orderStatus = order?.status

  const supplierOptions = useMemo(() => {
    const items = order?.items ?? []
    const map = new Map<string, string>()
    for (const item of items) {
      const sid = item.supplier_id
      if (sid) map.set(sid, item.supplier_name || `Supplier ${sid.slice(0, 8)}`)
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [order?.items])

  useEffect(() => {
    if (!open) return
    setSupplierId(defaultSupplierId)
    setType('short_delivery')
    setDescription('')
  }, [open, defaultSupplierId, orderId])

  useEffect(() => {
    if (!open || !order?.items?.length) return
    if (initialLineItems?.length) {
      setLineItems(initialLineItems)
      return
    }
    setLineItems(orderItemsToDisputeDrafts(order.items as Array<Record<string, unknown>>))
  }, [open, order?.items, initialLineItems])

  useEffect(() => {
    if (!open || supplierId || !supplierOptions.length) return
    if (supplierOptions.length === 1) setSupplierId(supplierOptions[0].id)
  }, [open, supplierId, supplierOptions])

  const includedCount = lineItems.filter((i) => i.included).length
  const ineligible = Boolean(orderStatus) && !isOrderEligibleForDispute(orderStatus)

  const handleSubmit = async () => {
    if (!supplierId) {
      toast.error('Supplier is required')
      return
    }
    if (!description.trim()) {
      toast.error('Description is required')
      return
    }
    if (ineligible) {
      toast.error(disputeEligibilityMessage(orderStatus))
      return
    }
    const items = buildDisputeItemsPayload(lineItems)
    if (lineItems.length > 0 && items.length === 0) {
      toast.error(
        'Select at least one line item to dispute, or describe the issue in the description'
      )
      return
    }

    try {
      await createDispute({
        orderId,
        supplierId,
        type,
        description: description.trim(),
        receivingReportId: receivingReportId || undefined,
        items: items.length ? items : undefined,
      }).unwrap()
      toast.success('Dispute opened - the supplier has been notified')
      onOpenChange(false)
      setSearchParams({})
      onCreated?.()
    } catch (e: unknown) {
      const err = e as { data?: { message?: string; error?: { message?: string } } }
      toast.error(err?.data?.error?.message || err?.data?.message || 'Failed to create dispute')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Open dispute</DialogTitle>
          <DialogDescription>
            Report missing, damaged, or incorrect items. The supplier will see this under Disputes
            and on the order timeline. You can dispute part of an order (e.g. 1 of 3 lines).
          </DialogDescription>
        </DialogHeader>

        {loadingOrder ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {ineligible && (
              <p className="text-sm text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 px-3 py-2">
                {disputeEligibilityMessage(orderStatus)}
              </p>
            )}

            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <option value="">Select supplier</option>
                  {supplierOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>

            <div>
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as (typeof DISPUTE_TYPES)[number])}
              >
                <SelectTrigger>
                  {DISPUTE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>

            {lineItems.length > 0 && (
              <div>
                <Label>Line items (optional — select what is disputed)</Label>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {lineItems.map((item, index) => {
                    const unit =
                      item.unit ||
                      String(order?.items?.find((oi) => oi.id === item.orderItemId)?.unit ?? 'unit')
                    const qtyRules = getQuantityUnitRules(unit)
                    return (
                      <div
                        key={item.orderItemId}
                        className="flex flex-wrap items-start gap-2 text-sm border-b border-[var(--app-border)] pb-2 last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={item.included}
                          onChange={(e) => {
                            const next = [...lineItems]
                            next[index] = { ...item, included: e.target.checked }
                            setLineItems(next)
                          }}
                          className="mt-1"
                          aria-label={`Include ${item.productName} in dispute`}
                        />
                        <div className="flex-1 min-w-[140px]">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-[var(--text-muted)] text-xs">
                            Ordered: {item.quantityOrdered} {unit} · Received:{' '}
                            <Input
                              type="number"
                              className="inline-block w-20 h-7 text-xs mx-1"
                              step={qtyRules.step}
                              min={qtyRules.min}
                              max={item.quantityOrdered}
                              inputMode={qtyRules.allowDecimals ? 'decimal' : 'numeric'}
                              value={item.quantityReceived}
                              disabled={!item.included}
                              onChange={(e) => {
                                const parsed = parseFloat(e.target.value)
                                if (Number.isNaN(parsed)) return
                                const next = [...lineItems]
                                next[index] = {
                                  ...item,
                                  unit,
                                  quantityReceived: normalizeReceivedQuantity(
                                    parsed,
                                    item.quantityOrdered,
                                    unit
                                  ),
                                }
                                setLineItems(next)
                              }}
                            />
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {includedCount} line(s) selected for dispute
                </p>
              </div>
            )}

            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What went wrong? Include quantities and product names."
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={creating || ineligible || !supplierId}>
            {creating ? 'Submitting…' : 'Submit dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
