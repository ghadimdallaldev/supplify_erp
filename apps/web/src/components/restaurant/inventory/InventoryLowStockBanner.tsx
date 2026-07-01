import { AlertTriangle, ArrowDown, ShoppingCart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { cn } from '../../../lib/utils'

type InventoryLowStockBannerProps = {
  lowStockCount: number
  outOfStockCount: number
  onViewLowStock: () => void
  onScrollToItems: () => void
  onReorder?: () => void
  className?: string
}

export function InventoryLowStockBanner({
  lowStockCount,
  outOfStockCount,
  onViewLowStock,
  onScrollToItems,
  onReorder,
  className,
}: InventoryLowStockBannerProps) {
  const { t } = useTranslation('inventory')

  if (lowStockCount === 0 && outOfStockCount === 0) return null

  const urgent = outOfStockCount > 0

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        urgent
          ? 'border-[var(--red)]/30 bg-[var(--red-pale)]/50'
          : 'border-[var(--amber-mid)]/30 bg-[var(--amber-pale)]/40',
        className
      )}
      role="status"
      data-testid="inventory-low-stock-banner"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            urgent ? 'bg-[var(--red-pale)]' : 'bg-[var(--amber-pale)]'
          )}
        >
          <AlertTriangle
            className={cn('h-5 w-5', urgent ? 'text-[var(--red)]' : 'text-[var(--amber-mid)]')}
            aria-hidden
          />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-[var(--text)]">{t('alerts.attentionTitle')}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {urgent
              ? t('alerts.attentionOutOfStock', { out: outOfStockCount, low: lowStockCount })
              : t('alerts.attentionLowStock', { count: lowStockCount })}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onViewLowStock}>
          {t('alerts.viewLowStock')}
        </Button>
        {onReorder ? (
          <Button type="button" variant="outline" size="sm" onClick={onReorder}>
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            {t('alerts.reorderAssist')}
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={onScrollToItems}>
          <ArrowDown className="mr-1.5 h-4 w-4" />
          {t('alerts.viewItems')}
        </Button>
      </div>
    </div>
  )
}
