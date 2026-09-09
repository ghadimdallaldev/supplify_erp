import { useTranslation } from 'react-i18next'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'
import { MENU_ALLERGENS, MENU_DIETARY_TAGS } from '../../lib/consumerMenuTags'

type MenuTagPickerProps = {
  allergens: string[]
  dietaryTags: string[]
  onAllergensChange: (next: string[]) => void
  onDietaryTagsChange: (next: string[]) => void
  disabled?: boolean
  className?: string
}

function toggleTag(list: string[], tag: string): string[] {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]
}

export function MenuTagPicker({
  allergens,
  dietaryTags,
  onAllergensChange,
  onDietaryTagsChange,
  disabled,
  className,
}: MenuTagPickerProps) {
  const { t } = useTranslation('consumer')

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1.5">
        <Label>{t('menuTags.allergensLabel')}</Label>
        <p className="text-xs text-muted-foreground">{t('menuTags.allergensHint')}</p>
        <div className="flex flex-wrap gap-1.5">
          {MENU_ALLERGENS.map((tag) => {
            const active = allergens.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                disabled={disabled}
                onClick={() => onAllergensChange(toggleTag(allergens, tag))}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
                  active
                    ? 'border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
                    : 'border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand-mid)]/40'
                )}
              >
                {t(`menuTags.allergen.${tag}`)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('menuTags.dietaryLabel')}</Label>
        <p className="text-xs text-muted-foreground">{t('menuTags.dietaryHint')}</p>
        <div className="flex flex-wrap gap-1.5">
          {MENU_DIETARY_TAGS.map((tag) => {
            const active = dietaryTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                disabled={disabled}
                onClick={() => onDietaryTagsChange(toggleTag(dietaryTags, tag))}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
                  active
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100'
                    : 'border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand-mid)]/40'
                )}
              >
                {t(`menuTags.dietary.${tag}`)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MenuTagPicker
