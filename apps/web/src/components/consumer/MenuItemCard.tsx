import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, SlidersHorizontal, Calendar } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatPrice } from '../../utils/format'
import type { ConsumerMenuItem, ConsumerOrderingMode } from '../../services/consumerApi'
import { MenuItemTagBadges } from './MenuItemTagBadges'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'

type MenuItemCardProps = {
  item: ConsumerMenuItem
  onSelect: (item: ConsumerMenuItem) => void
  orderingMode?: ConsumerOrderingMode
  disabled?: boolean
  className?: string
  featured?: boolean
}

export function MenuItemCard({
  item,
  onSelect,
  disabled = false,
  orderingMode = 'LIVE',
  className,
  featured = false,
}: MenuItemCardProps) {
  const { t } = useTranslation('consumer')
  const hasModifiers = (item.modifierGroups?.length ?? 0) > 0
  const imageUrl = item.image_url
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const soldOut = item.is_available === false
  const orderingClosed = orderingMode === 'CLOSED'
  const preorderOnly = orderingMode === 'PREORDER_ONLY'
  const addDisabled = disabled || soldOut || orderingClosed

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  return (
    <div
      className={cn(
        'consumer-menu-item flex w-full gap-3',
        featured
          ? 'h-full flex-col rounded-2xl border border-[var(--app-border)] bg-[var(--surface)] p-3'
          : 'border-b border-[var(--app-border)] py-3.5 last:border-b-0',
        soldOut && 'opacity-70',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        disabled={addDisabled}
        className={cn(
          'flex min-w-0 flex-1 gap-3 text-start disabled:cursor-not-allowed',
          featured && 'flex-col'
        )}
      >
        {imageUrl && failedImageUrl !== imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className={cn(
              'shrink-0 rounded-xl object-cover',
              featured ? 'h-32 w-full' : 'h-[72px] w-[72px]'
            )}
            loading="lazy"
            decoding="async"
            onError={() => setFailedImageUrl(imageUrl)}
          />
        ) : (
          <div
            aria-hidden
            className={cn(
              'flex shrink-0 items-center justify-center rounded-xl bg-[var(--brand-pale)] text-xl font-semibold text-[var(--brand-mid)]',
              featured ? 'h-32 w-full' : 'h-[72px] w-[72px]'
            )}
          >
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1 w-full">
          <div
            className={cn(
              'flex items-start',
              featured ? 'flex-col gap-1.5' : 'justify-between gap-3'
            )}
          >
            <div className="min-w-0">
              <p className="break-words font-medium leading-snug text-[var(--text)]">{item.name}</p>
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
          <MenuItemTagBadges allergens={item.allergens} dietaryTags={item.dietary_tags} />
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
          preorderOnly ? 'min-h-11 gap-1 px-3' : 'h-11 w-11'
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
