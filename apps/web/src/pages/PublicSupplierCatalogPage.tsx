import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useGetPublicSupplierQuery,
  useGetPublicSupplierProductsQuery,
  useGetPublicSupplierPricedProductsQuery,
} from '../services/api'
import { useAppSelector } from '../hooks/redux'
import { useCartActions } from '../hooks/useCartActions'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { PublicPageLayout, PublicPanel } from '../components/public/PublicPageLayout'
import { formatPrice } from '../utils/format'
import { toast } from 'sonner'
import { Link2, Package, Search, ShoppingCart } from 'lucide-react'
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
    <article className="consumer-menu-item flex h-full flex-col rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-medium leading-snug text-[var(--text)]">{product.name}</h3>
        {product.inStock === false ? (
          <Badge variant="secondary">Out of stock</Badge>
        ) : product.inStock ? (
          <Badge variant="outline">In stock</Badge>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {product.sku}
        {product.unit ? ` · ${product.unit}` : ''}
        {product.category ? ` · ${product.category}` : ''}
      </p>
      <div className="mt-3 flex flex-1 flex-col gap-3">
        {product.description && (
          <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{product.description}</p>
        )}
        {showPrice && product.currentPrice != null && (
          <p className="text-base font-semibold tabular-nums text-[var(--text)]">
            {formatPrice(product.currentPrice)}
          </p>
        )}
        {!showPrice && (
          <p className="text-sm text-[var(--text-muted)]">Log in to see pricing and order.</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {canOrder && onAdd && product.inStock !== false && (
            <Button size="sm" className="consumer-pressable" onClick={() => onAdd(product)}>
              <ShoppingCart className="mr-1 h-4 w-4" />
              Add to cart
            </Button>
          )}
          {canOrder && onRequestQuote && (
            <Button
              size="sm"
              variant="outline"
              className="consumer-pressable"
              onClick={() => onRequestQuote(product)}
            >
              Request best price
            </Button>
          )}
        </div>
      </div>
    </article>
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
      <PublicPageLayout wide title="Supplier catalog">
        <Skeleton className="mb-6 h-14 w-14 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </PublicPageLayout>
    )
  }

  if (supplierError || !supplier) {
    return (
      <PublicPageLayout
        wide
        centered
        title="Catalog not found"
        subtitle="This supplier catalog is unavailable or has been disabled."
      >
        <EmptyState
          title="Nothing to show"
          description="The link may be wrong or the supplier has disabled public access."
          icon={<Package className="h-6 w-6" />}
          action={
            <Button asChild variant="outline" className="consumer-pressable">
              <Link to="/login">Log in</Link>
            </Button>
          }
        />
      </PublicPageLayout>
    )
  }

  const displayName = supplier.brandDisplayName || supplier.name
  const products = catalog?.products ?? []
  const categories = catalog?.categories ?? []
  const total = catalog?.pagination?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (catalog?.pagination?.limit || 24)))

  return (
    <PublicPageLayout
      wide
      title={displayName}
      subtitle={
        supplier.paymentTerms
          ? `Payment terms: ${supplier.paymentTerms}`
          : 'Browse products and request pricing.'
      }
      logoUrl={supplier.logoUrl}
      logoInitial={displayName.charAt(0).toUpperCase()}
      className="pb-12"
      style={brandStyle}
    >
      <div className="mb-6 flex flex-wrap gap-2">
        {!user && (
          <>
            <Button
              asChild
              className="consumer-pressable bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
            >
              <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
                Log in to order
              </Link>
            </Button>
            <Button asChild variant="outline" className="consumer-pressable">
              <Link to="/register">Request access</Link>
            </Button>
          </>
        )}
        {isRestaurant && (
          <Button asChild variant="outline" className="consumer-pressable">
            <Link to={`/app/suppliers/${supplier.id}`}>View in app</Link>
          </Button>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <Input
            className="h-11 pl-9 shadow-none"
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
            className="h-11 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            {total} product{total === 1 ? '' : 's'}
            {isFetching ? ' · Updating…' : ''}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className="flex justify-center gap-2 pt-8">
              <Button
                variant="outline"
                size="sm"
                className="consumer-pressable"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="self-center text-sm text-[var(--text-muted)]">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="consumer-pressable"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <PublicPanel className="mt-8 border-dashed">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Link2 className="h-4 w-4 shrink-0" aria-hidden />
            Share this catalog with your team or buyers.
          </div>
          {!user && (
            <Button asChild variant="secondary" className="consumer-pressable shrink-0">
              <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
                Log in to order
              </Link>
            </Button>
          )}
        </div>
      </PublicPanel>
    </PublicPageLayout>
  )
}
