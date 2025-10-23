'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface PinToggleButtonProps {
  productId: string;
  supplierId: string;
  isPinned: boolean;
  onToggle?: (pinned: boolean) => void;
  className?: string;
}

/**
 * Pin Toggle Button Component
 * Allows users to pin/unpin products with optimistic updates
 */
export function PinToggleButton({
  productId,
  supplierId,
  isPinned: initialPinned,
  onToggle,
  className = '',
}: PinToggleButtonProps) {
  const [isPinned, setIsPinned] = useState(initialPinned);
  const queryClient = useQueryClient();

  const pinMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation PinProduct($input: PinProductInput!) {
              pinProduct(input: $input) {
                id
                productId
                sortIndex
              }
            }
          `,
          variables: {
            input: {
              supplierId,
              productId,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to pin product');
      }

      return response.json();
    },
    onMutate: async () => {
      // Optimistic update
      setIsPinned(true);
      onToggle?.(true);
    },
    onSuccess: () => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ queryKey: ['pinnedProducts', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['supplierProducts', supplierId] });
    },
    onError: () => {
      // Revert on error
      setIsPinned(false);
      onToggle?.(false);
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation UnpinProduct($input: UnpinProductInput!) {
              unpinProduct(input: $input)
            }
          `,
          variables: {
            input: {
              supplierId,
              productId,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to unpin product');
      }

      return response.json();
    },
    onMutate: async () => {
      // Optimistic update
      setIsPinned(false);
      onToggle?.(false);
    },
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['pinnedProducts', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['supplierProducts', supplierId] });
    },
    onError: () => {
      // Revert on error
      setIsPinned(true);
      onToggle?.(true);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPinned) {
      unpinMutation.mutate();
    } else {
      pinMutation.mutate();
    }
  };

  const isLoading = pinMutation.isPending || unpinMutation.isPending;

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`group relative p-2 rounded-lg transition-all duration-200 ${
        isPinned
          ? 'text-yellow-500 hover:text-yellow-600'
          : 'text-gray-400 hover:text-gray-600'
      } ${isLoading ? 'opacity-50 cursor-wait' : 'hover:bg-gray-100'} ${className}`}
      title={isPinned ? 'Unpin from top' : 'Pin to top'}
      aria-label={isPinned ? 'Unpin product' : 'Pin product'}
    >
      <Star
        className={`h-5 w-5 transition-all ${
          isPinned ? 'fill-current' : 'group-hover:scale-110'
        }`}
      />
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        {isPinned ? 'Unpin from top' : 'Pin to top for quick access'}
      </div>
    </button>
  );
}

