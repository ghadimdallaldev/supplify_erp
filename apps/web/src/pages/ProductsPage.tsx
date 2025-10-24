import { useState } from 'react'
import { useGetProductsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Package, Search, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppDispatch } from '../hooks/redux'
import { addItem } from '../features/cart/cartSlice'
import toast from 'react-hot-toast'

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const dispatch = useAppDispatch()

  const { data, isLoading, error } = useGetProductsQuery({
    q: search || undefined,
    category: category || undefined,
    limit: 20,
    offset: 0,
  })

  const handleAddToCart = (product: any) => {
    dispatch(addItem({
      productId: product.id,
      product,
      quantity: 1,
    }))
    toast.success('Added to cart')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load products</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-2">
            Browse and search products from suppliers
          </p>
        </div>
        <Button asChild>
          <Link to="/app/cart">
            View Cart
          </Link>
        </Button>
      </div>

      <div className="flex space-x-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Categories</option>
          <option value="Vegetables">Vegetables</option>
          <option value="Meat">Meat</option>
          <option value="Grains">Grains</option>
          <option value="Oils">Oils</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {data?.products.map((product) => (
          <Card key={product.id} className="overflow-hidden">
            <div className="aspect-square bg-gray-100 flex items-center justify-center">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-12 w-12 text-gray-400" />
              )}
            </div>
            <CardHeader>
              <CardTitle className="text-lg">{product.name}</CardTitle>
              <CardDescription>
                {product.description || 'No description available'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                  <p className="text-sm text-gray-600">Supplier: {product.supplier_name}</p>
                </div>
                <Badge variant="secondary">{product.category}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">
                    ${product.current_price?.toFixed(2) || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600">
                    Stock: {product.available_qty || 0} {product.unit || 'units'}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAddToCart(product)}
                  disabled={!product.available_qty || product.available_qty <= 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add to Cart
                </Button>
              </div>
              
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link to={`/app/products/${product.id}`}>
                  View Details
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.products.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No products found</p>
        </div>
      )}
    </div>
  )
}
