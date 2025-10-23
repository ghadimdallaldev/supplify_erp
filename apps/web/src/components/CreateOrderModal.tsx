'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Star, Package, Plus, Minus, X, Search, Filter, Heart } from 'lucide-react';
import { useOrderStore, Order } from '../hooks/useOrderStore';
import { ButtonAction } from './ButtonAction';
import { FriendSupplierModal } from './FriendSupplierModal';
import { useMutation } from '@tanstack/react-query';
import { gql } from '@apollo/client';
import { apolloClient } from '../lib/apollo-client';

const PLACE_ORDER_MUTATION = gql`
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input)
  }
`;

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  stock: number;
  image: string;
  supplierId: string;
}

interface CartItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
}

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
}

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId?: string; // Make optional since we'll have a dropdown
  onOrderCreated: (order: any) => void;
}

// Mock data for products
const mockProducts: Product[] = [
  { id: 'prod-1', name: 'Fresh Chicken Breast', category: 'Meat & Poultry', price: 12.99, unit: 'per kg', stock: 50, image: '🐔', supplierId: 'fresh-foods' },
  { id: 'prod-2', name: 'Organic Milk', category: 'Dairy', price: 4.50, unit: 'per liter', stock: 200, image: '🥛', supplierId: 'fresh-foods' },
  { id: 'prod-3', name: 'Fresh Tomatoes', category: 'Produce', price: 3.99, unit: 'per kg', stock: 150, image: '🍅', supplierId: 'fresh-foods' },
  { id: 'prod-4', name: 'Ground Beef', category: 'Meat & Poultry', price: 15.99, unit: 'per kg', stock: 30, image: '🥩', supplierId: 'fresh-foods' },
  { id: 'prod-5', name: 'Fresh Lettuce', category: 'Produce', price: 2.99, unit: 'per head', stock: 80, image: '🥬', supplierId: 'fresh-foods' },
  { id: 'prod-6', name: 'Greek Yogurt', category: 'Dairy', price: 6.99, unit: 'per 500g', stock: 60, image: '🥄', supplierId: 'fresh-foods' },
  { id: 'prod-7', name: 'Wagyu Beef', category: 'Meat & Poultry', price: 89.99, unit: 'per kg', stock: 15, image: '🥩', supplierId: 'premium-meats' },
  { id: 'prod-8', name: 'Free-Range Chicken', category: 'Meat & Poultry', price: 18.99, unit: 'per kg', stock: 25, image: '🐔', supplierId: 'premium-meats' },
  { id: 'prod-9', name: 'Lamb Chops', category: 'Meat & Poultry', price: 24.99, unit: 'per kg', stock: 20, image: '🐑', supplierId: 'premium-meats' },
  { id: 'prod-10', name: 'Organic Carrots', category: 'Produce', price: 3.50, unit: 'per kg', stock: 100, image: '🥕', supplierId: 'local-produce' },
  { id: 'prod-11', name: 'Farm Fresh Eggs', category: 'Dairy', price: 8.99, unit: 'per dozen', stock: 50, image: '🥚', supplierId: 'local-produce' },
  { id: 'prod-12', name: 'Seasonal Berries', category: 'Produce', price: 12.99, unit: 'per 500g', stock: 30, image: '🍓', supplierId: 'local-produce' },
  { id: 'prod-13', name: 'Fresh Herbs', category: 'Produce', price: 4.99, unit: 'per bunch', stock: 40, image: '🌿', supplierId: 'local-produce' },
];

// Mock pinned products for the restaurant (products from different suppliers)
const mockPinnedProducts = ['prod-1', 'prod-3', 'prod-5', 'prod-7', 'prod-10'];

// Mock suppliers data
const mockSuppliers = {
  'fresh-foods': { id: 'fresh-foods', name: 'Fresh Foods Supply', color: 'green' },
  'premium-meats': { id: 'premium-meats', name: 'Premium Meats Co.', color: 'red' },
  'local-produce': { id: 'local-produce', name: 'Local Produce', color: 'orange' },
};

