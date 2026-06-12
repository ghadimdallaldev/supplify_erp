import { Plus, SlidersHorizontal } from 'lucide-react'
import { Button } from '../ui/button'
import { formatPrice } from '../../utils/format'
import type { ConsumerMenuItem } from '../../services/consumerApi'
import { cn } from '../../lib/utils'

type MenuItemCardProps = {
  item: ConsumerMenuItem
  onSelect: (item: ConsumerMenuItem) => void
  className?: string
}

export function MenuItemCard({ item, onSelect, className }: MenuItemCardProps) {
  const hasModifiers = (item.modifierGroups?.length ?? 0) > 0
  const imageUrl = item.image_url

  return (
    <div
      className={cn(
        'consumer-menu-item flex w-full gap-3 border-b border-[var(--app-border)] py-3.5 last:border-b-0',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 gap-3 text-left"
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
            <p className="font-medium leading-snug text-[var(--text)]">{item.name}</p>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text)]">
              {formatPrice(Number(item.base_price))}
            </span>
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {item.description}
            </p>
          )}
          {hasModifiers && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--text-mid)]">
              <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden />
              Customize
            </p>
          )}
        </div>
      </button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="consumer-pressable h-10 w-10 shrink-0 self-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)] hover:bg-[var(--brand-mid)] hover:text-white"
        onClick={() => onSelect(item)}
        aria-label={`Add ${item.name}`}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default MenuItemCard
