import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useGetPublicSupplierQuery,
  useGetPublicSupplierProductsQuery,
  useGetPublicSupplierPricedProductsQuery,
} from '../services/api'
import { useAppSelector } from '../hooks/redux'
import { useCartActions } from '../hooks/useCartActions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { formatPrice } from '../utils/format'
import toast from 'react-hot-toast'
import { Building2, Link2, Package, Search, ShoppingCart, Sparkles } from 'lucide-react'
import type { PublicSupplierProduct } from '../types'

function ProductCard({
  product,
  showPrice,
  onAdd,
  onRequestQuote,
  canOrder,
}: {
  product: PublicSupplierProduct
  showPrice: boolean
  onAdd?: (product: PublicSupplierProduct) => void
  onRequestQuote?: (product: PublicSupplierProduct) => void
  canOrder: boolean
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{product.name}</CardTitle>
          {product.inStock === false ? (
            <Badge variant="secondary">Out of stock</Badge>
          ) : product.inStock ? (
            <Badge variant="outline">In stock</Badge>
          ) : null}
        </div>
        <CardDescription className="text-xs">
          {product.sku}
          {product.unit ? ` · ${product.unit}` : ''}
          {product.category ? ` · ${product.category}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {product.description && (
          <p className="text-sm text-[var(--text-muted)] line-clamp-2">{product.description}</p>
        )}
        {showPrice && product.currentPrice != null && (
          <p className="text-lg font-semibold text-[var(--text)]">
            {formatPrice(product.currentPrice)}
          </p>
        )}
        {!showPrice && (
          <p className="text-sm text-[var(--text-muted)]">Log in to see pricing and order.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canOrder && onAdd && product.inStock !== false && (
            <Button size="sm" onClick={() => onAdd(product)}>
              <ShoppingCart className="h-4 w-4 mr-1" />
              Add to cart
            </Button>
          )}
          {canOrder && onRequestQuote && (
            <Button size="sm" variant="outline" onClick={() => onRequestQuote(product)}>
              Request best price
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function PublicSupplierCatalogPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  const { addItem } = useCartActions()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)

  const {
    data: supplier,
    isLoading: loadingSupplier,
    isError: supplierError,
  } = useGetPublicSupplierQuery(idOrSlug ?? '', { skip: !idOrSlug })

  const productArgs = useMemo(
    () => ({
      idOrSlug: idOrSlug ?? '',
      page,
      limit: 24,
      q: search || undefined,
      category: category || undefined,
    }),
    [idOrSlug, page, search, category]
  )

  const {
    data: publicProducts,
    isLoading: loadingPublicProducts,
    isFetching,
  } = useGetPublicSupplierProductsQuery(productArgs, { skip: !idOrSlug || isRestaurant })

  const { data: pricedProducts, isLoading: loadingPricedProducts } =
    useGetPublicSupplierPricedProductsQuery(productArgs, { skip: !idOrSlug || !isRestaurant })

  const catalog = isRestaurant ? pricedProducts : publicProducts
  const loadingProducts = isRestaurant ? loadingPricedProducts : loadingPublicProducts

  const brandStyle = useMemo(() => {
    if (!supplier?.brandPrimary) return undefined
    return {
      ['--brand-primary' as string]: supplier.brandPrimary,
      ['--brand-mid' as string]: supplier.brandAccent || supplier.brandPrimary,
    } as React.CSSProperties
  }, [supplier])

  const handleAddToCart = (product: PublicSupplierProduct) => {
    if (!supplier) return
    addItem({
      productId: product.id,
      quantity: 1,
      product: {
        id: product.id,
        supplier_id: supplier.id,
        sku: product.sku,
        name: product.name,
        description: product.description || undefined,
        category: product.category || undefined,
        unit: product.unit || undefined,
        image_url: product.imageUrl || undefined,
        supplier_name: supplier.brandDisplayName || supplier.name,
        supplier_slug: supplier.slug,
        current_price: product.currentPrice ?? undefined,
        currency: product.currency,
        created_at: '',
        updated_at: '',
      },
    })
    toast.success('Added to cart')
  }

  const handleRequestQuote = (product: PublicSupplierProduct) => {
    if (!supplier) return
    navigate('/app/quote-requests/new', {
      state: {
        prefill: {
          items: [{ productId: product.id, quantity: 1 }],
          supplierIds: [supplier.id],
        },
      },
    })
  }

  if (loadingSupplier) {
    return (
      <div className="min-h-screen bg-[var(--app-bg)] p-6">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (supplierError || !supplier) {
    return (
      <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center p-6">
        <EmptyState
          title="Catalog not found"
          description="This supplier catalog is unavailable or has been disabled."
          icon={<Package className="h-6 w-6" />}
          action={
            <Button asChild variant="outline">
              <Link to="/login">Log in</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const displayName = supplier.brandDisplayName || supplier.name
  const products = catalog?.products ?? []
  const categories = catalog?.categories ?? []
  const total = catalog?.pagination?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (catalog?.pagination?.limit || 24)))

  return (
    <div className="min-h-screen bg-[var(--app-bg)]" style={brandStyle}>
      <header className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {supplier.logoUrl ? (
                <img
                  src={supplier.logoUrl}
                  alt=""
                  className="h-16 w-16 rounded-xl border object-contain bg-white"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                  <Building2 className="h-8 w-8" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-[var(--text-muted)] flex items-center gap-1">
                  <Sparkles className="h-4 w-4" />
                  Supplier catalog
                </p>
                <h1 className="text-2xl font-bold text-[var(--text)]">{displayName}</h1>
                {supplier.paymentTerms && (
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Terms: {supplier.paymentTerms}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!user && (
                <>
                  <Button asChild>
                    <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
                      Log in to order
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/register">Request access</Link>
                  </Button>
                </>
              )}
              {isRestaurant && (
                <Button asChild variant="outline">
                  <Link to={`/app/suppliers/${supplier.id}`}>View in app</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              className="pl-9"
              placeholder="Search products…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          {categories.length > 0 && (
            <select
              className="h-10 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
        </div>

        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="This supplier has not published any products to their catalog."
            icon={<Package className="h-6 w-6" />}
          />
        ) : (
          <>
            <p className="text-sm text-[var(--text-muted)]">
              {total} product{total === 1 ? '' : 's'}
              {isFetching ? ' · Updating…' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  showPrice={isRestaurant}
                  canOrder={isRestaurant}
                  onAdd={handleAddToCart}
                  onRequestQuote={handleRequestQuote}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-[var(--text-muted)] self-center">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}

        <Card className="border-dashed">
          <CardContent className="py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Link2 className="h-4 w-4" />
              Share this catalog with your team or buyers.
            </div>
            {!user && (
              <Button asChild variant="secondary">
                <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
                  Log in to order
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
