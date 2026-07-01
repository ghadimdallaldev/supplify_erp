import { api } from '../base'
import type {
  CreateRecipeRequest,
  Recipe,
  RecipeCostingDashboard,
  RecipeListResponse,
  RecipePriceImpactGroup,
} from '../../../types/recipes'

export type RecipeListParams = {
  search?: string
  category?: string
  branchId?: string
  active?: string
  missingCost?: string
  aboveTarget?: string
  onTarget?: string
  recentlyImpacted?: string
  productId?: string
  limit?: number
  offset?: number
}

export const recipesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRecipes: builder.query<RecipeListResponse, RecipeListParams | void>({
      query: (params) => ({ url: '/api/recipes', params: params || {} }),
      providesTags: (result) =>
        result?.recipes
          ? [
              ...result.recipes.map((r) => ({ type: 'Recipe' as const, id: r.id })),
              { type: 'Recipe', id: 'LIST' },
            ]
          : [{ type: 'Recipe', id: 'LIST' }],
    }),
    getRecipe: builder.query<{ recipe: Recipe }, string>({
      query: (id) => `/api/recipes/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Recipe', id }],
    }),
    createRecipe: builder.mutation<{ recipe: Recipe }, CreateRecipeRequest>({
      query: (body) => ({ url: '/api/recipes', method: 'POST', body }),
      invalidatesTags: [{ type: 'Recipe', id: 'LIST' }, 'RecipeCosting'],
    }),
    updateRecipe: builder.mutation<
      { recipe: Recipe },
      { id: string; body: Partial<CreateRecipeRequest> }
    >({
      query: ({ id, body }) => ({ url: `/api/recipes/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Recipe', id },
        { type: 'Recipe', id: 'LIST' },
        'RecipeCosting',
      ],
    }),
    deactivateRecipe: builder.mutation<{ id: string; isActive: boolean }, string>({
      query: (id) => ({ url: `/api/recipes/${id}/deactivate`, method: 'POST' }),
      invalidatesTags: [{ type: 'Recipe', id: 'LIST' }, 'RecipeCosting'],
    }),
    duplicateRecipe: builder.mutation<{ recipe: Recipe }, string>({
      query: (id) => ({ url: `/api/recipes/${id}/duplicate`, method: 'POST' }),
      invalidatesTags: [{ type: 'Recipe', id: 'LIST' }, 'RecipeCosting'],
    }),
    recalculateRecipe: builder.mutation<{ recipe: Recipe }, string>({
      query: (id) => ({ url: `/api/recipes/${id}/recalculate`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Recipe', id }, 'RecipeCosting', 'RecipeImpact'],
    }),
    getRecipeCostBreakdown: builder.query<{ breakdown: Record<string, unknown> }, string>({
      query: (id) => `/api/recipes/${id}/cost-breakdown`,
      providesTags: (_r, _e, id) => [{ type: 'Recipe', id: `cost-${id}` }],
    }),
    getRecipeCostingDashboard: builder.query<{ dashboard: RecipeCostingDashboard }, void>({
      query: () => '/api/recipe-costing/dashboard',
      providesTags: ['RecipeCosting'],
    }),
    getRecipeAlerts: builder.query<{ alerts: Array<Record<string, unknown>> }, void>({
      query: () => '/api/recipe-costing/alerts',
      providesTags: ['RecipeCosting'],
    }),
    getRecipePriceImpacts: builder.query<
      { impacts: RecipePriceImpactGroup[]; total: number },
      { limit?: number; offset?: number } | void
    >({
      query: (params) => ({ url: '/api/recipe-costing/price-impacts', params: params || {} }),
      providesTags: ['RecipeImpact'],
    }),
    recalculateImpactedRecipes: builder.mutation<
      { recalculated: number },
      { priceEventId: string }
    >({
      query: (body) => ({
        url: '/api/recipe-costing/recalculate-impacted',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Recipe', 'RecipeCosting', 'RecipeImpact'],
    }),
  }),
})

export const {
  useGetRecipesQuery,
  useGetRecipeQuery,
  useCreateRecipeMutation,
  useUpdateRecipeMutation,
  useDeactivateRecipeMutation,
  useDuplicateRecipeMutation,
  useRecalculateRecipeMutation,
  useGetRecipeCostBreakdownQuery,
  useGetRecipeCostingDashboardQuery,
  useGetRecipeAlertsQuery,
  useGetRecipePriceImpactsQuery,
  useRecalculateImpactedRecipesMutation,
} = recipesApi
