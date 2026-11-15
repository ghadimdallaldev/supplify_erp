export type RecipeCalcStatus = 'HEALTHY' | 'WARNING' | 'MISSING_DATA'

export interface RecipeAlert {
  id?: string
  alertType?: string
  severity?: 'info' | 'warning' | 'error'
  message?: string
  metadata?: Record<string, unknown>
  createdAt?: string
}

export interface Recipe {
  id: string
  restaurantId?: string
  name: string
  internalCode?: string | null
  category?: string | null
  sellingPrice?: number | null
  currency?: string
  targetFoodCostPct?: number | null
  portionCount?: number
  isActive: boolean
  costPerPortion?: number | null
  foodCostPct?: number | null
  grossMarginPct?: number | null
  calcStatus: RecipeCalcStatus
  lastCalculatedAt?: string | null
}

export interface RecipeListResponse {
  recipes: Recipe[]
  total: number
  limit: number
  offset: number
}

export interface RecipeCostingDashboard {
  stats: {
    activeRecipes: number
    aboveTargetFoodCost: number
    missingCostData: number
    recentlyImpacted: number
    averageFoodCostPct: number | null
  }
  highestCostRecipes: Array<{
    id: string
    name: string
    costPerPortion: number
    foodCostPct: number | null
    calcStatus: RecipeCalcStatus
  }>
  lowestMarginRecipes: Array<{
    id: string
    name: string
    grossMarginPct: number
    foodCostPct: number | null
    sellingPrice: number | null
    costPerPortion: number | null
  }>
  salesDataConnected: boolean
}

export function recipeCalcStatusLabel(status: RecipeCalcStatus | string): string {
  switch (status) {
    case 'HEALTHY':
      return 'On target'
    case 'WARNING':
      return 'Above target'
    case 'MISSING_DATA':
      return 'Missing cost'
    default:
      return String(status)
  }
}

export function recipeAlertMessage(alert: RecipeAlert): string {
  return alert.message ?? alert.alertType ?? 'Recipe alert'
}
