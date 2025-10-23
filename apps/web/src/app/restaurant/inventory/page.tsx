'use client';

import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { useState, useEffect } from 'react';
import { useInventory, fetchRecentActivity } from '../../../hooks/useInventory';
import { Package, AlertTriangle, TrendingUp, DollarSign, RefreshCw, Plus, Minus, Clock, Upload, FileText } from 'lucide-react';
import { BulkUploadModal } from '../../../components/BulkUploadModal';
import { ManualEntryModal } from '../../../components/ManualEntryModal';

export default function RestaurantInventory() {
  return (
    <ProtectedRoute requiredRole="restaurant" roleName="Restaurant">
      <RestaurantInventoryContent />
    </ProtectedRoute>
  );
}

function RestaurantInventoryContent() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [recentActivity, setRecentActivity] = useState([]);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const { inventory, isLoading, error, createMovement, isCreatingMovement } = useInventory('golden-fork');

  // Fetch recent activity
  useEffect(() => {
    const loadRecentActivity = async () => {
      try {
        const activity = await fetchRecentActivity('golden-fork', 5);
        setRecentActivity(activity);
      } catch (error) {
        console.error('Failed to load recent activity:', error);
      }
    };

    loadRecentActivity();
  }, []);

  const categories = ['All', ...Array.from(new Set(inventory.items.map(item => item.category).filter(Boolean)))];

  const filteredItems = selectedCategory === 'All' 
    ? inventory.items 
    : inventory.items.filter(item => item.category === selectedCategory);

  const handleAdjustStock = async (itemId: string, adjustment: number, reason: string) => {
    try {
      await createMovement({
        itemId,
        locationId: 'main-storage', // Default location ID
        restaurantId: 'golden-fork',
        adjustment,
        reason,
        userId: 'current-user', // In a real app, this would be the actual user ID
      });
      
      // Refresh recent activity after adjustment
      const activity = await fetchRecentActivity('golden-fork', 5);
      setRecentActivity(activity);
      
      alert(`Stock adjusted by ${adjustment > 0 ? '+' : ''}${adjustment} units`);
    } catch (error) {
      console.error('Failed to adjust stock:', error);
      alert('Failed to adjust stock. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading inventory...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <h3 className="text-red-800 font-medium">Error Loading Inventory</h3>
          </div>
          <p className="text-red-700 mt-2">Failed to load inventory data. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Restaurant Inventory</h1>
            <p className="text-gray-600 mt-2">Manage your inventory and track stock levels</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowManualEntryModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add Item</span>
            </button>
            <button
              onClick={() => setShowBulkUploadModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span>Bulk Upload</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">{inventory.totalItems}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">${inventory.totalValue.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-yellow-600">
                {inventory.items.filter(item => item.qtyOnHand < 10).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Out of Stock</p>
              <p className="text-2xl font-bold text-red-600">
                {inventory.items.filter(item => item.qtyOnHand === 0).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Inventory Items</h3>
          <div className="flex gap-3">
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search items..."
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty On Hand</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => (
                <tr key={item.id} className={item.qtyOnHand < 10 ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        {item.qtyOnHand < 10 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Low Stock
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.sku}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.category || 'General'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.qtyOnHand}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.qtyAvailable}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${item.unitCost.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${item.totalValue.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.location}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleAdjustStock(item.id, 1, 'Manual adjustment')}
                        disabled={isCreatingMovement}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                        title="Add 1 unit"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleAdjustStock(item.id, -1, 'Manual adjustment')}
                        disabled={isCreatingMovement}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        title="Remove 1 unit"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredItems.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No items found</p>
              <p className="text-sm text-gray-400">Items will appear here when orders are delivered</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 bg-white rounded-lg border shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Inventory Activity</h3>
        <div className="space-y-3">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity: any, index: number) => (
              <div key={activity.id || index} className={`flex items-center justify-between p-3 rounded-lg ${
                activity.movementType === 'RECEIPT' ? 'bg-green-50' : 
                activity.movementType === 'ISSUE' ? 'bg-red-50' : 
                'bg-blue-50'
              }`}>
                <div className="flex items-center">
                  {activity.movementType === 'RECEIPT' ? (
                    <TrendingUp className="h-5 w-5 text-green-600 mr-2" />
                  ) : activity.movementType === 'ISSUE' ? (
                    <Minus className="h-5 w-5 text-red-600 mr-2" />
                  ) : (
                    <Package className="h-5 w-5 text-blue-600 mr-2" />
                  )}
                  <span className={`text-sm ${
                    activity.movementType === 'RECEIPT' ? 'text-green-800' : 
                    activity.movementType === 'ISSUE' ? 'text-red-800' : 
                    'text-blue-800'
                  }`}>
                    {activity.itemName}: {activity.movementType === 'RECEIPT' ? '+' : ''}{activity.quantity} units
                    {activity.reason && ` (${activity.reason})`}
                  </span>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-gray-400 mr-1" />
                  <span className="text-xs text-gray-600">
                    {new Date(activity.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p>No recent activity</p>
              <p className="text-sm text-gray-400">Activity will appear here when orders are delivered</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <BulkUploadModal
        isOpen={showBulkUploadModal}
        onClose={() => setShowBulkUploadModal(false)}
        onUploadSuccess={(count) => {
          console.log(`Successfully uploaded ${count} items`);
          // Refresh inventory data
          window.location.reload();
        }}
        entityType="restaurant"
        entityId="golden-fork"
      />

      <ManualEntryModal
        isOpen={showManualEntryModal}
        onClose={() => setShowManualEntryModal(false)}
        onItemAdded={(item) => {
          console.log('Item added:', item);
          // Refresh inventory data
          window.location.reload();
        }}
        entityType="restaurant"
        entityId="golden-fork"
      />
    </div>
  );
}