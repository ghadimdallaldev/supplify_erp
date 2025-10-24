'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, MapPin, Calendar, TrendingDown, FileText } from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: { id: string };
}

/**
 * Inventory Item Detail Page
 * Shows stock levels, batches, movements, and par config
 */
export default function InventoryItemDetailPage({ params }: Props) {
  const [tab, setTab] = useState<'overview' | 'batches' | 'movements' | 'par'>('overview');

  const { data: item, isLoading } = useQuery({
    queryKey: ['inventory', 'item', params.id],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetItem($id: ID!) {
              inventoryItem(id: $id) {
                id name sku barcode storageType uomBase
                stockOnHand {
                  locationId qtyOnHandBase qtyAvailableBase avgCost totalValue
                  location { name }
                }
                batches {
                  id qtyOnHandBase expiryDate lotCode lastUnitCost
                  location { name }
                }
              }
            }
          `,
          variables: { id: params.id },
        }),
      });

      const result = await response.json();
      return result.data?.inventoryItem;
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>;
  }

  if (!item) {
    return <div className="p-8">Item not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/inventory/items" className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block">
            ← Back to Items
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{item.name}</h1>
          <p className="text-gray-600 mt-1">SKU: {item.sku} | Barcode: {item.barcode || 'N/A'}</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b">
            <nav className="flex -mb-px">
              {[
                { key: 'overview', label: 'Overview', icon: Package },
                { key: 'batches', label: 'Batches', icon: Calendar },
                { key: 'movements', label: 'Movements', icon: TrendingDown },
                { key: 'par', label: 'Par Levels', icon: FileText },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key as any)}
                  className={`py-4 px-6 text-sm font-medium border-b-2 flex items-center gap-2 ${
                    tab === key
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {tab === 'overview' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock by Location</h3>
                <div className="grid gap-4">
                  {item.stockOnHand?.map((soh: any) => (
                    <div key={soh.locationId} className="bg-gray-50 rounded-lg p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 rounded-full p-3">
                            <MapPin className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{soh.location.name}</h4>
                            <p className="text-sm text-gray-600">Location ID: {soh.locationId}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">
                            {soh.qtyAvailableBase.toFixed(2)} {item.uomBase}
                          </div>
                          <div className="text-sm text-gray-600">
                            Value: ${soh.totalValue?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">On Hand:</span>
                          <span className="ml-2 font-medium">{soh.qtyOnHandBase.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Available:</span>
                          <span className="ml-2 font-medium">{soh.qtyAvailableBase.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Avg Cost:</span>
                          <span className="ml-2 font-medium">${soh.avgCost?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'batches' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">FEFO Batches</h3>
                <div className="space-y-3">
                  {item.batches?.map((batch: any) => (
                    <div key={batch.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            Lot: {batch.lotCode || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-600">{batch.location.name}</div>
                          {batch.expiryDate && (
                            <div className="text-sm text-orange-600 mt-1">
                              Expires: {new Date(batch.expiryDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900">
                            {batch.qtyOnHandBase.toFixed(2)} {item.uomBase}
                          </div>
                          <div className="text-sm text-gray-600">
                            ${batch.lastUnitCost.toFixed(2)} per unit
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'movements' && (
              <div className="text-center py-12">
                <TrendingDown className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">Movement history would appear here</p>
              </div>
            )}

            {tab === 'par' && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">Par level configuration would appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

