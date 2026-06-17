import { useParams } from 'react-router-dom'
import { useGetProductQuery } from '../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { DetailPageSkeleton } from '../components/ui/detail-page-skeleton'
import { Package, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCartActions } from '../hooks/useCartActions'
import { toast } from 'sonner'
import { ContractPriceDisplay } from '../components/ContractPriceDisplay'
import { useImpersonation } from '../hooks/useImpersonation'
import { ProductSubstitutesSection } from '../components/supplier/ProductSubstitutesSection'

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { addItem } = useCartActions()
  const { isEffectiveSupplier } = useImpersonation()

  const { data, isLoading, error } = useGetProductQuery(id!)

  const handleAddToCart = () => {
    if (data?.product) {
      addItem({
        productId: data.product.id,
        product: data.product,
        quantity: 1,
      })
      toast.success('Added to cart')
    }
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !data) {
    return (
      <PageShell data-testid="product-detail-page">
        <PageHeader
          title="Product"
          breadcrumb={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/products">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Products
              </Link>
            </Button>
          }
        />
        <p className="text-center text-[var(--red)]">Product not found</p>
      </PageShell>
    )
  }

  const product = data.product

  return (
    <PageShell data-testid="product-detail-page">
      <PageHeader
        title={product.name}
        description={product.description || undefined}
        breadcrumb={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/products">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Products
            </Link>
          </Button>
        }
      />

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
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{product.category}</Badge>
            <Badge variant="outline">{product.brand}</Badge>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
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
                  <p>
                    {product.available_qty || 0} {product.unit || 'units'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <ContractPriceDisplay
                currentPrice={product.current_price}
                catalogPrice={product.catalog_price}
                pricingSource={product.pricing_source}
                currency={product.currency}
                unit={product.unit}
              />
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
              <Link to="/app/cart">View Cart</Link>
            </Button>
          </div>

          {isEffectiveSupplier && id && <ProductSubstitutesSection productId={id} />}
        </div>
      </div>
    </PageShell>
  )
}
