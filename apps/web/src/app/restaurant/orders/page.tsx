'use client';

import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { CreateOrderModal } from '../../../components/CreateOrderModal';
import { OrderUpdateProvider } from '../../../components/OrderUpdateProvider';
import { useState } from 'react';
import { useOrderStore } from '../../../hooks/useOrderStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gql } from '@apollo/client';
import { apolloClient } from '../../../lib/apollo-client';

const ORDERS_QUERY = gql`
  query GetOrders {
    orders
  }
`;

const DASHBOARD_KPIS_QUERY = gql`
  query GetDashboardKpis {
    restaurantDashboardKpis
  }
`;

export default function RestaurantOrders() {
  return (
    <ProtectedRoute requiredRole="restaurant" roleName="Restaurant">
      <OrderUpdateProvider>
        <RestaurantOrdersContent />
      </OrderUpdateProvider>
    </ProtectedRoute>
  );
}

function RestaurantOrdersContent() {
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('fresh-foods');
  // Removed local storage usage - only using database
  const queryClient = useQueryClient();
  
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const result = await apolloClient.query({
        query: ORDERS_QUERY,
      });
      return JSON.parse((result.data as any).orders);
    },
  });

  const { data: kpisData, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      const result = await apolloClient.query({
        query: DASHBOARD_KPIS_QUERY,
      });
      return JSON.parse((result.data as any).restaurantDashboardKpis);
    },
  });

  const orders = ordersData?.nodes || [];

  const handleOrderCreated = (newOrder: any) => {
    // Invalidate queries to refresh the data
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
    queryClient.invalidateQueries({ queryKey: ['recent-orders'] });
    // Close the modal
    setShowCreateOrder(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DELIVERED': return 'bg-green-100 text-green-800';
      case 'DISPATCHED': return 'bg-blue-100 text-blue-800';
      case 'PREPARING': return 'bg-orange-100 text-orange-800';
      case 'ACKNOWLEDGED': return 'bg-yellow-100 text-yellow-800';
      case 'PLACED': return 'bg-gray-100 text-gray-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Restaurant Orders</h1>
        <p className="text-gray-600 mt-2">Manage your orders and track deliveries</p>
        
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {kpisLoading ? '...' : kpisData?.activeOrders || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {ordersLoading ? '...' : orders.filter((o: any) => o.status === 'PLACED').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Transit</p>
              <p className="text-2xl font-bold text-gray-900">
                {ordersLoading ? '...' : orders.filter((o: any) => o.status === 'DISPATCHED').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Monthly Spend</p>
              <p className="text-2xl font-bold text-gray-900">
                {kpisLoading ? '...' : `$${(kpisData?.monthlySpend || 0).toFixed(0)}`}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
          <div className="flex gap-3">
            <div className="flex gap-2">
        <button 
          onClick={() => {
            setSelectedSupplier('fresh-foods');
            setShowCreateOrder(true);
          }}
          className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
          data-testid="btn-order-fresh-foods"
        >
          Order from Fresh Foods
        </button>
        <button 
          onClick={() => {
            setSelectedSupplier('premium-meats');
            setShowCreateOrder(true);
          }}
          className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm"
          data-testid="btn-order-premium-meats"
        >
          Order from Premium Meats
        </button>
        <button 
          onClick={() => {
            setSelectedSupplier('local-produce');
            setShowCreateOrder(true);
          }}
          className="bg-orange-600 text-white px-3 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm"
          data-testid="btn-order-local-produce"
        >
          Order from Local Produce
        </button>
            </div>
            <button 
              onClick={() => setShowCreateOrder(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              data-testid="btn-create-new-order"
            >
              Create New Order
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ordersLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                orders.map((order: any) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.supplierName || `Supplier ${order.supplierId}`}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.items?.length || 0} items</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${(Number(order.total) || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900 mr-3">View</button>
                      {order.status === 'PREPARING' && (
                        <button className="text-red-600 hover:text-red-900">Cancel</button>
                      )}
                      {order.status === 'DISPATCHED' && (
                        <button className="text-green-600 hover:text-green-900">Track</button>
                      )}
                      {order.status === 'DELIVERED' && (
                        <button className="text-gray-600 hover:text-gray-900">Invoice</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enhanced Create Order Modal */}
      <CreateOrderModal
        isOpen={showCreateOrder}
        onClose={() => setShowCreateOrder(false)}
        supplierId={selectedSupplier}
        onOrderCreated={handleOrderCreated}
      />
    </div>
  );
}
