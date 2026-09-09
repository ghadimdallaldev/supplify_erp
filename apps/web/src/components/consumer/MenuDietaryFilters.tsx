import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { MENU_ALLERGENS, MENU_DIETARY_TAGS } from '../../lib/consumerMenuTags'

type MenuDietaryFiltersProps = {
  excludeAllergens: string[]
  requireDietary: string[]
  onExcludeAllergensChange: (next: string[]) => void
  onRequireDietaryChange: (next: string[]) => void
  className?: string
}

function toggleTag(list: string[], tag: string): string[] {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]
}

export function MenuDietaryFilters({
  excludeAllergens,
  requireDietary,
  onExcludeAllergensChange,
  onRequireDietaryChange,
  className,
}: MenuDietaryFiltersProps) {
  const { t } = useTranslation('consumer')
  const hasFilters = excludeAllergens.length > 0 || requireDietary.length > 0

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t('menu.filtersTitle')}
        </p>
        {hasFilters ? (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-[var(--brand-mid)] hover:underline"
            onClick={() => {
              onExcludeAllergensChange([])
              onRequireDietaryChange([])
            }}
          >
            <X className="h-3 w-3" aria-hidden />
            {t('menu.clearFilters')}
          </button>
        ) : null}
      </div>
      <div className="consumer-menu-scroll flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {MENU_DIETARY_TAGS.map((tag) => {
          const active = requireDietary.includes(tag)
          return (
            <button
              key={`d-${tag}`}
              type="button"
              onClick={() => onRequireDietaryChange(toggleTag(requireDietary, tag))}
              className={cn(
                'consumer-pressable shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100'
                  : 'border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)]'
              )}
              aria-pressed={active}
            >
              {t(`menuTags.dietary.${tag}`)}
            </button>
          )
        })}
        <span className="mx-1 w-px shrink-0 self-stretch bg-[var(--app-border)]" aria-hidden />
        {MENU_ALLERGENS.map((tag) => {
          const active = excludeAllergens.includes(tag)
          return (
            <button
              key={`a-${tag}`}
              type="button"
              onClick={() => onExcludeAllergensChange(toggleTag(excludeAllergens, tag))}
              className={cn(
                'consumer-pressable shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100'
                  : 'border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)]'
              )}
              aria-pressed={active}
              aria-label={t('menu.excludeAllergenAria', {
                allergen: t(`menuTags.allergen.${tag}`),
              })}
            >
              {t('menu.noTag', { tag: t(`menuTags.allergen.${tag}`) })}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default MenuDietaryFilters
