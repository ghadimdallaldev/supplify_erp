'use client';

import { useState } from 'react';
import { CreateOrderModal } from '../../components/CreateOrderModal';
import { OrderFlowTest } from '../../components/OrderFlowTest';
import { Star, ShoppingCart, Bell, CheckCircle, Truck, Package } from 'lucide-react';

export default function OrderSystemDemo() {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('fresh-foods');
  const [orders, setOrders] = useState([
    {
      id: 'ORD-001',
      supplier: 'Fresh Foods Supply',
      items: 5,
      total: 125.50,
      status: 'Pending',
      date: '2024-01-15'
    }
  ]);

  const handleOrderCreated = (newOrder: any) => {
    setOrders(prev => [newOrder, ...prev]);
    alert(`Order created successfully! Order ID: ${newOrder.id}`);
    setShowOrderModal(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🎉 Enhanced Order System Demo
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Experience the new cart-like ordering system with pinned products and real-time notifications
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Product Dropdown</h3>
            <p className="text-gray-600 text-sm">Select products from organized categories instead of free text</p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
              <Star className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Pinned Products</h3>
            <p className="text-gray-600 text-sm">Pin frequently used products for quick access</p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <ShoppingCart className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cart Experience</h3>
            <p className="text-gray-600 text-sm">Easy cart-like ordering with quantity controls</p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Bell className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-time Notifications</h3>
            <p className="text-gray-600 text-sm">Instant notifications for order updates</p>
          </div>
        </div>

        {/* Demo Section */}
        <div className="bg-white rounded-lg shadow-sm border p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Try the New Order System</h2>
          
          {/* Order Flow Test */}
          <div className="mb-8">
            <OrderFlowTest />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Side - Demo Controls */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Order Buttons</h3>
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    setSelectedSupplier('fresh-foods');
                    setShowOrderModal(true);
                  }}
                  className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center"
                >
                  <Package className="h-5 w-5 mr-2" />
                  Order from Fresh Foods Supply
                </button>
                
                <button 
                  onClick={() => {
                    setSelectedSupplier('premium-meats');
                    setShowOrderModal(true);
                  }}
                  className="w-full bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                >
                  <Package className="h-5 w-5 mr-2" />
                  Order from Premium Meats Co.
                </button>
                
                <button 
                  onClick={() => {
                    setSelectedSupplier('local-produce');
                    setShowOrderModal(true);
                  }}
                  className="w-full bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center"
                >
                  <Package className="h-5 w-5 mr-2" />
                  Order from Local Produce
                </button>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">What's New?</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Product dropdown with categories and search</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Pinned products section for quick access</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Cart-like interface with quantity controls</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Real-time order notifications</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Order acknowledgment and dispatch tracking</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Side - Order Status Flow */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Status Flow</h3>
              <div className="space-y-4">
                <div className="flex items-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center mr-4">
                    <span className="text-white text-sm font-bold">1</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Order Placed</h4>
                    <p className="text-sm text-gray-600">Restaurant creates order with products</p>
                  </div>
                </div>

                <div className="flex items-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4">
                    <span className="text-white text-sm font-bold">2</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Supplier Notification</h4>
                    <p className="text-sm text-gray-600">Supplier receives instant notification</p>
                  </div>
                </div>

                <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-4">
                    <span className="text-white text-sm font-bold">3</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Order Acknowledged</h4>
                    <p className="text-sm text-gray-600">Supplier acknowledges and starts processing</p>
                  </div>
                </div>

                <div className="flex items-center p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center mr-4">
                    <span className="text-white text-sm font-bold">4</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Order Dispatched</h4>
                    <p className="text-sm text-gray-600">Restaurant notified when order is shipped</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        {orders.length > 0 && (
          <div className="mt-12 bg-white rounded-lg shadow-sm border p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Orders</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.supplier}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.items} items</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${(order.total || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Create Order Modal */}
      <CreateOrderModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        supplierId={selectedSupplier}
        onOrderCreated={handleOrderCreated}
      />
    </div>
  );
}
