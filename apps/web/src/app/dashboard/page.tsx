'use client';

import { useQuery } from '@tanstack/react-query';
import { gql } from '@apollo/client';
import { apolloClient } from '../lib/apollo-client';

const DASHBOARD_KPIS_QUERY = gql`
  query GetDashboardKpis {
    restaurantDashboardKpis
  }
`;

const RECENT_ORDERS_QUERY = gql`
  query GetRecentOrders($limit: Int) {
    recentOrders(limit: $limit)
  }
`;

const INVENTORY_SUMMARY_QUERY = gql`
  query GetInventorySummary {
    inventorySummary
  }
`;

const LOYALTY_WALLETS_QUERY = gql`
  query GetLoyaltyWallets {
    myLoyaltyWallets
  }
`;

export default function Dashboard() {
  const { data: kpisData, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      const result = await apolloClient.query({
        query: DASHBOARD_KPIS_QUERY,
      });
      return JSON.parse(result.data.restaurantDashboardKpis);
    },
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: async () => {
      const result = await apolloClient.query({
        query: RECENT_ORDERS_QUERY,
        variables: { limit: 10 },
      });
      return JSON.parse(result.data.recentOrders);
    },
  });

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: async () => {
      const result = await apolloClient.query({
        query: INVENTORY_SUMMARY_QUERY,
      });
      return JSON.parse(result.data.inventorySummary);
    },
  });

  const { data: loyaltyData, isLoading: loyaltyLoading } = useQuery({
    queryKey: ['loyalty-wallets'],
    queryFn: async () => {
      const result = await apolloClient.query({
        query: LOYALTY_WALLETS_QUERY,
      });
      return JSON.parse(result.data.myLoyaltyWallets);
    },
  });

  const totalLoyaltyPoints = loyaltyData?.reduce((sum: number, wallet: any) => sum + wallet.points, 0) || 0;
  const activeSuppliers = ordersData?.length || 0;

  if (kpisLoading || ordersLoading || inventoryLoading || loyaltyLoading) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card p-6 rounded-lg border animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <div className="h-6 bg-gray-200 rounded mb-4 w-32"></div>
          <div className="border rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-48"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Active Orders</h3>
          <p className="text-2xl font-bold mt-2">{kpisData?.activeOrders || 0}</p>
        </div>
        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Monthly Spend</h3>
          <p className="text-2xl font-bold mt-2">${(kpisData?.monthlySpend || 0).toFixed(2)}</p>
        </div>
        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Low Stock Items</h3>
          <p className="text-2xl font-bold mt-2">{inventoryData?.lowStock || 0}</p>
        </div>
        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Loyalty Points</h3>
          <p className="text-2xl font-bold mt-2">{totalLoyaltyPoints}</p>
        </div>
      </div>
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Recent Orders</h2>
        <div className="border rounded-lg p-6">
          {ordersData && ordersData.length > 0 ? (
            <div className="space-y-4">
              {ordersData.map((order: any) => (
                <div key={order.id} className="flex justify-between items-center py-2 border-b last:border-b-0">
                  <div>
                    <p className="font-medium">{order.supplierName}</p>
                    <p className="text-sm text-muted-foreground">{order.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${order.total.toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No orders yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

