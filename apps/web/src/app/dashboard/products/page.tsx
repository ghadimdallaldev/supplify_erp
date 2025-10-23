'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Upload, Search, Filter } from 'lucide-react';
import { ProductQuickAddDrawer } from '@/components/ProductQuickAddDrawer';
import { BulkUploadWizard } from '@/components/BulkUploadWizard';

/**
 * Supplier Products Page
 * Manage product catalog with Quick Add and Bulk Upload
 */
export default function SupplierProductsPage() {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const supplierId = 'sup-sysco-001'; // Would come from auth context

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', supplierId, searchTerm],
    queryFn: async () => {
      // Mock data - would be GraphQL query
      return [
        {
          id: '1',
          sku: 'CHK-BR-001',
          name: 'Fresh Chicken Breast',
          brand: 'Premium Farms',
          unit: 'KG',
          price: 8.99,
          stockQty: 100,
          active: true,
        },
        {
          id: '2',
          sku: 'MLK-WHL-001',
          name: 'Whole Milk',
          brand: 'Dairy Co',
          unit: 'L',
          price: 2.49,
          stockQty: 500,
          active: true,
        },
      ];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      return [
        { id: 'cat-dairy', name: 'Dairy', path: 'Dairy' },
        { id: 'cat-proteins', name: 'Proteins', path: 'Proteins' },
      ];
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            <p className="text-gray-600 mt-2">{products?.length || 0} active products</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowBulkUpload(true)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Upload className="h-5 w-5" />
              Bulk Upload (Excel/CSV)
            </button>
            <button
              onClick={() => setShowQuickAdd(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Add New Product
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, SKU, or brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </button>
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products?.map((product: any) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900">{product.sku}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{product.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{product.brand || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{product.unit}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">${product.price.toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">{product.stockQty}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      product.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {product.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Drawers */}
        {categories && (
          <ProductQuickAddDrawer
            open={showQuickAdd}
            onClose={() => setShowQuickAdd(false)}
            supplierId={supplierId}
            categories={categories}
          />
        )}

        <BulkUploadWizard
          open={showBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          supplierId={supplierId}
        />
      </div>
    </div>
  );
}

