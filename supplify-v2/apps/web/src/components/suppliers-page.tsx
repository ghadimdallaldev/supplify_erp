'use client';

import { useAuth } from '@/hooks/use-auth';
import { useQuery } from 'react-query';
import { apiClient } from '@/lib/api';
import { Building, Plus, Search, Star } from 'lucide-react';

export function SuppliersPage() {
  const { user } = useAuth();
  const { data: suppliers, isLoading } = useQuery('suppliers', () => apiClient.get('/suppliers'));

  const userRoles = user?.user?.roles || [];
  const canManage = userRoles.includes('admin') || userRoles.includes('manager');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Suppliers</h1>
              <p className="text-gray-600">Manage your supplier relationships</p>
            </div>
            {canManage && (
              <button className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center">
                <Plus className="h-4 w-4 mr-2" />
                Add Supplier
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Search and Filters */}
          <div className="mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Search suppliers..."
              />
            </div>
          </div>

          {/* Suppliers List */}
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Supplier Directory
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                View and manage your supplier relationships.
              </p>
            </div>
            <div className="border-t border-gray-200">
              {isLoading ? (
                <div className="px-4 py-5 sm:px-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Loading suppliers...</p>
                </div>
              ) : suppliers?.data && suppliers.data.length > 0 ? (
                <ul className="divide-y divide-gray-200">
                  {suppliers.data.map((supplier: any, index: number) => (
                    <li key={index}>
                      <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="flex-shrink-0">
                              <Building className="h-8 w-8 text-gray-400" />
                            </div>
                            <div className="ml-4">
                              <div className="flex items-center">
                                <p className="text-sm font-medium text-gray-900">
                                  {supplier.name || `Supplier ${index + 1}`}
                                </p>
                                {supplier.isFavorite && (
                                  <Star className="h-4 w-4 text-yellow-400 ml-2" />
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {supplier.email || 'No email provided'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {canManage && (
                              <button className="text-primary-600 hover:text-primary-900 text-sm font-medium">
                                Edit
                              </button>
                            )}
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              supplier.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {supplier.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-5 sm:px-6 text-center">
                  <Building className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No suppliers</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Get started by adding your first supplier.
                  </p>
                  {canManage && (
                    <div className="mt-6">
                      <button className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center mx-auto">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Supplier
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
