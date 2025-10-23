'use client';

import { ProtectedRoute } from '../../../components/ProtectedRoute';
import Link from 'next/link';
import { useChat } from '../../../components/ChatProvider';
import { useAuthContext } from '../../auth-provider';
import { SponsoredBadge } from '../../../components/SponsoredBadge';
import { usePromoSuiteGate } from '../../../hooks/usePromoSuiteFlag';
import { usePromoSuiteTracking } from '../../../hooks/usePromoSuiteTracking';
import { useState, useEffect } from 'react';

interface Supplier {
  id: string;
  name: string;
  category: string;
  rating: number;
  orders: number;
  spent: number;
  isSponsored?: boolean;
  campaignId?: string;
  sponsoredRank?: number;
  priorityScore?: number;
}

interface PromoSuiteDiscount {
  productId: string;
  campaignId: string;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  minQty?: number;
  promoPrice: number;
  compareAtPrice: number;
  savingsPercent: number;
  endDate: string;
}

interface PromoSuiteFeaturedProduct {
  productId: string;
  campaignId: string;
  supplierId: string;
  slots: number;
  endDate: string;
}

export default function RestaurantSuppliers() {
  return (
    <ProtectedRoute requiredRole="restaurant" roleName="Restaurant">
      <RestaurantSuppliersContent />
    </ProtectedRoute>
  );
}

function RestaurantSuppliersContent() {
  const { onlineStatus, getUnreadCount } = useChat();
  const { user } = useAuthContext();
  const { isEnabled: isPromoSuiteEnabled } = usePromoSuiteGate();
  const { logImpression, logClick } = usePromoSuiteTracking({ campaignId: 'default', enabled: false });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [discounts, setDiscounts] = useState<PromoSuiteDiscount[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<PromoSuiteFeaturedProduct[]>([]);

  useEffect(() => {
    // Mock data - replace with actual API calls
    const mockSuppliers: Supplier[] = [
      { 
        id: 'fresh-foods', 
        name: 'Fresh Foods Supply', 
        category: 'Produce, Dairy', 
        rating: 4.8, 
        orders: 120, 
        spent: 12500,
        isSponsored: true,
        campaignId: 'cmp_sponsored_1',
        sponsoredRank: 1,
        priorityScore: 1.2
      },
      { 
        id: 'premium-meats', 
        name: 'Premium Meats Co.', 
        category: 'Meat, Poultry', 
        rating: 4.9, 
        orders: 85, 
        spent: 18500 
      },
      { 
        id: 'organic-greens', 
        name: 'Organic Greens Ltd.', 
        category: 'Organic Produce', 
        rating: 4.7, 
        orders: 95, 
        spent: 4200,
        isSponsored: true,
        campaignId: 'cmp_sponsored_2',
        sponsoredRank: 2,
        priorityScore: 1.1
      },
      { 
        id: 'gourmet-seafood', 
        name: 'Gourmet Seafood Inc.', 
        category: 'Seafood', 
        rating: 4.6, 
        orders: 60, 
        spent: 9800 
      },
      { 
        id: 'bakery-delights', 
        name: 'Bakery Delights', 
        category: 'Baked Goods', 
        rating: 4.5, 
        orders: 110, 
        spent: 7200 
      },
    ];

    // Apply PromoSuite blending if enabled
    if (isPromoSuiteEnabled) {
      // Sort sponsored suppliers to top, then organic
      const sortedSuppliers = mockSuppliers.sort((a, b) => {
        if (a.isSponsored && !b.isSponsored) return -1;
        if (!a.isSponsored && b.isSponsored) return 1;
        if (a.isSponsored && b.isSponsored) {
          return (a.sponsoredRank || 0) - (b.sponsoredRank || 0);
        }
        return b.rating - a.rating; // Organic sorting by rating
      });
      setSuppliers(sortedSuppliers);
    } else {
      // Regular sorting by rating
      setSuppliers(mockSuppliers.sort((a, b) => b.rating - a.rating));
    }

    // Mock PromoSuite data
    if (isPromoSuiteEnabled) {
      const mockDiscounts: PromoSuiteDiscount[] = [
        {
          productId: 'prod_1',
          campaignId: 'cmp_discount_1',
          discountType: 'PERCENT',
          discountValue: 20,
          minQty: 5,
          promoPrice: 8.00,
          compareAtPrice: 10.00,
          savingsPercent: 20,
          endDate: '2024-02-28T23:59:59Z'
        }
      ];

      const mockFeatured: PromoSuiteFeaturedProduct[] = [
        {
          productId: 'prod_2',
          campaignId: 'cmp_featured_1',
          supplierId: 'fresh-foods',
          slots: 3,
          endDate: '2024-03-15T23:59:59Z'
        }
      ];

      setDiscounts(mockDiscounts);
      setFeaturedProducts(mockFeatured);
    }
  }, [isPromoSuiteEnabled]);

  const handleSupplierClick = (supplier: Supplier) => {
    if (supplier.isSponsored && supplier.campaignId) {
      logClick();
    }
  };

  const handleSupplierView = (supplier: Supplier) => {
    if (supplier.isSponsored && supplier.campaignId) {
      logImpression();
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Your Suppliers</h1>
        {isPromoSuiteEnabled && (
          <div className="text-sm text-gray-600">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              PromoSuite Active
            </span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Supplier Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rating
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Orders
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Spent
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {suppliers.map((supplier, index) => (
              <tr 
                key={supplier.id}
                className={supplier.isSponsored ? 'bg-blue-50' : ''}
                onMouseEnter={() => handleSupplierView(supplier)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center">
                  <span className={`relative flex h-3 w-3 mr-2 ${onlineStatus[supplier.id] ? '' : 'opacity-0'}`}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <span>{supplier.name}</span>
                    {supplier.isSponsored && (
                      <SponsoredBadge />
                    )}
                    {isPromoSuiteEnabled && supplier.isSponsored && (
                      <span className="text-xs text-blue-600 font-medium">
                        #{supplier.sponsoredRank}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {supplier.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center space-x-1">
                    <span>{supplier.rating} ⭐</span>
                    {isPromoSuiteEnabled && supplier.priorityScore && (
                      <span className="text-xs text-gray-400">
                        (boost: {supplier.priorityScore}x)
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {supplier.orders}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  ${supplier.spent.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Link 
                    href={`/restaurant/chat?supplier=${supplier.id}`} 
                    className="text-blue-600 hover:text-blue-900 mr-4 relative"
                  >
                    Chat
                    {user && getUnreadCount(supplier.id, user.orgId) > 0 && (
                      <span className="absolute -top-2 -right-4 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {getUnreadCount(supplier.id, user.orgId)}
                      </span>
                    )}
                  </Link>
                  <Link 
                    href={`/restaurant/suppliers/${supplier.id}`} 
                    className="text-indigo-600 hover:text-indigo-900"
                    onClick={() => handleSupplierClick(supplier)}
                  >
                    Browse Products
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PromoSuite Features Summary */}
      {isPromoSuiteEnabled && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {discounts.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-green-800 mb-2">Active Discounts</h3>
              <p className="text-sm text-green-700">
                {discounts.length} product{discounts.length !== 1 ? 's' : ''} currently on sale
              </p>
            </div>
          )}
          
          {featuredProducts.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-purple-800 mb-2">Featured Products</h3>
              <p className="text-sm text-purple-700">
                {featuredProducts.length} product{featuredProducts.length !== 1 ? 's' : ''} featured prominently
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}