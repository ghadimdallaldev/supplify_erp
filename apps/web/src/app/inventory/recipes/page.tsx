'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChefHat, Play, DollarSign } from 'lucide-react';

/**
 * Inventory Recipes Page
 * Manage recipes/BOMs with auto-depletion
 */
export default function InventoryRecipesPage() {
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const queryClient = useQueryClient();

  const { data: recipes, isLoading } = useQuery({
    queryKey: ['inventory', 'recipes'],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetRecipes($restaurantId: String!) {
              recipes(restaurantId: $restaurantId) {
                id name yieldQty yieldUom estimatedCost costPerYield
                components {
                  item { name }
                  qtyBase uomBase wastePct
                }
              }
            }
          `,
          variables: { restaurantId: 'rest-001' },
        }),
      });

      const result = await response.json();
      return result.data?.recipes || [];
    },
  });

  const produceMutation = useMutation({
    mutationFn: async (data: { recipeId: string; quantity: number; locationId: string }) => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation ProduceRecipe($input: ProduceRecipeInput!) {
              postRecipeProduction(input: $input) {
                productionId yieldProduced estimatedCost
              }
            }
          `,
          variables: {
            input: {
              ...data,
              causedBy: 'user-123',
            },
          },
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Recipes & BOMs</h1>
            <p className="text-gray-600 mt-2">Manage recipes with auto-depletion</p>
          </div>
          <button
            onClick={() => setShowCreateDrawer(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create Recipe
          </button>
        </div>

        <div className="grid gap-6">
          {recipes?.map((recipe: any) => (
            <div key={recipe.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-100 rounded-full p-3">
                    <ChefHat className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{recipe.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Yields: {recipe.yieldQty} {recipe.yieldUom}
                    </p>
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-medium text-gray-700">Components:</p>
                      {recipe.components?.map((comp: any, idx: number) => (
                        <p key={idx} className="text-sm text-gray-600 pl-4">
                          • {comp.item.name}: {comp.qtyBase} {comp.uomBase}
                          {comp.wastePct > 0 && <span className="text-orange-600"> (+{comp.wastePct}% waste)</span>}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="mb-4">
                    <div className="text-sm text-gray-600">Estimated Cost</div>
                    <div className="text-2xl font-bold text-gray-900">
                      ${recipe.estimatedCost?.toFixed(2) || '0.00'}
                    </div>
                    <div className="text-xs text-gray-500">
                      ${recipe.costPerYield?.toFixed(2) || '0.00'} per {recipe.yieldUom}
                    </div>
                  </div>
                  <button
                    onClick={() => produceMutation.mutate({
                      recipeId: recipe.id,
                      quantity: 1,
                      locationId: 'loc-kitchen',
                    })}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Produce
                  </button>
                </div>
              </div>
            </div>
          ))}

          {recipes?.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <ChefHat className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Recipes Yet</h3>
              <p className="text-gray-600">Create recipes to auto-deplete ingredients</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

