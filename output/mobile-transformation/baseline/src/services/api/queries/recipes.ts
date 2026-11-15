import { useQuery } from '@tanstack/react-query'
import type { RecipeAlert, RecipeCostingDashboard, RecipeListResponse } from '../../../types/recipes'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export type RecipeListParams = {
  search?: string
  category?: string
  branchId?: string
  active?: string
  missingCost?: string
  aboveTarget?: string
  onTarget?: string
  recentlyImpacted?: string
  limit?: number
  offset?: number
}

export function useRecipes(params?: RecipeListParams) {
  return useQuery({
    queryKey: queryKeys.recipes(params),
    queryFn: () => api.get<RecipeListResponse>(`/api/recipes${qs(params)}`),
  })
}

export function useRecipeCostingDashboard() {
  return useQuery({
    queryKey: queryKeys.recipeCostingDashboard,
    queryFn: async () => {
      const data = await api.get<{ dashboard: RecipeCostingDashboard }>('/api/recipe-costing/dashboard')
      return data.dashboard
    },
  })
}

export function useRecipeAlerts() {
  return useQuery({
    queryKey: queryKeys.recipeAlerts,
    queryFn: async () => {
      const data = await api.get<{ alerts: RecipeAlert[] }>('/api/recipe-costing/alerts')
      return data.alerts ?? []
    },
  })
}
