'use client';

import { useOrderStore } from '../hooks/useOrderStore';
import { Order } from '../hooks/useOrderStore';

export function OrderFlowTest() {
  const { orders, addOrder, updateOrderStatus } = useOrderStore();

  const createTestOrder = () => {
    const testOrder: Order = {
      id: `TEST-${Date.now()}`,
      supplierId: 'fresh-foods',
      supplier: 'Fresh Foods Supply',
      restaurantId: 'golden-fork',
      restaurant: 'Golden Fork Restaurant',
      items: 3,
      total: 45.97,
      deliveryDate: '2024-01-20',
      notes: 'Test order for order flow verification',
      orderItems: [
        { productId: 'prod-1', quantity: 2, price: 12.99, name: 'Fresh Chicken Breast' },
        { productId: 'prod-3', quantity: 1, price: 19.99, name: 'Fresh Tomatoes' }
      ],
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    addOrder(testOrder);
    alert(`Test order ${testOrder.id} created! Check supplier orders page.`);
  };

  const simulateOrderFlow = () => {
    const pendingOrders = orders.filter(o => o.status === 'Pending');
    if (pendingOrders.length === 0) {
      alert('No pending orders found. Create a test order first.');
      return;
    }

    const order = pendingOrders[0];
    
    // Simulate the complete order flow
    setTimeout(() => {
      updateOrderStatus(order.id, 'Processing');
      alert(`Order ${order.id} acknowledged by supplier!`);
    }, 1000);

    setTimeout(() => {
      updateOrderStatus(order.id, 'Dispatched');
      alert(`Order ${order.id} dispatched!`);
    }, 2000);

    setTimeout(() => {
      updateOrderStatus(order.id, 'Delivered');
      alert(`Order ${order.id} delivered! Order flow complete.`);
    }, 3000);
  };

  return (
    <div className="p-6 bg-white rounded-lg border shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Flow Test</h3>
      
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-2">
            Total Orders: {orders.length} | 
            Pending: {orders.filter(o => o.status === 'Pending').length} | 
            Processing: {orders.filter(o => o.status === 'Processing').length} | 
            Dispatched: {orders.filter(o => o.status === 'Dispatched').length} | 
            Delivered: {orders.filter(o => o.status === 'Delivered').length}
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={createTestOrder}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Test Order
          </button>
          
          <button
            onClick={simulateOrderFlow}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Simulate Order Flow
          </button>
        </div>
        
        <div className="text-xs text-gray-500">
          <p>1. Create a test order</p>
          <p>2. Go to supplier orders page to see the order</p>
          <p>3. Use "Simulate Order Flow" to test status updates</p>
          <p>4. Check restaurant orders page to see status changes</p>
        </div>
      </div>
    </div>
  );
}
