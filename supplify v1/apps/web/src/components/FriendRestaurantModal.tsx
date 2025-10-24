'use client';

import React, { useState, useEffect } from 'react';
import { Heart, Search, Plus, Star, Users, Filter, X, MapPin } from 'lucide-react';
import { ButtonAction } from './ButtonAction';

interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  location: string;
  rating: number;
  isFavorite: boolean;
  lastOrderDate?: string;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
}

interface FriendRestaurantModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string;
}

// Mock data for restaurants
const mockRestaurants: Restaurant[] = [
  {
    id: 'golden-fork',
    name: 'Golden Fork Restaurant',
    cuisine: 'Fine Dining',
    location: 'Downtown',
    rating: 4.9,
    isFavorite: true,
    lastOrderDate: '2024-01-15',
    totalOrders: 23,
    totalSpent: 8450,
    avgOrderValue: 367,
  },
  {
    id: 'bella-vista',
    name: 'Bella Vista Cafe',
    cuisine: 'Italian',
    location: 'Midtown',
    rating: 4.7,
    isFavorite: true,
    lastOrderDate: '2024-01-14',
    totalOrders: 18,
    totalSpent: 6200,
    avgOrderValue: 344,
  },
  {
    id: 'downtown-bistro',
    name: 'Downtown Bistro',
    cuisine: 'French',
    location: 'Downtown',
    rating: 4.6,
    isFavorite: false,
    lastOrderDate: '2024-01-10',
    totalOrders: 15,
    totalSpent: 5200,
    avgOrderValue: 347,
  },
  {
    id: 'spice-garden',
    name: 'Spice Garden',
    cuisine: 'Indian',
    location: 'East Side',
    rating: 4.5,
    isFavorite: false,
    lastOrderDate: '2024-01-08',
    totalOrders: 12,
    totalSpent: 3200,
    avgOrderValue: 267,
  },
  {
    id: 'ocean-view',
    name: 'Ocean View Seafood',
    cuisine: 'Seafood',
    location: 'Waterfront',
    rating: 4.8,
    isFavorite: false,
    lastOrderDate: '2024-01-05',
    totalOrders: 8,
    totalSpent: 2800,
    avgOrderValue: 350,
  },
];

export function FriendRestaurantModal({ isOpen, onClose, supplierId }: FriendRestaurantModalProps) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(mockRestaurants);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCuisine, setFilterCuisine] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isAddingRestaurant, setIsAddingRestaurant] = useState(false);

  const cuisines = ['All', ...Array.from(new Set(restaurants.map(r => r.cuisine)))];
  const locations = ['All', ...Array.from(new Set(restaurants.map(r => r.location)))];

  const filteredRestaurants = restaurants.filter(restaurant => {
    const matchesSearch = restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        restaurant.cuisine.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        restaurant.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCuisine = filterCuisine === 'All' || restaurant.cuisine === filterCuisine;
    const matchesLocation = filterLocation === 'All' || restaurant.location === filterLocation;
    const matchesFavorites = !showFavoritesOnly || restaurant.isFavorite;
    
    return matchesSearch && matchesCuisine && matchesLocation && matchesFavorites;
  });

  const favoriteRestaurants = restaurants.filter(r => r.isFavorite);
  const totalRevenue = favoriteRestaurants.reduce((sum, r) => sum + r.totalSpent, 0);
  const avgOrderValue = favoriteRestaurants.length > 0 
    ? favoriteRestaurants.reduce((sum, r) => sum + r.avgOrderValue, 0) / favoriteRestaurants.length 
    : 0;

  const toggleFavorite = async (restaurantId: string) => {
    try {
      // In a real implementation, this would call an API
      setRestaurants(prev => prev.map(restaurant => 
        restaurant.id === restaurantId 
          ? { ...restaurant, isFavorite: !restaurant.isFavorite }
          : restaurant
      ));
      
      console.log(`Toggled favorite status for restaurant ${restaurantId}`);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const addNewRestaurant = async () => {
    setIsAddingRestaurant(true);
    try {
      // In a real implementation, this would open a search modal or API call
      console.log('Adding new restaurant...');
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Failed to add restaurant:', error);
    } finally {
      setIsAddingRestaurant(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Manage Restaurants</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Total Restaurants</p>
                  <p className="text-2xl font-bold text-blue-600">{restaurants.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Heart className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">Favorites</p>
                  <p className="text-2xl font-bold text-green-600">{favoriteRestaurants.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Star className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-purple-900">Total Revenue</p>
                  <p className="text-2xl font-bold text-purple-600">${totalRevenue.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-sm font-medium text-orange-900">Avg Order Value</p>
                  <p className="text-2xl font-bold text-orange-600">${avgOrderValue.toFixed(0)}</p>
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
                placeholder="Search restaurants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <select
                value={filterCuisine}
                onChange={(e) => setFilterCuisine(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {cuisines.map(cuisine => (
                  <option key={cuisine} value={cuisine}>{cuisine}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <select
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {locations.map(location => (
                  <option key={location} value={location}>{location}</option>
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
          {/* Add New Restaurant */}
          <div className="mb-6">
            <ButtonAction
              onClick={addNewRestaurant}
              loading={isAddingRestaurant}
              successMessage="Restaurant added successfully!"
              errorMessage="Failed to add restaurant. Please try again."
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Restaurant</span>
            </ButtonAction>
          </div>

          {/* Restaurants List */}
          <div className="space-y-4">
            {filteredRestaurants.map(restaurant => (
              <div key={restaurant.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-semibold text-gray-900">{restaurant.name}</h4>
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <span className="text-sm text-gray-600">{restaurant.rating}</span>
                      </div>
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                        {restaurant.cuisine}
                      </span>
                      <div className="flex items-center space-x-1 text-gray-500">
                        <MapPin className="h-3 w-3" />
                        <span className="text-xs">{restaurant.location}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Orders:</span> {restaurant.totalOrders}
                      </div>
                      <div>
                        <span className="font-medium">Total Spent:</span> ${restaurant.totalSpent.toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Avg Order:</span> ${restaurant.avgOrderValue}
                      </div>
                      <div>
                        <span className="font-medium">Last Order:</span> {restaurant.lastOrderDate || 'Never'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleFavorite(restaurant.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        restaurant.isFavorite 
                          ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                          : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-red-600'
                      }`}
                      title={restaurant.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart className={`h-5 w-5 ${restaurant.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredRestaurants.length === 0 && (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">No restaurants found</p>
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
