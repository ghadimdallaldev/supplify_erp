'use client';

import { useAuth } from '@/hooks/use-auth';
import { useQuery } from 'react-query';
import { apiClient } from '@/lib/api';
import { Package, ShoppingCart, TrendingUp, Users } from 'lucide-react';

export function Dashboard() {
  const { user, logout } = useAuth();

  const { data: flags } = useQuery('flags', () => apiClient.get('/flags'));
  const { data: orders } = useQuery('orders', () => apiClient.get('/orders'));
  const { data: inventory } = useQuery('inventory', () => apiClient.get('/inventory/summary'));
  const { data: loyalty } = useQuery('loyalty', () => apiClient.get('/loyalty/summary'));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Supplify</h1>
              <p className="text-gray-600">Welcome back, {user?.user?.name || 'User'}</p>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Dashboard Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ShoppingCart className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Active Orders
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {orders?.data?.length || 0}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <TrendingUp className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Monthly Spend
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        $0.00
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Low Stock Items
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {inventory?.data?.filter((item: any) => item.availableStock < 10)?.length || 0}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Loyalty Points
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {loyalty?.data?.availablePoints || 0}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Recent Activity
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Your latest orders and inventory updates.
              </p>
            </div>
            <div className="border-t border-gray-200">
              <div className="px-4 py-5 sm:px-6">
                <p className="text-gray-500">No recent activity to display.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
