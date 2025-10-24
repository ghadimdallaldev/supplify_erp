'use client';

import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { OrderUpdateProvider } from '../../../components/OrderUpdateProvider';
import { useState } from 'react';
import { useOrderStore } from '../../../hooks/useOrderStore';

export default function SupplierOrders() {
  return (
    <ProtectedRoute requiredRole="supplier" roleName="Supplier">
      <OrderUpdateProvider>
        <SupplierOrdersContent />
      </OrderUpdateProvider>
    </ProtectedRoute>
  );
}

function SupplierOrdersContent() {
  const { getSupplierOrders, updateOrderStatus: updateOrder } = useOrderStore();
  const orders = getSupplierOrders('fresh-foods'); // In a real app, this would come from auth context

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    // Update order status in shared store
    updateOrder(orderId, newStatus as any);
    
    // If order is being marked as delivered, update inventory
    if (newStatus === 'Delivered') {
      try {
        const order = orders.find(o => o.id === orderId);
        if (order && order.orderItems) {
          // Call inventory API to process the delivered order
          const inventoryRequest = {
            orderId: order.id,
            restaurantId: 'golden-fork', // In a real app, this would come from the order
            supplierId: 'fresh-foods', // In a real app, this would come from auth context
            items: order.orderItems.map(item => ({
              productId: `prod-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
              productName: item.name,
              quantity: item.quantity,
              unitPrice: item.price,
            })),
          };

          const response = await fetch('/api/inventory/process-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inventoryRequest),
          });

          if (response.ok) {
            const result = await response.json();
            console.log('Inventory updated:', result);
          } else {
            console.error('Failed to update inventory:', await response.text());
          }
        }
      } catch (error) {
        console.error('Error updating inventory:', error);
      }
    }
    
    // Show notification to restaurant
    const order = orders.find(o => o.id === orderId);
    if (order) {
      let notificationMessage = '';
      switch (newStatus) {
        case 'Processing':
          notificationMessage = `Order ${orderId} has been acknowledged and is being prepared`;
          break;
        case 'Dispatched':
          notificationMessage = `Order ${orderId} has been dispatched and is on its way`;
          break;
        case 'Delivered':
          notificationMessage = `Order ${orderId} has been delivered successfully and added to inventory`;
          break;
      }
      
      if (notificationMessage) {
        alert(`Notification sent to restaurant: ${notificationMessage}`);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Processing': return 'bg-blue-100 text-blue-800';
      case 'Dispatched': return 'bg-green-100 text-green-800';
      case 'Delivered': return 'bg-gray-100 text-gray-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
        <p className="text-gray-600 mt-2">Process and fulfill orders from restaurants</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Orders</p>
              <p className="text-2xl font-bold text-gray-900">{orders.filter(o => o.status === 'Pending').length}</p>
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
              <p className="text-sm font-medium text-gray-600">Processing</p>
              <p className="text-2xl font-bold text-gray-900">{orders.filter(o => o.status === 'Processing').length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Dispatched</p>
              <p className="text-2xl font-bold text-gray-900">{orders.filter(o => o.status === 'Dispatched').length}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">${orders.reduce((sum, o) => sum + o.total, 0).toFixed(0)}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search orders..."
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option>All Status</option>
              <option>Pending</option>
              <option>Processing</option>
              <option>Dispatched</option>
              <option>Delivered</option>
            </select>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Restaurant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.restaurant}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${(order.total || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => {
                          const modal = document.getElementById(`order-${order.id}`);
                          if (modal) modal.style.display = 'block';
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </button>
                      {order.status === 'Pending' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id, 'Processing')}
                          className="text-green-600 hover:text-green-900"
                          data-testid={`btn-process-${order.id}`}
                        >
                          Process
                        </button>
                      )}
                      {order.status === 'Processing' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id, 'Dispatched')}
                          className="text-blue-600 hover:text-blue-900"
                          data-testid={`btn-ship-${order.id}`}
                        >
                          Ship
                        </button>
                      )}
                      {order.status === 'Dispatched' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id, 'Delivered')}
                          className="text-purple-600 hover:text-purple-900"
                          data-testid={`btn-deliver-${order.id}`}
                        >
                          Deliver
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modals */}
      {orders.map((order) => (
        <div key={order.id} id={`order-${order.id}`} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{display: 'none'}}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Order Details - {order.id}</h3>
              <button 
                onClick={() => {
                  const modal = document.getElementById(`order-${order.id}`);
                  if (modal) modal.style.display = 'none';
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Restaurant</label>
                  <p className="text-sm text-gray-900">{order.restaurant}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Order Date</label>
                  <p className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Amount</label>
                  <p className="text-sm text-gray-900">${(order.total || 0).toFixed(2)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Order Items</label>
                <div className="bg-gray-50 rounded-lg p-4">
                  {order.orderItems.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">${item.price} each</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">Qty: {item.quantity}</p>
                        <p className="text-sm font-medium text-gray-900">${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => {
                    const modal = document.getElementById(`order-${order.id}`);
                    if (modal) modal.style.display = 'none';
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                {order.status === 'Pending' && (
                  <button
                    onClick={() => {
                      updateOrderStatus(order.id, 'Processing');
                      const modal = document.getElementById(`order-${order.id}`);
                      if (modal) modal.style.display = 'none';
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Process Order
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
