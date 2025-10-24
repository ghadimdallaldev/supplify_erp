'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter } from 'lucide-react';
import { PinnedRail } from '@/components/PinnedRail';
import { PinToggleButton } from '@/components/PinToggleButton';

interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string;
  price: number;
  unit: string;
  imageUrl?: string;
  isPinned?: boolean;
  pinNote?: string;
}

interface Props {
  params: {
    id: string;
  };
}

/**
 * Supplier Storefront Page
 * Shows pinned products first, then regular catalog
 */
export default function SupplierStorefront({ params }: Props) {
  const supplierId = params.id;
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Fetch pinned products
  const { data: pinnedProducts } = useQuery({
    queryKey: ['pinnedProducts', supplierId],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetPinnedProducts($supplierId: ID!) {
              pinnedProducts(supplierId: $supplierId) {
                id
                productId
                sortIndex
                note
              }
            }
          `,
          variables: { supplierId },
        }),
      });

      const result = await response.json();
      return result.data?.pinnedProducts || [];
    },
  });

  // Fetch supplier products with pins surfaced first
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['supplierProducts', supplierId, searchQuery, categoryFilter],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetSupplierProductsWithPins(
              $supplierId: ID!,
              $search: String,
              $categoryId: ID,
              $first: Int
            ) {
              supplierProductsWithPins(
                supplierId: $supplierId,
                search: $search,
                categoryId: $categoryId,
                first: $first
              ) {
                edges {
                  node {
                    id
                    name
                    sku
                    description
                    price
                    unit
                    imageUrl
                    isPinned
                    pinNote
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          `,
          variables: {
            supplierId,
            search: searchQuery || undefined,
            categoryId: categoryFilter || undefined,
            first: 50,
          },
        }),
      });

      const result = await response.json();
      return result.data?.supplierProductsWithPins;
    },
  });

  const products = productsData?.edges?.map((edge: any) => edge.node) || [];
  const pinnedItems = products.filter((p: Product) => p.isPinned);
  const regularItems = products.filter((p: Product) => !p.isPinned);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Supplier Catalog</h1>
          <p className="text-gray-600 mt-2">Browse and order products</p>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="">All Categories</option>
                <option value="produce">Produce</option>
                <option value="proteins">Proteins</option>
                <option value="dry-goods">Dry Goods</option>
                <option value="dairy">Dairy</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pinned Products Rail */}
        {pinnedProducts && pinnedProducts.length > 0 && (
          <div className="mb-8">
            <PinnedRail
              supplierId={supplierId}
              pins={pinnedProducts}
              orientation="horizontal"
            />
          </div>
        )}

        {/* Product Grid */}
        <div className="space-y-6">
          {/* Pinned Section (if search matches) */}
          {pinnedItems.length > 0 && searchQuery && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                <span className="text-yellow-500">★</span>
                Pinned Matches ({pinnedItems.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pinnedItems.map((product: Product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    supplierId={supplierId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regular Products */}
          {regularItems.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                All Products ({regularItems.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {regularItems.map((product: Product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    supplierId={supplierId}
                  />
                ))}
              </div>
            </div>
          )}

          {products.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No products found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Product Card Component
 */
function ProductCard({
  product,
  supplierId,
}: {
  product: Product;
  supplierId: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden">
      {/* Image */}
      <div className="relative h-48 bg-gray-100">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-400 text-sm">No image</span>
          </div>
        )}

        {/* Pin Button Overlay */}
        <div className="absolute top-2 right-2">
          <PinToggleButton
            productId={product.id}
            supplierId={supplierId}
            isPinned={product.isPinned || false}
            className="bg-white/90 backdrop-blur-sm shadow-sm"
          />
        </div>

        {/* Pinned Badge */}
        {product.isPinned && (
          <div className="absolute top-2 left-2 bg-yellow-500 text-white text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
            <span>★</span>
            PINNED
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
          {product.name}
        </h3>
        <p className="text-sm text-gray-500 mb-2">{product.sku}</p>

        {product.pinNote && (
          <p className="text-sm text-blue-600 italic mb-2">"{product.pinNote}"</p>
        )}

        {product.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {product.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-gray-900">
              ${product.price.toFixed(2)}
            </span>
            <span className="text-sm text-gray-500 ml-1">/ {product.unit}</span>
          </div>

          <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

