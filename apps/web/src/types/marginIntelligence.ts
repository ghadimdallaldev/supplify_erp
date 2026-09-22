/**
 * Food-cost and menu-margin warning contracts.
 *
 * Mirrors apps/api/src/services/restaurant-margin-intelligence.service.js.
 * Everything is nullable where the recipe cost engine could not compute a
 * value; the API omits rather than estimates, so the UI must render '—' rather
 * than substituting a default.
 */
import type { RecipeCalcStatus } from './recipes'

export interface FoodCostWarningAttribution {
  ingredientName: string | null
  costDiffPct: number | null
  oldFoodCostPct: number | null
  newFoodCostPct: number | null
  detectedAt: string
}

export interface FoodCostWarning {
  recipeId: string
  recipeName: string
  costPerPortion: number | null
  foodCostPct: number | null
  targetFoodCostPct: number | null
  overagePct: number | null
  grossMarginPct: number | null
  sellingPrice: number | null
  suggestedSellingPrice: number | null
  calcStatus: RecipeCalcStatus
  /** Null when no supplier price change touched this recipe. */
  lastIngredientChange: FoodCostWarningAttribution | null
}

/** Why the warning list may be short: recipes that cannot be judged at all. */
export interface FoodCostWarningCoverage {
  activeRecipes: number
  withoutTarget: number
  missingCostData: number
}

export interface FoodCostWarningResponse {
  minOveragePct: number
  warnings: FoodCostWarning[]
  coverage: FoodCostWarningCoverage
}

export interface WeakMarginMenuItem {
  recipeId: string
  recipeName: string
  category: string | null
  costPerPortion: number | null
  sellingPrice: number | null
  grossProfitPerPortion: number | null
  foodCostPct: number | null
  grossMarginPct: number | null
  targetFoodCostPct: number | null
  suggestedSellingPrice: number | null
  calcStatus: RecipeCalcStatus
}

export interface MenuProfitabilityResponse {
  maxMarginPct: number
  items: WeakMarginMenuItem[]
}
