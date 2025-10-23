'use client';

import { useState, useEffect, useCallback } from 'react';

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
}

export interface Order {
  id: string;
  supplierId: string;
  supplier: string;
  restaurantId: string;
  restaurant: string;
  items: number;
  total: number;
  deliveryDate: string;
  notes: string;
  orderItems: OrderItem[];
  status: 'Pending' | 'Processing' | 'Dispatched' | 'Delivered' | 'Cancelled';
  createdAt: string;
  acknowledgedAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
}

// Global order store using localStorage for persistence
const ORDER_STORAGE_KEY = 'supplify-orders';

class OrderStore {
  private orders: Order[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(ORDER_STORAGE_KEY);
      if (stored) {
        this.orders = JSON.parse(stored);
      }
    }
  }

  private saveToStorage() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(this.orders));
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Get all orders
  getAllOrders(): Order[] {
    return [...this.orders];
  }

  // Get orders for a specific restaurant
  getRestaurantOrders(restaurantId: string): Order[] {
    return this.orders.filter(order => order.restaurantId === restaurantId);
  }

  // Get orders for a specific supplier
  getSupplierOrders(supplierId: string): Order[] {
    return this.orders.filter(order => order.supplierId === supplierId);
  }

  // Add a new order
  addOrder(order: Order) {
    this.orders.unshift(order); // Add to beginning
    this.saveToStorage();
    this.notify();
    
    // Simulate notification to supplier
    console.log(`📧 Notification sent to supplier ${order.supplierId}: New order ${order.id} received`);
    
    return order;
  }

  // Update order status
  updateOrderStatus(orderId: string, status: Order['status'], additionalData?: Partial<Order>) {
    const orderIndex = this.orders.findIndex(order => order.id === orderId);
    if (orderIndex !== -1) {
      const order = this.orders[orderIndex];
      const now = new Date().toISOString();
      
      // Validate status transition
      const validTransitions: Record<Order['status'], Order['status'][]> = {
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Dispatched', 'Cancelled'],
        'Dispatched': ['Delivered', 'Cancelled'],
        'Delivered': [], // Final state
        'Cancelled': [], // Final state
      };

      if (!validTransitions[order.status]?.includes(status)) {
        console.error(`Invalid status transition from ${order.status} to ${status}`);
        return null;
      }
      
      // Update status and timestamps
      this.orders[orderIndex] = {
        ...order,
        status,
        ...additionalData,
        ...(status === 'Processing' && { acknowledgedAt: now }),
        ...(status === 'Dispatched' && { dispatchedAt: now }),
        ...(status === 'Delivered' && { deliveredAt: now }),
      };
      
      this.saveToStorage();
      this.notify();
      
      // Simulate notification to restaurant
      console.log(`📧 Notification sent to restaurant ${order.restaurantId}: Order ${orderId} status updated to ${status}`);
      
      return this.orders[orderIndex];
    }
    return null;
  }

  // Get order by ID
  getOrderById(orderId: string): Order | undefined {
    return this.orders.find(order => order.id === orderId);
  }
}

// Global instance
const orderStore = new OrderStore();

// React hook for using the order store
export function useOrderStore() {
  const [orders, setOrders] = useState<Order[]>(orderStore.getAllOrders());

  useEffect(() => {
    const unsubscribe = orderStore.subscribe(() => {
      setOrders(orderStore.getAllOrders());
    });
    return unsubscribe;
  }, []);

  const addOrder = useCallback((order: Order) => {
    return orderStore.addOrder(order);
  }, []);

  const updateOrderStatus = useCallback((orderId: string, status: Order['status'], additionalData?: Partial<Order>) => {
    return orderStore.updateOrderStatus(orderId, status, additionalData);
  }, []);

  const getRestaurantOrders = useCallback((restaurantId: string) => {
    return orderStore.getRestaurantOrders(restaurantId);
  }, []);

  const getSupplierOrders = useCallback((supplierId: string) => {
    return orderStore.getSupplierOrders(supplierId);
  }, []);

  const getOrderById = useCallback((orderId: string) => {
    return orderStore.getOrderById(orderId);
  }, []);

  return {
    orders,
    addOrder,
    updateOrderStatus,
    getRestaurantOrders,
    getSupplierOrders,
    getOrderById,
  };
}
