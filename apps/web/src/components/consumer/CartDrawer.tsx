import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { formatPrice } from '../../utils/format'
import { cartLineTotal, formatModifierLabels, type CartLine } from '../../lib/consumerCart'

type CartDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  lines: CartLine[]
  total: number
  onUpdateQuantity: (cartKey: string, quantity: number) => void
  onRemoveLine: (cartKey: string) => void
  onCheckout: () => void
}

export function CartDrawer({
  open,
  onOpenChange,
  lines,
  total,
  onUpdateQuantity,
  onRemoveLine,
  onCheckout,
}: CartDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed inset-y-0 end-0 start-auto top-0 flex h-full max-h-none w-full max-w-md translate-x-0 translate-y-0 flex-col rounded-none border-s data-[state=closed]:translate-x-full data-[state=closed]:rtl:-translate-x-full data-[state=open]:translate-x-0 sm:rounded-none"
        aria-describedby="cart-drawer-description"
      >
        <DialogHeader className="text-start">
          <DialogTitle>Your cart</DialogTitle>
          <DialogDescription id="cart-drawer-description">
            Review items before checkout.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto py-2">
          {!lines.length && <p className="text-sm text-muted-foreground">Your cart is empty.</p>}
          {lines.map((line) => (
            <div
              key={line.cartKey}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{line.name}</p>
                {formatModifierLabels(line) && (
                  <p className="text-xs text-muted-foreground">{formatModifierLabels(line)}</p>
                )}
                {line.notes && <p className="text-xs text-muted-foreground">Note: {line.notes}</p>}
                <p className="mt-1 text-sm">{formatPrice(line.unitPrice)} each</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onUpdateQuantity(line.cartKey, line.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center text-sm">{line.quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onUpdateQuantity(line.cartKey, line.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm font-medium">{formatPrice(cartLineTotal(line))}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => onRemoveLine(line.cartKey)}
                >
                  <Trash2 className="me-1 h-3 w-3" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-medium">Subtotal</span>
            <span className="text-lg font-semibold">{formatPrice(total)}</span>
          </div>
          <Button type="button" className="w-full" disabled={!lines.length} onClick={onCheckout}>
            <ShoppingCart className="me-2 h-4 w-4" />
            Checkout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
