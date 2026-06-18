import { ShoppingCart } from 'lucide-react'
import { Button } from '../ui/button'
import { formatPrice } from '../../utils/format'

type FloatingCartBarProps = {
  cartCount: number
  cartTotal: number
  onOpenCart: () => void
  onCheckout: () => void
  checkoutDisabled?: boolean
}

export function FloatingCartBar({
  cartCount,
  cartTotal,
  onOpenCart,
  onCheckout,
  checkoutDisabled = false,
}: FloatingCartBarProps) {
  if (!cartCount) return null

  return (
    <div className="consumer-cart-bar fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 bg-[var(--surface)] p-3 shadow-[0_-8px_24px_rgba(30,11,58,0.12)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <button
          type="button"
          className="consumer-pressable min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left"
          onClick={onOpenCart}
        >
          <p className="text-base font-semibold tabular-nums text-[var(--brand-mid)]">
            {formatPrice(cartTotal)}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            {cartCount} item{cartCount === 1 ? '' : 's'} · View cart
          </p>
        </button>
        <Button
          onClick={onCheckout}
          disabled={checkoutDisabled}
          className="consumer-pressable shrink-0 bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          Checkout
        </Button>
      </div>
    </div>
  )
}

export default FloatingCartBar
