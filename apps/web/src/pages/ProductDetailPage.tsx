import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { getProductMoq } from '../lib/orderQuantityRules'

export function ProductDetailPage() {
  const { t } = useTranslation('products')
  const { id } = useParams<{ id: string }>()
  const { addItem } = useCartActions()
  const { isEffectiveSupplier } = useImpersonation()

  const { data, isLoading, error } = useGetProductQuery(id!)

  const handleAddToCart = () => {
    if (data?.product) {
      addItem({
        productId: data.product.id,
        product: data.product,
        quantity: getProductMoq(data.product),
      })
      toast.success(t('toast.addedToCart'))
    }
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !data) {
    return (
      <PageShell data-testid="product-detail-page">
        <PageHeader
          title={t('detail.title')}
          breadcrumb={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/products">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('detail.backToProducts')}
              </Link>
            </Button>
          }
        />
        <p className="text-center text-[var(--red)]">{t('detail.notFound')}</p>
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
              {t('detail.backToProducts')}
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
              <CardTitle>{t('detail.productDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-medium text-[var(--text-muted)]">{t('detail.sku')}</p>
                  <p>{product.sku}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-muted)]">{t('detail.supplier')}</p>
                  <p>{product.supplier_name}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-muted)]">{t('detail.unit')}</p>
                  <p>{product.unit || t('detail.notAvailable')}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-muted)]">{t('detail.stock')}</p>
                  <p>
                    {product.available_qty || 0} {product.unit || t('detail.units')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.pricing')}</CardTitle>
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
              {t('detail.addToCart')}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/app/cart">{t('detail.viewCart')}</Link>
            </Button>
          </div>

          {isEffectiveSupplier && id && <ProductSubstitutesSection productId={id} />}
        </div>
      </div>
    </PageShell>
  )
}
