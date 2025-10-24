'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Package } from 'lucide-react';

interface PinnedProduct {
  id: string;
  productId: string;
  sortIndex: number;
  note?: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    imageUrl?: string;
  };
}

interface PinnedRailProps {
  supplierId: string;
  pins: PinnedProduct[];
  orientation?: 'horizontal' | 'vertical';
  onReorder?: (newOrder: string[]) => void;
}

/**
 * Sortable Pin Item Component
 */
function SortablePinItem({
  pin,
  onRemove,
  orientation,
}: {
  pin: PinnedProduct;
  onRemove: (productId: string) => void;
  orientation: 'horizontal' | 'vertical';
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.productId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow ${
        orientation === 'horizontal' ? 'w-48 flex-shrink-0' : 'w-full'
      }`}
    >
      <div className="p-3">
        {/* Drag Handle & Remove Button */}
        <div className="flex items-start justify-between mb-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => onRemove(pin.productId)}
            className="text-gray-400 hover:text-red-600 p-1"
            aria-label="Remove pin"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Product Info */}
        <div className="flex items-center gap-3">
          {pin.product?.imageUrl ? (
            <img
              src={pin.product.imageUrl}
              alt={pin.product.name}
              className="w-12 h-12 object-cover rounded"
            />
          ) : (
            <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
              <Package className="h-6 w-6 text-gray-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {pin.product?.name || 'Product'}
            </h4>
            <p className="text-xs text-gray-500 truncate">{pin.product?.sku}</p>
            {pin.note && (
              <p className="text-xs text-blue-600 mt-1 truncate italic">"{pin.note}"</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pinned Products Rail Component
 * Displays pinned products with drag-drop reordering
 */
export function PinnedRail({
  supplierId,
  pins: initialPins,
  orientation = 'horizontal',
  onReorder,
}: PinnedRailProps) {
  const [pins, setPins] = useState(initialPins);
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reorderMutation = useMutation({
    mutationFn: async (productIdsInOrder: string[]) => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation ReorderPinnedProducts($input: ReorderPinnedProductsInput!) {
              reorderPinnedProducts(input: $input) {
                id
                productId
                sortIndex
              }
            }
          `,
          variables: {
            input: {
              supplierId,
              productIdsInOrder,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder pins');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinnedProducts', supplierId] });
    },
    onError: () => {
      // Revert to initial state
      setPins(initialPins);
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (productId: string) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinnedProducts', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['supplierProducts', supplierId] });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPins((items) => {
        const oldIndex = items.findIndex((item) => item.productId === active.id);
        const newIndex = items.findIndex((item) => item.productId === over.id);

        const newOrder = arrayMove(items, oldIndex, newIndex);
        const productIdsInOrder = newOrder.map((p) => p.productId);

        // Throttled mutation (300ms)
        setTimeout(() => {
          reorderMutation.mutate(productIdsInOrder);
          onReorder?.(productIdsInOrder);
        }, 300);

        return newOrder;
      });
    }
  };

  const handleRemove = (productId: string) => {
    // Optimistic update
    setPins((items) => items.filter((item) => item.productId !== productId));
    unpinMutation.mutate(productId);
  };

  if (pins.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
        <Package className="h-12 w-12 text-blue-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Pin Your Staples
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Quick access your most-ordered items — pin products you buy often to keep them at the top.
        </p>
        <p className="text-xs text-gray-500">
          Click the <span className="inline-flex items-center"><Star className="h-3 w-3 mx-1" /></span> icon on any product to pin it
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500 fill-current" />
          Pinned Products ({pins.length})
        </h3>
        <p className="text-xs text-gray-500">Drag to reorder</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={pins.map((p) => p.productId)}
          strategy={
            orientation === 'horizontal'
              ? horizontalListSortingStrategy
              : verticalListSortingStrategy
          }
        >
          <div
            className={
              orientation === 'horizontal'
                ? 'flex gap-3 overflow-x-auto pb-2'
                : 'space-y-2'
            }
          >
            {pins.map((pin) => (
              <SortablePinItem
                key={pin.productId}
                pin={pin}
                onRemove={handleRemove}
                orientation={orientation}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// Re-export Star icon for use in empty state text
import { Star } from 'lucide-react';

