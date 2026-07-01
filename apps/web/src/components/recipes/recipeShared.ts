import type { Recipe, RecipeCalcStatus } from '../../types/recipes'

export type RecipeFilterKey = 'missingCost' | 'aboveTarget' | 'recentlyImpacted'

export function summaryCardClass(active: boolean) {
  return `cursor-pointer transition-all duration-200 ease hover:shadow-md hover:-translate-y-0.5 ${
    active ? 'ring-2 ring-[var(--brand-mid)] ring-offset-2 shadow-md' : ''
  }`
}

export function formatRecipeShare(count: number, total: number) {
  if (!total || total <= 0) return '0%'
  return `${Math.round((count / total) * 100)}%`
}

export function countByStatus(recipes: Recipe[], status: RecipeCalcStatus) {
  return recipes.filter((r) => r.calcStatus === status).length
}

export function getFoodCostFillPercent(
  foodCostPct: number | null | undefined,
  targetFoodCostPct: number | null | undefined
) {
  if (foodCostPct == null || !Number.isFinite(foodCostPct)) return 0
  const target = Number(targetFoodCostPct) || 30
  const cap = Math.max(target * 1.5, target, 1)
  return Math.min(100, Math.round((foodCostPct / cap) * 100))
}

export function isAboveTargetFoodCost(
  foodCostPct: number | null | undefined,
  targetFoodCostPct: number | null | undefined
) {
  if (foodCostPct == null || targetFoodCostPct == null) return false
  return foodCostPct > targetFoodCostPct
}

export function foodCostBarColor(
  foodCostPct: number | null | undefined,
  targetFoodCostPct: number | null | undefined,
  calcStatus?: RecipeCalcStatus
) {
  if (calcStatus === 'MISSING_DATA' || foodCostPct == null) return 'bg-[var(--red)]'
  if (calcStatus === 'WARNING' || isAboveTargetFoodCost(foodCostPct, targetFoodCostPct)) {
    return 'bg-[var(--amber)]'
  }
  return 'bg-[var(--mint)]'
}
