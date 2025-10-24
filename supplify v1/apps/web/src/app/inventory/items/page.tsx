'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Filter, Package, Plus, Scan } from 'lucide-react';

export default function InventoryItems() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [storageFilter, setStorageFilter] = useState('ALL');

  useEffect(() => {
    loadItems();
  }, [searchTerm, storageFilter]);

  const loadItems = async () => {
    try {
      // TODO: Replace with actual GraphQL query
      // Mock data
      setItems([
        {
          id: '1',
          name: 'All-Purpose Flour',
          sku: 'FLOUR-001',
          barcode: '1234567890123',
          storageType: 'DRY',
          categoryId: 'cat-dry-goods',
          stockOnHand: [
            { locationId: 'loc-1', locationName: 'Dry Store', qtyOnHandBase: 65, avgCost: 2.55, totalValue: 165.75 }
          ],
          parConfigs: [
            { locationId: 'loc-1', minPar: 10, maxPar: 50, reorderPoint: 15 }
          ]
        },
        {
          id: '2',
          name: 'Fresh Chicken Breast',
          sku: 'CHICKEN-001',
          barcode: '2234567890125',
          storageType: 'CHILL',
          categoryId: 'cat-proteins',
          stockOnHand: [
            { locationId: 'loc-2', locationName: 'Kitchen', qtyOnHandBase: 10, avgCost: 6.65, totalValue: 66.50 }
          ],
          parConfigs: [
            { locationId: 'loc-2', minPar: 5, maxPar: 20, reorderPoint: 8 }
          ]
        },
        {
          id: '3',
          name: 'Fresh Whole Milk',
          sku: 'MILK-001',
          barcode: '2234567890123',
          storageType: 'CHILL',
          categoryId: 'cat-dairy',
          stockOnHand: [
            { locationId: 'loc-2', locationName: 'Kitchen', qtyOnHandBase: 20, avgCost: 1.50, totalValue: 30.00 }
          ],
          parConfigs: [
            { locationId: 'loc-2', minPar: 10, maxPar: 40, reorderPoint: 15 }
          ]
        },
      ]);
      setLoading(false);
    } catch (error) {
      console.error('Error loading items:', error);
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = !searchTerm || 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.barcode?.includes(searchTerm);
    
    const matchesStorage = storageFilter === 'ALL' || item.storageType === storageFilter;
    
    return matchesSearch && matchesStorage;
  });

  const getStorageBadgeColor = (type: string) => {
    switch (type) {
      case 'DRY': return 'bg-amber-100 text-amber-800';
      case 'CHILL': return 'bg-blue-100 text-blue-800';
      case 'FREEZE': return 'bg-cyan-100 text-cyan-800';
      case 'CHEMICAL': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStockStatus = (item: any) => {
    const soh = item.stockOnHand[0];
    const par = item.parConfigs[0];
    
    if (!soh || !par) return 'OK';
    
    if (soh.qtyOnHandBase <= par.minPar) return 'CRITICAL';
    if (soh.qtyOnHandBase <= par.reorderPoint) return 'LOW';
    return 'OK';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CRITICAL': return 'text-red-600';
      case 'LOW': return 'text-orange-600';
      default: return 'text-green-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading items...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inventory Items</h1>
            <p className="text-gray-600 mt-2">{filteredItems.length} items</p>
          </div>
          <div className="flex gap-3">
            <button className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-2 px-4 rounded-lg transition-colors flex items-center">
              <Scan className="h-5 w-5 mr-2" />
              Scan Item
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center">
              <Plus className="h-5 w-5 mr-2" />
              Add Item
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, SKU, or barcode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Storage Type Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={storageFilter}
                onChange={(e) => setStorageFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="ALL">All Storage Types</option>
                <option value="DRY">Dry</option>
                <option value="CHILL">Chill</option>
                <option value="FREEZE">Freeze</option>
                <option value="CHEMICAL">Chemical</option>
              </select>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Storage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  On Hand
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Cost
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const soh = item.stockOnHand[0];
                const status = getStockStatus(item);
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        <div className="text-sm text-gray-500">{item.sku}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStorageBadgeColor(item.storageType)}`}>
                        {item.storageType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {soh?.locationName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {soh ? soh.qtyOnHandBase.toFixed(2) : '0.00'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      ${soh?.avgCost?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                      ${soh?.totalValue?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-medium ${getStatusColor(status)}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <Link
                        href={`/inventory/items/${item.id}`}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No items found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

