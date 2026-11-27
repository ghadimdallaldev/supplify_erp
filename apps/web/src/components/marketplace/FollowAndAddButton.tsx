import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, UserPlus } from 'lucide-react'
import { Button, type ButtonProps } from '../ui/button'
import { useFollowSupplier } from '../../hooks/useFollowSupplier'
import type { Product } from '../../types'

type Props = Omit<ButtonProps, 'onClick' | 'children'> & {
  product: Product
  /** Receives the product marked as followed when the tap had to follow first. */
  onAdd: (product: Product) => void
  /** Label for a followed supplier (defaults to "Add to cart"). */
  label?: ReactNode
  /** Out of stock only applies once followed: non-followers never see quantities. */
  outOfStock?: boolean
  /** Extra classes for the text label (e.g. hide it in compact table rows). */
  labelClassName?: string
  iconClassName?: string
}

/** True when ordering this product needs a follow first (spec §10 Q1). */
export function needsFollowToOrder(product: Pick<Product, 'is_followed' | 'can_order'>) {
  return product.is_followed === false || product.can_order === false
}

/**
 * The one add-to-cart button for restaurant catalog surfaces. For a supplier the restaurant
 * does not follow, a single tap follows the supplier and then adds the item; at the plan cap
 * it opens the upgrade prompt instead, and a blocked supplier asks to unblock.
 */
export function FollowAndAddButton({
  product,
  onAdd,
  label,
  outOfStock = false,
  disabled,
  labelClassName,
  iconClassName = 'me-1 h-4 w-4 shrink-0',
  title,
  'aria-label': ariaLabel,
  ...buttonProps
}: Props) {
  const { t } = useTranslation('common')
  const { follow } = useFollowSupplier()
  const [busy, setBusy] = useState(false)
  const mustFollow = needsFollowToOrder(product)
  const text = mustFollow ? t('marketplace.followAndAdd') : (label ?? t('marketplace.addToCart'))

  const handleClick = async () => {
    if (!mustFollow) {
      onAdd(product)
      return
    }
    if (!product.supplier_id || busy) return
    setBusy(true)
    try {
      const outcome = await follow(product.supplier_id)
      if (outcome === 'followed') onAdd({ ...product, is_followed: true, can_order: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      {...buttonProps}
      onClick={handleClick}
      disabled={disabled || busy || (!mustFollow && outOfStock)}
      aria-label={typeof text === 'string' ? text : ariaLabel}
      title={typeof text === 'string' ? text : title}
      data-follow-required={mustFollow ? 'true' : undefined}
    >
      {mustFollow ? <UserPlus className={iconClassName} /> : <Plus className={iconClassName} />}
      <span className={labelClassName}>{text}</span>
    </Button>
  )
}
