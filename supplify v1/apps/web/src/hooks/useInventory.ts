'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  qtyOnHand: number;
  qtyAvailable: number;
  unitCost: number;
  totalValue: number;
  location: string;
  category?: string;
  lastMovementAt?: string;
}

export interface InventorySummary {
  totalItems: number;
  totalValue: number;
  items: InventoryItem[];
}

// Real API functions for inventory - no more mock data!
export async function fetchInventorySummary(restaurantId: string): Promise<InventorySummary> {
  const response = await fetch(`/api/inventory/summary/${restaurantId}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch inventory summary');
  }
  
  return response.json();
}

export async function fetchRecentActivity(restaurantId: string, limit: number = 10) {
  const response = await fetch(`/api/inventory/activity/${restaurantId}?limit=${limit}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch recent activity');
  }
  
  return response.json();
}

export async function createInventoryAdjustment(data: {
  itemId: string;
  locationId: string;
  restaurantId: string;
  adjustment: number;
  reason: string;
  userId: string;
}) {
  const response = await fetch('/api/inventory/adjustment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create inventory adjustment');
  }
  
  return response.json();
}

export function useInventory(restaurantId: string) {
  const queryClient = useQueryClient();

  const { data: inventory, isLoading, error } = useQuery({
    queryKey: ['inventory', restaurantId],
    queryFn: () => fetchInventorySummary(restaurantId),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute to see updates
  });

  const createMovementMutation = useMutation({
    mutationFn: createInventoryAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', restaurantId] });
    },
  });

  const createMovement = async (data: {
    itemId: string;
    locationId: string;
    restaurantId: string;
    adjustment: number;
    reason: string;
    userId: string;
  }) => {
    return createMovementMutation.mutateAsync(data);
  };

  return {
    inventory: inventory || { totalItems: 0, totalValue: 0, items: [] },
    isLoading,
    error,
    createMovement,
    isCreatingMovement: createMovementMutation.isPending,
  };
}

export function useInventoryStats(restaurantId: string) {
  const { data: inventory, isLoading, error } = useQuery({
    queryKey: ['inventory', restaurantId],
    queryFn: () => fetchInventorySummary(restaurantId),
    staleTime: 60000, // 1 minute
  });

  const stats = {
    totalItems: inventory?.totalItems || 0,
    totalValue: inventory?.totalValue || 0,
    lowStockItems: inventory?.items.filter(item => item.qtyOnHand < 10).length || 0,
    outOfStockItems: inventory?.items.filter(item => item.qtyOnHand === 0).length || 0,
  };

  return {
    stats,
    isLoading,
    error,
  };
}
