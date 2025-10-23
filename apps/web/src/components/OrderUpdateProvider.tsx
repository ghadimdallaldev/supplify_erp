'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useOrderStore, Order } from '../hooks/useOrderStore';

interface OrderUpdateContextType {
  orders: Order[];
  updateOrder: (orderId: string, updates: Partial<Order>) => void;
  addOrder: (order: Order) => void;
  getOrderById: (orderId: string) => Order | undefined;
}

const OrderUpdateContext = createContext<OrderUpdateContextType | undefined>(undefined);

export function OrderUpdateProvider({ children }: { children: ReactNode }) {
  const { orders, addOrder: addOrderToStore, updateOrderStatus, getOrderById } = useOrderStore();
  const [localOrders, setLocalOrders] = useState<Order[]>(orders);

  // Sync with store
  useEffect(() => {
    setLocalOrders(orders);
  }, [orders]);

  const updateOrder = (orderId: string, updates: Partial<Order>) => {
    const order = getOrderById(orderId);
    if (order) {
      const updatedOrder = { ...order, ...updates };
      updateOrderStatus(orderId, updatedOrder.status, updates);
      
      // Show in-app notification
      showInAppNotification(`Order ${orderId} updated to ${updatedOrder.status}`);
    }
  };

  const addOrder = (order: Order) => {
    addOrderToStore(order);
    
    // Show in-app notification
    showInAppNotification(`New order ${order.id} created`);
  };

  const showInAppNotification = (message: string) => {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300 translate-x-full';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.classList.remove('translate-x-full');
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.add('translate-x-full');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  };

  // Simulate real-time updates (in a real app, this would be WebSocket/GraphQL subscriptions)
  // DISABLED: Automatic status progression for demo purposes
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     // Simulate order status updates
  //     const pendingOrders = localOrders.filter(order => order.status === 'Pending');
  //     if (pendingOrders.length > 0) {
  //       const randomOrder = pendingOrders[Math.floor(Math.random() * pendingOrders.length)];
  //       const statuses = ['Processing', 'Dispatched', 'Delivered'];
  //       const randomStatus = statuses[Math.floor(Math.random() * statuses.length)] as Order['status'];
  //       
  //       updateOrder(randomOrder.id, { status: randomStatus });
  //     }
  //   }, 10000); // Update every 10 seconds for demo

  //   return () => clearInterval(interval);
  // }, [localOrders]);

  return (
    <OrderUpdateContext.Provider value={{
      orders: localOrders,
      updateOrder,
      addOrder,
      getOrderById,
    }}>
      {children}
    </OrderUpdateContext.Provider>
  );
}

export function useOrderUpdates() {
  const context = useContext(OrderUpdateContext);
  if (context === undefined) {
    throw new Error('useOrderUpdates must be used within an OrderUpdateProvider');
  }
  return context;
}
