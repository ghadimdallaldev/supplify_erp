'use client';

import { ProtectedRoute } from '../../../../components/ProtectedRoute';
import { useState } from 'react';

export default function SupplierProducts() {
  return (
    <ProtectedRoute requiredRole="restaurant" roleName="Restaurant">
      <SupplierProductsContent />
    </ProtectedRoute>
  );
}

function SupplierProductsContent() {
  const [selectedSupplier, setSelectedSupplier] = useState('fresh-foods');
  const [pinnedProducts, setPinnedProducts] = useState<string[]>(['prod-1', 'prod-3']);
  const [cart, setCart] = useState<{[key: string]: number}>({});

  const suppliers = {
    'fresh-foods': {
      id: 'fresh-foods',
      name: 'Fresh Foods Supply',
      rating: 4.9,
      reviews: 127,
      categories: ['Meat & Poultry', 'Dairy', 'Produce']
    },
    'premium-meats': {
      id: 'premium-meats',
      name: 'Premium Meats Co.',
      rating: 4.7,
      reviews: 89,
      categories: ['Meat & Poultry', 'Specialty']
    },
    'local-produce': {
      id: 'local-produce',
      name: 'Local Produce',
      rating: 5.0,
      reviews: 45,
      categories: ['Produce', 'Organic', 'Local']
    }
  };

  const products = {
    'fresh-foods': [
      { id: 'prod-1', name: 'Fresh Chicken Breast', category: 'Meat & Poultry', price: 12.99, unit: 'per kg', stock: 50, image: '🐔' },
      { id: 'prod-2', name: 'Organic Milk', category: 'Dairy', price: 4.50, unit: 'per liter', stock: 200, image: '🥛' },
      { id: 'prod-3', name: 'Fresh Tomatoes', category: 'Produce', price: 3.99, unit: 'per kg', stock: 150, image: '🍅' },
      { id: 'prod-4', name: 'Ground Beef', category: 'Meat & Poultry', price: 15.99, unit: 'per kg', stock: 30, image: '🥩' },
      { id: 'prod-5', name: 'Fresh Lettuce', category: 'Produce', price: 2.99, unit: 'per head', stock: 80, image: '🥬' },
      { id: 'prod-6', name: 'Greek Yogurt', category: 'Dairy', price: 6.99, unit: 'per 500g', stock: 60, image: '🥄' }
    ],
    'premium-meats': [
      { id: 'prod-7', name: 'Wagyu Beef', category: 'Meat & Poultry', price: 89.99, unit: 'per kg', stock: 15, image: '🥩' },
      { id: 'prod-8', name: 'Free-Range Chicken', category: 'Meat & Poultry', price: 18.99, unit: 'per kg', stock: 25, image: '🐔' },
      { id: 'prod-9', name: 'Lamb Chops', category: 'Meat & Poultry', price: 24.99, unit: 'per kg', stock: 20, image: '🐑' }
    ],
    'local-produce': [
      { id: 'prod-10', name: 'Organic Carrots', category: 'Produce', price: 3.50, unit: 'per kg', stock: 100, image: '🥕' },
      { id: 'prod-11', name: 'Farm Fresh Eggs', category: 'Dairy', price: 8.99, unit: 'per dozen', stock: 50, image: '🥚' },
      { id: 'prod-12', name: 'Seasonal Berries', category: 'Produce', price: 12.99, unit: 'per 500g', stock: 30, image: '🍓' }
    ]
  };

  const togglePin = (productId: string) => {
    setPinnedProducts(prev => {
      if (prev.includes(productId)) {
        // Unpin the product
        return prev.filter(id => id !== productId);
      } else {
        // Pin the product
        return [...prev, productId];
      }
    });
    
    // Show feedback
    const product = currentProducts.find(p => p.id === productId);
    if (product) {
      const isPinned = pinnedProducts.includes(productId);
      alert(isPinned ? `${product.name} unpinned` : `${product.name} pinned to favorites!`);
    }
  };

  const addToCart = (productId: string) => {
    setCart(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1
    }));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      const newCart = { ...cart };
      delete newCart[productId];
      setCart(newCart);
    } else {
      setCart(prev => ({
        ...prev,
        [productId]: quantity
      }));
    }
  };

  const currentProducts = products[selectedSupplier as keyof typeof products] || [];
  const pinnedProductsList = currentProducts.filter(p => pinnedProducts.includes(p.id));
  const otherProducts = currentProducts.filter(p => !pinnedProducts.includes(p.id));

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Browse Supplier Products</h1>
        <p className="text-gray-600 mt-2">Discover and order from your trusted suppliers</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Supplier Selection */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Suppliers</h3>
            <div className="space-y-3">
              {Object.values(suppliers).map(supplier => (
                <button
                  key={supplier.id}
                  onClick={() => setSelectedSupplier(supplier.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedSupplier === supplier.id 
                      ? 'bg-blue-50 border-2 border-blue-200' 
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-sm">
                        {supplier.name.split(' ').map(w => w[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{supplier.name}</h4>
                      <div className="flex items-center mt-1">
                        <div className="flex text-yellow-400">
                          {[...Array(5)].map((_, i) => (
                            <svg key={i} className="w-3 h-3 fill-current" viewBox="0 0 20 20">
                              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                            </svg>
                          ))}
                        </div>
                        <span className="text-xs text-gray-500 ml-1">{supplier.rating} ({supplier.reviews})</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Shopping Cart */}
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Shopping Cart</h3>
            {Object.keys(cart).length === 0 ? (
              <p className="text-gray-500 text-sm">Your cart is empty</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(cart).map(([productId, quantity]) => {
                  const product = currentProducts.find(p => p.id === productId);
                  if (!product) return null;
                  
                  return (
                    <div key={productId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-500">${product.price} {product.unit}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => updateCartQuantity(productId, quantity - 1)}
                          className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-600 hover:bg-gray-300"
                        >
                          -
                        </button>
                        <span className="text-sm font-medium w-8 text-center">{quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(productId, quantity + 1)}
                          className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-600 hover:bg-gray-300"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                  Create Order ({Object.values(cart).reduce((a, b) => a + b, 0)} items)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Products */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {suppliers[selectedSupplier as keyof typeof suppliers]?.name} Products
              </h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Search products..."
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <select className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option>All Categories</option>
                  <option>Meat & Poultry</option>
                  <option>Dairy</option>
                  <option>Produce</option>
                </select>
              </div>
            </div>

            {/* Pinned Products */}
            {pinnedProductsList.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                  📌 Pinned Products
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pinnedProductsList.map(product => (
                    <div key={product.id} className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{product.image}</span>
                          <div>
                            <h5 className="font-semibold text-gray-900">{product.name}</h5>
                            <p className="text-sm text-gray-600">{product.category}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => togglePin(product.id)}
                          className="text-yellow-600 hover:text-yellow-700"
                          title="Unpin product"
                        >
                          📌
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg font-bold text-gray-900">${product.price}</p>
                          <p className="text-sm text-gray-500">{product.unit}</p>
                        </div>
                        <button
                          onClick={() => addToCart(product.id)}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other Products */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">All Products</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {otherProducts.map(product => (
                  <div key={product.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{product.image}</span>
                        <div>
                          <h5 className="font-semibold text-gray-900">{product.name}</h5>
                          <p className="text-sm text-gray-600">{product.category}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => togglePin(product.id)}
                        className="text-gray-400 hover:text-yellow-600"
                        title="Pin product"
                      >
                        📌
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-bold text-gray-900">${product.price}</p>
                        <p className="text-sm text-gray-500">{product.unit} • {product.stock} in stock</p>
                      </div>
                      <button
                        onClick={() => addToCart(product.id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
