import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import type { MenuAllergen, MenuDietaryTag } from '../../lib/consumerMenuTags'

type MenuItemTagBadgesProps = {
  allergens?: string[] | null
  dietaryTags?: string[] | null
  className?: string
  size?: 'sm' | 'xs'
}

export function MenuItemTagBadges({
  allergens,
  dietaryTags,
  className,
  size = 'xs',
}: MenuItemTagBadgesProps) {
  const { t } = useTranslation('consumer')
  const allergenList = allergens ?? []
  const dietaryList = dietaryTags ?? []

  if (!allergenList.length && !dietaryList.length) return null

  const badgeClass =
    size === 'xs' ? 'text-[10px] px-1.5 py-0 font-normal' : 'text-xs px-2 py-0.5 font-normal'

  return (
    <div className={cn('mt-1.5 flex flex-wrap gap-1', className)}>
      {dietaryList.map((tag) => (
        <Badge
          key={`d-${tag}`}
          variant="secondary"
          className={cn(
            badgeClass,
            'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100'
          )}
        >
          {t(`menuTags.dietary.${tag as MenuDietaryTag}`, { defaultValue: tag })}
        </Badge>
      ))}
      {allergenList.map((tag) => (
        <Badge
          key={`a-${tag}`}
          variant="outline"
          className={cn(
            badgeClass,
            'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
          )}
        >
          {t(`menuTags.allergen.${tag as MenuAllergen}`, { defaultValue: tag })}
        </Badge>
      ))}
    </div>
  )
}

export default MenuItemTagBadges
