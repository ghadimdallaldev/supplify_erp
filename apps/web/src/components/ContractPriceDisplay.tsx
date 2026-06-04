import { Badge } from './ui/badge'
import { formatPrice } from '../utils/format'

type ContractPriceDisplayProps = {
  currentPrice?: number | null
  catalogPrice?: number | null
  pricingSource?: string | null
  currency?: string
  unit?: string
  compact?: boolean
}

export function ContractPriceDisplay({
  currentPrice,
  catalogPrice,
  pricingSource,
  currency = 'USD',
  unit,
  compact = false,
}: ContractPriceDisplayProps) {
  const isContract = pricingSource === 'CONTRACT_PRICE'
  const showStrikethrough =
    isContract &&
    catalogPrice != null &&
    currentPrice != null &&
    Number(catalogPrice) > Number(currentPrice)

  if (currentPrice == null) {
    return <p className="text-sm text-[var(--text-muted)]">N/A</p>
  }

  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      <div className="flex flex-wrap items-center gap-2">
        <p className={compact ? 'font-semibold' : 'text-3xl font-bold text-[var(--brand-mid)]'}>
          {formatPrice(currentPrice)}
        </p>
        {isContract && (
          <Badge variant="secondary" className="text-xs">
            Your price
          </Badge>
        )}
      </div>
      {showStrikethrough && (
        <p className="text-xs text-[var(--text-muted)] line-through">{formatPrice(catalogPrice)}</p>
      )}
      {!compact && unit && (
        <p className="text-sm text-[var(--text-muted)]">
          {currency} per {unit}
        </p>
      )}
      {compact && unit && <p className="text-xs text-[var(--text-muted)]">per {unit}</p>}
    </div>
  )
}
