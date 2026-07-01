import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { foodCostBarColor, getFoodCostFillPercent, isAboveTargetFoodCost } from './recipeShared'
import type { RecipeCalcStatus } from '../../types/recipes'

type FoodCostBarProps = {
  foodCostPct?: number | null
  targetFoodCostPct?: number | null
  calcStatus?: RecipeCalcStatus
  showLabels?: boolean
  className?: string
}

export const FoodCostBar = memo(function FoodCostBar({
  foodCostPct,
  targetFoodCostPct,
  calcStatus,
  showLabels = true,
  className,
}: FoodCostBarProps) {
  const { t } = useTranslation('recipes')
  const target = targetFoodCostPct ?? 30
  const fill = getFoodCostFillPercent(foodCostPct, target)
  const barColor = foodCostBarColor(foodCostPct, target, calcStatus)
  const above = isAboveTargetFoodCost(foodCostPct, target)

  return (
    <div className={cn('space-y-1', className)}>
      {showLabels ? (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span
            className={cn(
              'font-semibold tabular-nums',
              above ? 'text-[var(--amber)]' : 'text-[var(--text)]'
            )}
          >
            {foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'}
          </span>
          <span className="text-[var(--text-muted)] tabular-nums">
            {t('foodCostBar.target', { pct: target })}
          </span>
        </div>
      ) : null}
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-border)]"
        role="progressbar"
        aria-valuenow={fill}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          foodCostPct != null
            ? t('foodCostBar.ariaKnown', { pct: foodCostPct.toFixed(1) })
            : t('foodCostBar.ariaUnknown')
        }
      >
        <div
          className={cn('h-full rounded-full', barColor)}
          style={{ width: `${Math.max(fill, foodCostPct != null ? 4 : 0)}%` }}
        />
        {target > 0 ? (
          <div
            className="absolute top-0 h-full w-0.5 bg-[var(--text-muted)]/50"
            style={{ left: `${Math.min(100, (target / Math.max(target * 1.5, target)) * 100)}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  )
})
