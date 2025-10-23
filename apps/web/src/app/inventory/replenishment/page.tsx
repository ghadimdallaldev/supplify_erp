'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShoppingCart, TrendingUp } from 'lucide-react';

/**
 * Inventory Replenishment Page
 * Shows items below par level with supplier recommendations
 */
export default function InventoryReplenishmentPage() {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['inventory', 'replenishment'],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetParSuggestions($restaurantId: String!) {
              parSuggestions(restaurantId: $restaurantId) {
                item { id name uomBase }
                location { name }
                qtyAvailable
                reorderPoint
                qtyToOrder
                supplierLinks {
                  supplierId supplierProductId vendorUom unitsPerVendorUom lastPrice
                }
              }
            }
          `,
          variables: { restaurantId: 'rest-001' },
        }),
      });

      const result = await response.json();
      return result.data?.parSuggestions || [];
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Replenishment</h1>
          <p className="text-gray-600 mt-2">Items below par level - ready to order</p>
        </div>

        {suggestions && suggestions.length > 0 ? (
          <div className="space-y-4">
            {suggestions.map((suggestion: any) => (
              <div key={suggestion.item.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="bg-orange-100 rounded-full p-3">
                      <AlertTriangle className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{suggestion.item.name}</h3>
                      <p className="text-sm text-gray-600">{suggestion.location.name}</p>
                      <div className="mt-2 text-sm">
                        <span className="text-gray-600">Available:</span>
                        <span className="ml-2 font-medium text-orange-600">
                          {suggestion.qtyAvailable.toFixed(2)} {suggestion.item.uomBase}
                        </span>
                        <span className="mx-2 text-gray-400">|</span>
                        <span className="text-gray-600">Reorder Point:</span>
                        <span className="ml-2 font-medium">{suggestion.reorderPoint.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-600 mb-1">Suggested Order</div>
                    <div className="text-2xl font-bold text-green-600">
                      {suggestion.qtyToOrder.toFixed(2)} {suggestion.item.uomBase}
                    </div>
                    {suggestion.supplierLinks && suggestion.supplierLinks.length > 0 && (
                      <div className="text-sm text-gray-600 mt-1">
                        ${suggestion.supplierLinks[0].lastPrice?.toFixed(2)} per unit
                      </div>
                    )}
                    <button className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Add to PO
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <TrendingUp className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">All Stocked Up!</h3>
            <p className="text-gray-600">No items are below their reorder point</p>
          </div>
        )}
      </div>
    </div>
  );
}

