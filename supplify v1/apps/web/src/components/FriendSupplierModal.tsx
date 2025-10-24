'use client';

import React, { useState, useEffect } from 'react';
import { Heart, Search, Plus, Star, Users, Filter, X } from 'lucide-react';
import { ButtonAction } from './ButtonAction';

interface Supplier {
  id: string;
  name: string;
  category: string;
  rating: number;
  isFavorite: boolean;
  lastOrderDate?: string;
  totalOrders: number;
  totalSpent: number;
}

interface FriendSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
}

// Mock data for suppliers
const mockSuppliers: Supplier[] = [
  {
    id: 'fresh-foods',
    name: 'Fresh Foods Supply',
    category: 'General Grocery',
    rating: 4.8,
    isFavorite: true,
    lastOrderDate: '2024-01-15',
    totalOrders: 23,
    totalSpent: 8450,
  },
  {
    id: 'premium-meats',
    name: 'Premium Meats Co.',
    category: 'Meat & Poultry',
    rating: 4.9,
    isFavorite: true,
    lastOrderDate: '2024-01-14',
    totalOrders: 18,
    totalSpent: 6200,
  },
  {
    id: 'local-produce',
    name: 'Local Produce',
    category: 'Fresh Produce',
    rating: 4.7,
    isFavorite: false,
    lastOrderDate: '2024-01-10',
    totalOrders: 15,
    totalSpent: 3200,
  },
  {
    id: 'dairy-direct',
    name: 'Dairy Direct',
    category: 'Dairy Products',
    rating: 4.6,
    isFavorite: false,
    lastOrderDate: '2024-01-08',
    totalOrders: 12,
    totalSpent: 1800,
  },
  {
    id: 'spice-world',
    name: 'Spice World',
    category: 'Spices & Seasonings',
    rating: 4.5,
    isFavorite: false,
    lastOrderDate: '2024-01-05',
    totalOrders: 8,
    totalSpent: 950,
  },
];

export function FriendSupplierModal({ isOpen, onClose, restaurantId }: FriendSupplierModalProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(mockSuppliers);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);

  const categories = ['All', ...Array.from(new Set(suppliers.map(s => s.category)))];

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        supplier.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || supplier.category === filterCategory;
    const matchesFavorites = !showFavoritesOnly || supplier.isFavorite;
    
    return matchesSearch && matchesCategory && matchesFavorites;
  });

  const favoriteSuppliers = suppliers.filter(s => s.isFavorite);
  const totalSpent = favoriteSuppliers.reduce((sum, s) => sum + s.totalSpent, 0);

  const toggleFavorite = async (supplierId: string) => {
    try {
      // In a real implementation, this would call an API
      setSuppliers(prev => prev.map(supplier => 
        supplier.id === supplierId 
          ? { ...supplier, isFavorite: !supplier.isFavorite }
          : supplier
      ));
      
      console.log(`Toggled favorite status for supplier ${supplierId}`);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const addNewSupplier = async () => {
    setIsAddingSupplier(true);
    try {
      // In a real implementation, this would open a search modal or API call
      console.log('Adding new supplier...');
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Failed to add supplier:', error);
    } finally {
      setIsAddingSupplier(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Manage Suppliers</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Total Suppliers</p>
                  <p className="text-2xl font-bold text-blue-600">{suppliers.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Heart className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">Favorites</p>
                  <p className="text-2xl font-bold text-green-600">{favoriteSuppliers.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Star className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-purple-900">Total Spent</p>
                  <p className="text-2xl font-bold text-purple-600">${totalSpent.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                showFavoritesOnly 
                  ? 'bg-red-50 border-red-300 text-red-700' 
                  : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Heart className={`h-4 w-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {/* Add New Supplier */}
          <div className="mb-6">
            <ButtonAction
              onClick={addNewSupplier}
              loading={isAddingSupplier}
              successMessage="Supplier added successfully!"
              errorMessage="Failed to add supplier. Please try again."
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Supplier</span>
            </ButtonAction>
          </div>

          {/* Suppliers List */}
          <div className="space-y-4">
            {filteredSuppliers.map(supplier => (
              <div key={supplier.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-semibold text-gray-900">{supplier.name}</h4>
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <span className="text-sm text-gray-600">{supplier.rating}</span>
                      </div>
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                        {supplier.category}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Orders:</span> {supplier.totalOrders}
                      </div>
                      <div>
                        <span className="font-medium">Total Spent:</span> ${supplier.totalSpent.toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Last Order:</span> {supplier.lastOrderDate || 'Never'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleFavorite(supplier.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        supplier.isFavorite 
                          ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                          : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-red-600'
                      }`}
                      title={supplier.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart className={`h-5 w-5 ${supplier.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredSuppliers.length === 0 && (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">No suppliers found</p>
                <p className="text-sm text-gray-400">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-white">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