export function CreateOrderModal({ isOpen, onClose, supplierId: initialSupplierId, onOrderCreated }: CreateOrderModalProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [pinnedProducts, setPinnedProducts] = useState<string[]>(mockPinnedProducts);
  const [selectedSupplier, setSelectedSupplier] = useState(initialSupplierId || 'fresh-foods');
  const [showFriendModal, setShowFriendModal] = useState(false);
  
  const { addOrder } = useOrderStore();

  // Filter products based on supplier, search, and category
  const filteredProducts = mockProducts.filter(product => {
    const matchesSupplier = product.supplierId === selectedSupplier;
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    return matchesSupplier && matchesSearch && matchesCategory;
  });

  const pinnedProductsList = filteredProducts.filter(p => pinnedProducts.includes(p.id));
  const otherProducts = filteredProducts.filter(p => !pinnedProducts.includes(p.id));

  const categories = ['All', ...Array.from(new Set(filteredProducts.map(p => p.category)))];

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existingItem = prev.find(item => item.productId === product.id);
      if (existingItem) {
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prev, { 
          productId: product.id, 
          quantity: 1, 
          price: product.price,
          name: product.name
        }];
      }
    });
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.productId !== productId));
    } else {
      setCart(prev => prev.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      ));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const togglePin = (productId: string) => {
    setPinnedProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  const getTotalAmount = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const placeOrderMutation = useMutation({
    mutationFn: async (input: { deliveryAddress: string; notes?: string }) => {
      const result = await apolloClient.mutate({
        mutation: PLACE_ORDER_MUTATION,
        variables: { input },
      });
      return JSON.parse(result.data.placeOrder);
    },
    onSuccess: (result) => {
      console.log('Order placed successfully:', result);
      alert('Order placed successfully!');
      onClose();
    },
    onError: (error) => {
      console.error('Error placing order:', error);
      alert('Error placing order: ' + error.message);
    },
  });

  const createOrder = () => {
    if (cart.length === 0) {
      alert('Please add items to your cart before creating an order');
      return;
    }

    if (!deliveryDate) {
      alert('Please select a delivery date');
      return;
    }

    // Place order via GraphQL API
    placeOrderMutation.mutate({
      deliveryAddress: `Delivery Address for ${deliveryDate}`,
      notes: notes,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Create New Order</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          {/* Supplier Selection */}
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Select Supplier:</label>
            <select
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                setCart([]); // Clear cart when switching suppliers
                setSearchTerm(''); // Reset search
                setSelectedCategory('All'); // Reset category filter
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Object.values(mockSuppliers).map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                mockSuppliers[selectedSupplier as keyof typeof mockSuppliers]?.color === 'green' ? 'bg-green-500' :
                mockSuppliers[selectedSupplier as keyof typeof mockSuppliers]?.color === 'red' ? 'bg-red-500' :
                'bg-orange-500'
              }`}></div>
              <span className="text-sm text-gray-600">
                {mockSuppliers[selectedSupplier as keyof typeof mockSuppliers]?.name}
              </span>
            </div>
            <button
              onClick={() => setShowFriendModal(true)}
              className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              title="Manage favorite suppliers"
            >
              <Heart className="h-4 w-4" />
              <span>Favorites</span>
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left Side - Product Selection */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Search and Filters */}
            <div className="mb-6">
              <div className="flex gap-4 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Pinned Products */}
            {pinnedProductsList.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                  <Star className="h-4 w-4 text-yellow-500 fill-current mr-2" />
                  Pinned Products ({pinnedProductsList.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pinnedProductsList.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={() => addToCart(product)}
                      onTogglePin={() => togglePin(product.id)}
                      isPinned={true}
                      cartQuantity={cart.find(item => item.productId === product.id)?.quantity || 0}
                      onUpdateQuantity={(quantity) => updateCartQuantity(product.id, quantity)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Products */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">All Products</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {otherProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={() => addToCart(product)}
                    onTogglePin={() => togglePin(product.id)}
                    isPinned={false}
                    cartQuantity={cart.find(item => item.productId === product.id)?.quantity || 0}
                    onUpdateQuantity={(quantity) => updateCartQuantity(product.id, quantity)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Side - Cart and Order Details */}
          <div className="w-96 border-l border-gray-200 flex flex-col">
            <div className="flex-1 p-6 overflow-y-auto">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <ShoppingCart className="h-5 w-5 mr-2" />
                Shopping Cart ({cart.length} items)
              </h4>
              
              {cart.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">Your cart is empty</p>
                  <p className="text-sm text-gray-400">Add products to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.productId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">${item.price}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                          className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-600 hover:bg-gray-300"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                          className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-600 hover:bg-gray-300"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Order Details */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions or notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              {/* Order Summary */}
              {cart.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="font-medium text-gray-900 mb-2">Order Summary</h5>
                  <div className="space-y-1 text-sm">
                    {cart.map(item => (
                      <div key={item.productId} className="flex justify-between">
                        <span className="text-gray-600">{item.name} x{item.quantity}</span>
                        <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>${getTotalAmount().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </div>

            {/* Action Buttons - Fixed at bottom */}
            <div className="border-t border-gray-200 p-6 bg-white">
              <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                data-testid="btn-cancel-order"
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <ButtonAction
                onClick={createOrder}
                confirmTitle="Are you sure you want to create this order?"
                confirmDescription="This will place the order with the selected supplier."
                successMessage="Order created successfully!"
                errorMessage="Failed to create order. Please try again."
                disabled={cart.length === 0 || !deliveryDate || placeOrderMutation.isPending}
                data-testid="btn-create-order"
                className="px-4 py-2"
              >
                {placeOrderMutation.isPending ? 'Creating Order...' : 'Create Order'}
              </ButtonAction>
            </div>
          </div>
        </div>
      </div>
      
      {/* Friend Supplier Modal */}
      <FriendSupplierModal
        isOpen={showFriendModal}
        onClose={() => setShowFriendModal(false)}
        restaurantId="golden-fork"
      />
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  onAddToCart: () => void;
  onTogglePin: () => void;
  isPinned: boolean;
  cartQuantity: number;
  onUpdateQuantity: (quantity: number) => void;
}

function ProductCard({ product, onAddToCart, onTogglePin, isPinned, cartQuantity, onUpdateQuantity }: ProductCardProps) {
  return (
    <div className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
      isPinned ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{product.image}</span>
          <div>
            <h5 className="font-semibold text-gray-900">{product.name}</h5>
            <p className="text-sm text-gray-600">{product.category}</p>
          </div>
        </div>
        <button
          onClick={onTogglePin}
          className={`${isPinned ? 'text-yellow-600' : 'text-gray-400 hover:text-yellow-600'}`}
          title={isPinned ? "Unpin product" : "Pin product"}
        >
          <Star className={`h-4 w-4 ${isPinned ? 'fill-current' : ''}`} />
        </button>
      </div>
      
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-gray-900">${product.price}</p>
          <p className="text-sm text-gray-500">{product.unit} • {product.stock} in stock</p>
        </div>
        
        {cartQuantity > 0 ? (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onUpdateQuantity(cartQuantity - 1)}
              className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-600 hover:bg-gray-300"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-sm font-medium w-8 text-center">{cartQuantity}</span>
            <button
              onClick={() => onUpdateQuantity(cartQuantity + 1)}
              className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-gray-600 hover:bg-gray-300"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onAddToCart}
            className="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Add to Cart
          </button>
        )}
      </div>
    </div>
  );
}
