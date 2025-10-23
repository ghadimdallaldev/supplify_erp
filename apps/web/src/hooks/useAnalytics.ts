'use client';

import { useOrderStore } from '../hooks/useOrderStore';
import { useMemo } from 'react';

export interface RevenueAnalytics {
  total: number;
  growth: number;
  monthly: Array<{
    month: string;
    revenue: number;
  }>;
}

export interface OrderAnalytics {
  total: number;
  growth: number;
  status: {
    completed: number;
    pending: number;
    cancelled: number;
  };
}

export interface ProductAnalytics {
  total: number;
  topSelling: Array<{
    name: string;
    sales: number;
    revenue: number;
  }>;
}

export interface CustomerAnalytics {
  total: number;
  newThisMonth: number;
  topCustomers: Array<{
    name: string;
    orders: number;
    revenue: number;
  }>;
}

export function useAnalytics(userId: string, userRole: 'supplier' | 'restaurant') {
  const { orders, getRestaurantOrders, getSupplierOrders } = useOrderStore();

  const analytics = useMemo(() => {
    // Get orders based on user role
    const userOrders = userRole === 'supplier' 
      ? getSupplierOrders(userId)
      : getRestaurantOrders(userId);

    // Calculate revenue analytics
    const revenue: RevenueAnalytics = {
      total: 0,
      growth: 0,
      monthly: []
    };

    // Calculate order analytics
    const orderAnalytics: OrderAnalytics = {
      total: userOrders.length,
      growth: 0,
      status: {
        completed: 0,
        pending: 0,
        cancelled: 0
      }
    };

    // Calculate product analytics
    const productAnalytics: ProductAnalytics = {
      total: 0,
      topSelling: []
    };

    // Calculate customer analytics
    const customerAnalytics: CustomerAnalytics = {
      total: 0,
      newThisMonth: 0,
      topCustomers: []
    };

    // Process orders to calculate analytics
    const completedOrders = userOrders.filter(order => order.status === 'Delivered');
    const pendingOrders = userOrders.filter(order => order.status === 'Pending' || order.status === 'Processing' || order.status === 'Dispatched');
    const cancelledOrders = userOrders.filter(order => order.status === 'Cancelled');

    // Calculate total revenue from completed orders
    revenue.total = completedOrders.reduce((sum, order) => {
      const orderTotal = typeof order.total === 'number' ? order.total : 0;
      return sum + orderTotal;
    }, 0);

    // Calculate monthly revenue
    const monthlyRevenue = new Map<string, number>();
    completedOrders.forEach(order => {
      const month = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short' });
      const orderTotal = typeof order.total === 'number' ? order.total : 0;
      monthlyRevenue.set(month, (monthlyRevenue.get(month) || 0) + orderTotal);
    });

    revenue.monthly = Array.from(monthlyRevenue.entries())
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => {
        const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
      });

    // Calculate growth (simplified - compare last two months)
    if (revenue.monthly.length >= 2) {
      const currentMonth = revenue.monthly[revenue.monthly.length - 1];
      const previousMonth = revenue.monthly[revenue.monthly.length - 2];
      revenue.growth = previousMonth.revenue > 0 
        ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100
        : 0;
    }

    // Update order analytics
    orderAnalytics.status.completed = completedOrders.length;
    orderAnalytics.status.pending = pendingOrders.length;
    orderAnalytics.status.cancelled = cancelledOrders.length;

    // Calculate order growth (simplified)
    const currentMonthOrders = userOrders.filter(order => {
      const orderDate = new Date(order.createdAt);
      const currentDate = new Date();
      return orderDate.getMonth() === currentDate.getMonth() && 
             orderDate.getFullYear() === currentDate.getFullYear();
    }).length;

    const lastMonthOrders = userOrders.filter(order => {
      const orderDate = new Date(order.createdAt);
      const currentDate = new Date();
      const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
      return orderDate.getMonth() === lastMonth.getMonth() && 
             orderDate.getFullYear() === lastMonth.getFullYear();
    }).length;

    orderAnalytics.growth = lastMonthOrders > 0 
      ? ((currentMonthOrders - lastMonthOrders) / lastMonthOrders) * 100
      : 0;

    // Calculate product analytics
    const productSales = new Map<string, { name: string; sales: number; revenue: number }>();
    
    completedOrders.forEach(order => {
      order.orderItems.forEach(item => {
        const existing = productSales.get(item.productId);
        if (existing) {
          existing.sales += item.quantity;
          existing.revenue += item.price * item.quantity;
        } else {
          productSales.set(item.productId, {
            name: item.name,
            sales: item.quantity,
            revenue: item.price * item.quantity
          });
        }
      });
    });

    productAnalytics.topSelling = Array.from(productSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);

    productAnalytics.total = productSales.size;

    // Calculate customer analytics
    const customerData = new Map<string, { name: string; orders: number; revenue: number }>();
    
    if (userRole === 'supplier') {
      // For suppliers, group by restaurant
      completedOrders.forEach(order => {
        const existing = customerData.get(order.restaurantId);
        const orderTotal = typeof order.total === 'number' ? order.total : 0;
        if (existing) {
          existing.orders += 1;
          existing.revenue += orderTotal;
        } else {
          customerData.set(order.restaurantId, {
            name: order.restaurant,
            orders: 1,
            revenue: orderTotal
          });
        }
      });
    } else {
      // For restaurants, group by supplier
      completedOrders.forEach(order => {
        const existing = customerData.get(order.supplierId);
        const orderTotal = typeof order.total === 'number' ? order.total : 0;
        if (existing) {
          existing.orders += 1;
          existing.revenue += orderTotal;
        } else {
          customerData.set(order.supplierId, {
            name: order.supplier,
            orders: 1,
            revenue: orderTotal
          });
        }
      });
    }

    customerAnalytics.topCustomers = Array.from(customerData.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);

    customerAnalytics.total = customerData.size;

    // Calculate new customers this month
    const currentMonth = new Date();
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    
    const newCustomersThisMonth = new Set();
    userOrders.forEach(order => {
      if (new Date(order.createdAt) >= startOfMonth) {
        if (userRole === 'supplier') {
          newCustomersThisMonth.add(order.restaurantId);
        } else {
          newCustomersThisMonth.add(order.supplierId);
        }
      }
    });
    
    customerAnalytics.newThisMonth = newCustomersThisMonth.size;

    return {
      revenue,
      orders: orderAnalytics,
      products: productAnalytics,
      customers: customerAnalytics
    };
  }, [orders, userId, userRole, getRestaurantOrders, getSupplierOrders]);

  return analytics;
}
