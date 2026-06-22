import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, SlidersHorizontal, Calendar } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatPrice } from '../../utils/format'
import type { ConsumerMenuItem, ConsumerOrderingMode } from '../../services/consumerApi'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'

type MenuItemCardProps = {
  item: ConsumerMenuItem
  onSelect: (item: ConsumerMenuItem) => void
  orderingMode?: ConsumerOrderingMode
  className?: string
}

export function MenuItemCard({
  item,
  onSelect,
  orderingMode = 'LIVE',
  className,
}: MenuItemCardProps) {
  const { t } = useTranslation('consumer')
  const hasModifiers = (item.modifierGroups?.length ?? 0) > 0
  const imageUrl = item.image_url
  const soldOut = item.is_available === false
  const orderingClosed = orderingMode === 'CLOSED'
  const preorderOnly = orderingMode === 'PREORDER_ONLY'
  const addDisabled = soldOut || orderingClosed

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  return (
    <div
      className={cn(
        'consumer-menu-item flex w-full gap-3 border-b border-[var(--app-border)] py-3.5 last:border-b-0',
        soldOut && 'opacity-70',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        disabled={addDisabled}
        className="flex min-w-0 flex-1 gap-3 text-start disabled:cursor-not-allowed"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl bg-[var(--brand-pale)] text-xl font-semibold text-[var(--brand-mid)]"
          >
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium leading-snug text-[var(--text)]">{item.name}</p>
              {soldOut ? (
                <Badge variant="secondary" className="mt-1 text-[10px] uppercase tracking-wide">
                  {t('menuItem.soldOut')}
                </Badge>
              ) : null}
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text)]">
              {formatPrice(Number(item.base_price))}
            </span>
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {item.description}
            </p>
          )}
          {hasModifiers && !soldOut && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--text-mid)]">
              <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden />
              {t('menuItem.customize')}
            </p>
          )}
        </div>
      </button>
      <Button
        type="button"
        size={preorderOnly ? 'sm' : 'icon'}
        variant="secondary"
        disabled={addDisabled}
        className={cn(
          'consumer-pressable shrink-0 self-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)] hover:bg-[var(--brand-mid)] hover:text-white disabled:opacity-50',
          preorderOnly ? 'h-10 gap-1 px-3' : 'h-10 w-10'
        )}
        onClick={() => onSelect(item)}
        aria-label={t('menuItem.addAria', { name: item.name })}
      >
        {preorderOnly ? (
          <>
            <Calendar className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-xs font-medium">{t('menuItem.preorder')}</span>
          </>
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

export default MenuItemCard
