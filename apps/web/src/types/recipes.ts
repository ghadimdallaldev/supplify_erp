export type RecipeCalcStatus = 'HEALTHY' | 'WARNING' | 'MISSING_DATA'

export type RecipeIngredientType = 'SUPPLIER_PRODUCT' | 'INVENTORY_ITEM' | 'MANUAL'

export type RecipeCostSource =
  | 'AUTO'
  | 'INVOICE'
  | 'LAST_RECEIVED'
  | 'CONTRACT'
  | 'CATALOG'
  | 'MANUAL'

export interface RecipeIngredient {
  id?: string
  recipeId?: string
  sortOrder?: number
  ingredientType: RecipeIngredientType
  productId?: string | null
  supplierId?: string | null
  displayName: string
  quantity: number
  recipeUnit: string
  purchaseUnit?: string | null
  conversionFactor?: number | null
  wastePct?: number
  yieldPct?: number
  costSource?: RecipeCostSource
  manualUnitPrice?: number | null
  notes?: string | null
}

export interface RecipeAlert {
  id: string
  alertType: string
  severity: 'info' | 'warning' | 'error'
  message: string
  metadata?: Record<string, unknown>
  createdAt?: string
}

export interface Recipe {
  id: string
  restaurantId: string
  name: string
  internalCode?: string | null
  category?: string | null
  sellingPrice?: number | null
  currency: string
  targetFoodCostPct?: number | null
  portionCount: number
  portionSize?: number | null
  yieldUnit?: string | null
  notes?: string | null
  instructions?: string | null
  imageFileKey?: string | null
  isActive: boolean
  costPerPortion?: number | null
  foodCostPct?: number | null
  grossProfit?: number | null
  grossMarginPct?: number | null
  suggestedSellingPrice?: number | null
  calcStatus: RecipeCalcStatus
  lastCalculatedAt?: string | null
  lastPriceImpactAt?: string | null
  branches?: string[]
  ingredients?: RecipeIngredient[]
  alerts?: RecipeAlert[]
  lastPriceImpact?: {
    changePct?: number | null
    costDiffPct?: number | null
    detectedAt?: string
    source?: string
  } | null
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
  recentPriceChanges: Array<{
    id: string
    productId: string
    productName?: string | null
    oldPrice: number | null
    newPrice: number
    changePct: number | null
    source: string
    detectedAt: string
    affectedRecipeCount: number
  }>
  mostImpactedRecipes: Array<{
    id: string
    name: string
    costDiffPct: number | null
    newFoodCostPct: number | null
    detectedAt: string
  }>
  salesDataConnected: boolean
}

export interface RecipePriceImpactGroup {
  event: {
    id: string
    productId: string
    productName?: string | null
    oldPrice: number | null
    newPrice: number
    changePct: number | null
    source: string
    detectedAt: string
  }
  impactedRecipes: Array<{
    recipeId: string
    recipeName: string
    oldCostPerPortion?: number | null
    newCostPerPortion?: number | null
    costDiffAmount?: number | null
    costDiffPct?: number | null
    oldFoodCostPct?: number | null
    newFoodCostPct?: number | null
    targetFoodCostPct?: number | null
    marginImpact?: number | null
    suggestedSellingPrice?: number | null
    status: RecipeCalcStatus
  }>
}

export interface CreateRecipeRequest {
  name: string
  internalCode?: string | null
  category?: string | null
  sellingPrice?: number | null
  currency?: string
  targetFoodCostPct?: number | null
  portionCount?: number
  portionSize?: number | null
  yieldUnit?: string | null
  notes?: string | null
  instructions?: string | null
  imageFileKey?: string | null
  isActive?: boolean
  branchIds?: string[]
  ingredients?: RecipeIngredient[]
}
