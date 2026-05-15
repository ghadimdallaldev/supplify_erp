import { useParams } from 'react-router-dom'
import { useGetProductQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Package, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppDispatch } from '../hooks/redux'
import { addItem } from '../features/cart/cartSlice'
import toast from 'react-hot-toast'
import { formatPrice } from '../utils/format'

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  
  const { data, isLoading, error } = useGetProductQuery(id!)

  const handleAddToCart = () => {
    if (data?.product) {
      dispatch(addItem({
        productId: data.product.id,
        product: data.product,
        quantity: 1,
      }))
      toast.success('Added to cart')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Product not found</p>
      </div>
    )
  }

  const product = data.product

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/products">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Products
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="aspect-square bg-[var(--brand-ultra)] rounded-lg flex items-center justify-center">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <Package className="h-24 w-24 text-[var(--text-muted)]" />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-[21px] font-black text-[var(--text)]">{product.name}</h1>
            <p className="text-[var(--text-muted)] mt-2">{product.description}</p>
            <div className="flex items-center space-x-2 mt-4">
              <Badge variant="secondary">{product.category}</Badge>
              <Badge variant="outline">{product.brand}</Badge>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-[var(--text-muted)]">SKU</p>
                  <p>{product.sku}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-muted)]">Supplier</p>
                  <p>{product.supplier_name}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-muted)]">Unit</p>
                  <p>{product.unit || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-muted)]">Stock</p>
                  <p>{product.available_qty || 0} {product.unit || 'units'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[var(--brand-mid)]">
                {formatPrice(product.current_price) || 'N/A'}
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {product.currency || 'USD'} per {product.unit || 'unit'}
              </p>
            </CardContent>
          </Card>

          <div className="flex space-x-4">
            <Button
              onClick={handleAddToCart}
              disabled={!product.available_qty || product.available_qty <= 0}
              className="flex-1"
            >
              Add to Cart
            </Button>
            <Button variant="outline" asChild>
              <Link to="/app/cart">
                View Cart
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
