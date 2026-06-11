import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
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
import { formatPrice } from '../../utils/format'
import type { ConsumerMenuItem } from '../../services/consumerApi'
import type { AddCartLineInput } from '../../hooks/useConsumerCart'
import { cn } from '../../lib/utils'

type OrderSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ConsumerMenuItem | null
  onAdd: (input: AddCartLineInput) => void
}

function effectiveMin(group: NonNullable<ConsumerMenuItem['modifierGroups']>[number]) {
  return group.is_required ? Math.max(1, group.min_selections) : group.min_selections
}

export function OrderSheet({ open, onOpenChange, item, onAdd }: OrderSheetProps) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedByGroup({})
    setNotes('')
    setError(null)
  }, [open, item?.id])

  const modifierTotal = useMemo(() => {
    if (!item?.modifierGroups?.length) return 0
    let total = 0
    for (const group of item.modifierGroups) {
      const selected = selectedByGroup[group.id] ?? []
      for (const optionId of selected) {
        const option = group.options.find((o) => o.id === optionId)
        if (option) total += Number(option.price_delta)
      }
    }
    return total
  }, [item, selectedByGroup])

  const unitPrice = item ? Number(item.base_price) + modifierTotal : 0

  const toggleOption = (
    group: NonNullable<ConsumerMenuItem['modifierGroups']>[number],
    optionId: string
  ) => {
    setError(null)
    setSelectedByGroup((prev) => {
      const current = prev[group.id] ?? []
      const isSelected = current.includes(optionId)
      if (group.max_selections === 1) {
        return { ...prev, [group.id]: isSelected ? [] : [optionId] }
      }
      if (isSelected) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) }
      }
      if (current.length >= group.max_selections) {
        setError(`Choose at most ${group.max_selections} for ${group.name}`)
        return prev
      }
      return { ...prev, [group.id]: [...current, optionId] }
    })
  }

  const validate = (): string | null => {
    if (!item?.modifierGroups?.length) return null
    for (const group of item.modifierGroups) {
      const count = (selectedByGroup[group.id] ?? []).length
      const min = effectiveMin(group)
      if (count < min) {
        return min === 1
          ? `Please choose an option for ${group.name}`
          : `Choose at least ${min} for ${group.name}`
      }
      if (count > group.max_selections) {
        return `Choose at most ${group.max_selections} for ${group.name}`
      }
    }
    return null
  }

  const handleAdd = () => {
    if (!item) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    const modifierOptionIds = Object.values(selectedByGroup).flat()
    onAdd({
      menuItemId: item.id,
      name: item.name,
      unitPrice,
      modifierOptionIds,
      notes: notes.trim() || undefined,
    })
    onOpenChange(false)
  }

  if (!item) return null

  const hasModifiers = (item.modifierGroups?.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed inset-x-0 bottom-0 top-auto max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-xl data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:max-w-lg sm:left-1/2 sm:-translate-x-1/2"
        aria-describedby="order-sheet-description"
      >
        <DialogHeader className="text-left">
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription id="order-sheet-description">
            {item.description || 'Customize your order'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50dvh] space-y-4 overflow-y-auto py-1">
          {hasModifiers &&
            item.modifierGroups!.map((group) => {
              const selected = selectedByGroup[group.id] ?? []
              const min = effectiveMin(group)
              const hint =
                group.max_selections === 1
                  ? min > 0
                    ? 'Required · choose 1'
                    : 'Choose 1'
                  : min > 0
                    ? `Required · choose ${min}–${group.max_selections}`
                    : `Choose up to ${group.max_selections}`

              return (
                <div key={group.id} className="space-y-2">
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <div className="space-y-1">
                    {group.options.map((option) => {
                      const isSelected = selected.includes(option.id)
                      const priceDelta = Number(option.price_delta)
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleOption(group, option.id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition',
                            isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          )}
                        >
                          <span>{option.name}</span>
                          <span className="text-muted-foreground">
                            {priceDelta > 0 ? `+${formatPrice(priceDelta)}` : 'Included'}
                          </span>
                        </button>
                      )
                    })}
                    {!group.options.length && (
                      <p className="text-xs text-muted-foreground">No options available</p>
                    )}
                  </div>
                </div>
              )
            })}

          <div className="space-y-1">
            <Label htmlFor="lineNotes">Special instructions</Label>
            <Textarea
              id="lineNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Allergies, preferences…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex w-full items-center justify-between text-sm">
            <span>Item total</span>
            <span className="text-lg font-semibold">{formatPrice(unitPrice)}</span>
          </div>
          <Button type="button" className="w-full" onClick={handleAdd}>
            Add to cart · {formatPrice(unitPrice)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
