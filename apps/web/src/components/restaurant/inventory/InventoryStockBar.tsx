import { memo } from 'react'
import { cn } from '../../../lib/utils'
import { getStockStatus } from './inventoryShared'

type InventoryStockBarProps = {
  quantity: number
  lowStockThreshold?: number | null
  unit?: string
  showLabels?: boolean
  className?: string
}

export function getStockFillPercent(quantity: number, lowStockThreshold?: number | null) {
  const qty = Number(quantity) || 0
  const threshold = Number(lowStockThreshold) || 0
  if (qty <= 0) return 0
  if (!threshold) return 100
  const target = Math.max(threshold * 2, threshold, 1)
  return Math.min(100, Math.round((qty / target) * 100))
}

export const InventoryStockBar = memo(function InventoryStockBar({
  quantity,
  lowStockThreshold,
  unit,
  showLabels = true,
  className,
}: InventoryStockBarProps) {
  const status = getStockStatus(quantity, lowStockThreshold ?? 0)
  const fill = getStockFillPercent(quantity, lowStockThreshold)
  const threshold = Number(lowStockThreshold) || 0

  const barColor =
    status === 'OUT_OF_STOCK'
      ? 'bg-[var(--red)]'
      : status === 'LOW_STOCK'
        ? 'bg-[var(--amber)]'
        : 'bg-[var(--mint)]'

  return (
    <div className={cn('space-y-1', className)}>
      {showLabels ? (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold tabular-nums text-[var(--text)]">
            {quantity}
            {unit ? (
              <span className="ml-0.5 font-medium text-[var(--text-muted)]">{unit}</span>
            ) : null}
          </span>
          {threshold > 0 ? (
            <span className="text-[var(--text-muted)] tabular-nums">
              min {threshold}
              {unit ? ` ${unit}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-border)]"
        role="progressbar"
        aria-valuenow={fill}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Stock level ${fill}%`}
      >
        <div
          className={cn('h-full rounded-full', barColor)}
          style={{ width: `${Math.max(fill, status === 'OUT_OF_STOCK' ? 0 : 4)}%` }}
        />
      </div>
    </div>
  )
})
