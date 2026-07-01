import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
import { CategoryNav } from '../components/consumer/CategoryNav'
import { formatPrice } from '../utils/format'
import { copyToClipboard } from '../utils/clipboard'
import { toast } from 'sonner'
import {
  Check,
  ClipboardCopy,
  Link2,
  Lock,
  LogIn,
  Package,
  Search,
  ShoppingCart,
  UserPlus,
} from 'lucide-react'
import type { PublicSupplierProduct } from '../types'
import { ensureNamespace } from '../i18n'

function ProductCard({
  product,
  showPrice,
  onAdd,
  onRequestQuote,
  canOrder,
  loginHref,
}: {
  product: PublicSupplierProduct
  showPrice: boolean
  onAdd?: (product: PublicSupplierProduct) => void
  onRequestQuote?: (product: PublicSupplierProduct) => void
  canOrder: boolean
  loginHref: string
}) {
  const { t } = useTranslation('public')
  const initial = product.name.charAt(0).toUpperCase()

  return (
    <article className="consumer-menu-item flex h-full flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          aria-hidden
          className="flex aspect-[4/3] w-full items-center justify-center bg-[var(--brand-pale)] text-3xl font-semibold text-[var(--brand-mid)]"
        >
          {initial}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-medium leading-snug text-[var(--text)]">{product.name}</h3>
          {product.inStock === false ? (
            <Badge variant="secondary" className="shrink-0">
              {t('catalog.product.outOfStock')}
            </Badge>
          ) : product.inStock ? (
            <Badge
              variant="outline"
              className="shrink-0 border-[var(--mint)]/30 text-[var(--mint)]"
            >
              {t('catalog.product.inStock')}
            </Badge>
          ) : null}
        </div>

        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {product.sku}
          {product.unit ? ` · ${product.unit}` : ''}
        </p>

        {product.category && (
          <p className="mt-2">
            <span className="inline-flex rounded-full bg-[var(--brand-ultra)] px-2 py-0.5 text-xs font-medium text-[var(--text-mid)]">
              {product.category}
            </span>
          </p>
        )}

        <div className="mt-3 flex flex-1 flex-col gap-3">
          {product.description && (
            <p className="line-clamp-2 text-sm leading-relaxed text-[var(--text-mid)]">
              {product.description}
            </p>
          )}

          {showPrice && product.currentPrice != null ? (
            <p className="text-lg font-semibold tabular-nums text-[var(--text)]">
              {formatPrice(product.currentPrice)}
            </p>
          ) : (
            <Link
              to={loginHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-mid)] hover:text-[var(--brand)]"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('catalog.product.signInForPricing')}
            </Link>
          )}

          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {canOrder && onAdd && product.inStock !== false && (
              <Button size="sm" className="consumer-pressable" onClick={() => onAdd(product)}>
                <ShoppingCart className="mr-1 h-4 w-4" />
                {t('catalog.product.addToCart')}
              </Button>
            )}
            {canOrder && onRequestQuote && (
              <Button
                size="sm"
                variant="outline"
                className="consumer-pressable"
                onClick={() => onRequestQuote(product)}
              >
                {t('catalog.product.requestBestPrice')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function CatalogStats({
  productCount,
  paymentTerms,
  minimumOrderAmount,
}: {
  productCount: number
  paymentTerms?: string | null
  minimumOrderAmount?: number | null
}) {
  const { t } = useTranslation('public')
  const columns =
    1 + (paymentTerms ? 1 : 0) + (minimumOrderAmount != null && minimumOrderAmount > 0 ? 1 : 0)
  const gridClass =
    columns >= 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1'

  return (
    <dl
      className={`mb-6 grid grid-cols-1 divide-y divide-[var(--app-border)] overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] ${gridClass} sm:divide-x sm:divide-y-0`}
    >
      <div className="px-4 py-3 text-center sm:text-left">
        <dt className="text-xs font-medium text-[var(--text-muted)]">
          {t('catalog.stats.catalog')}
        </dt>
        <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">
          {t('catalog.stats.product', { count: productCount })}
        </dd>
      </div>
      {paymentTerms && (
        <div className="px-4 py-3 text-center sm:text-left">
          <dt className="text-xs font-medium text-[var(--text-muted)]">
            {t('catalog.stats.paymentTerms')}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--text)]">{paymentTerms}</dd>
        </div>
      )}
      {minimumOrderAmount != null && minimumOrderAmount > 0 && (
        <div className="px-4 py-3 text-center sm:text-left">
          <dt className="text-xs font-medium text-[var(--text-muted)]">
            {t('catalog.stats.minimumOrder')}
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">
            {formatPrice(minimumOrderAmount)}
          </dd>
        </div>
      )}
    </dl>
  )
}

function GuestAccessPanel({ loginHref }: { loginHref: string }) {
  const { t } = useTranslation('public')

  return (
    <PublicPanel className="mb-6 border-[var(--brand-light)]/25 bg-[color-mix(in_srgb,var(--brand-pale)_45%,var(--surface))]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-[var(--text)]">{t('catalog.guestPanel.title')}</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-mid)]">
            {t('catalog.guestPanel.description')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            asChild
            size="sm"
            className="consumer-pressable bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
          >
            <Link to={loginHref}>
              <LogIn className="mr-1.5 h-4 w-4" />
              {t('catalog.logInToOrder')}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="consumer-pressable">
            <Link to="/register">
              <UserPlus className="mr-1.5 h-4 w-4" />
              {t('catalog.requestAccess')}
            </Link>
          </Button>
        </div>
      </div>
    </PublicPanel>
  )
}

export function PublicSupplierCatalogPage({
  forcedSlug,
  whiteLabel = false,
}: {
  forcedSlug?: string
  whiteLabel?: boolean
} = {}) {
  const { t } = useTranslation('public')
  const { idOrSlug: paramSlug } = useParams<{ idOrSlug: string }>()
  const idOrSlug = forcedSlug || paramSlug
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  const { addItem } = useCartActions()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    void ensureNamespace('public')
  }, [])

  const catalogPath =
    typeof window !== 'undefined' ? window.location.pathname : `/supplier/${idOrSlug ?? ''}`
  const loginHref = `/login?redirect=${encodeURIComponent(catalogPath)}`

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

  const categoryNavItems = useMemo(() => {
    const list = (catalog?.categories ?? []).map((name) => ({ id: name, name }))
    if (list.length === 0) return []
    return [{ id: '', name: t('catalog.categoryAll') }, ...list]
  }, [catalog?.categories, t])

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
    toast.success(t('catalog.toast.addedToCart'))
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

  const handleCopyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : catalogPath
    const ok = await copyToClipboard(url)
    if (ok) {
      setLinkCopied(true)
      toast.success(t('catalog.toast.linkCopied'))
      window.setTimeout(() => setLinkCopied(false), 2000)
    } else {
      toast.error(t('catalog.toast.copyFailed'))
    }
  }

  if (loadingSupplier) {
    return (
      <PublicPageLayout wide title={t('catalog.loadingTitle')}>
        <Skeleton className="mb-6 h-16 w-full rounded-xl" />
        <Skeleton className="mb-6 h-11 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
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
        title={t('catalog.notFoundTitle')}
        subtitle={t('catalog.notFoundSubtitle')}
      >
        <EmptyState
          title={t('catalog.emptyTitle')}
          description={t('catalog.emptyDescription')}
          icon={<Package className="h-6 w-6" />}
          action={
            <Button asChild variant="outline" className="consumer-pressable">
              <Link to="/login">{t('catalog.logIn')}</Link>
            </Button>
          }
        />
      </PublicPageLayout>
    )
  }

  const displayName = supplier.brandDisplayName || supplier.name
  const products = catalog?.products ?? []
  const categories = catalog?.categories ?? []
  const total = catalog?.pagination?.total ?? supplier.productCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (catalog?.pagination?.limit || 24)))

  const headerActions = !user ? (
    <>
      <Button
        asChild
        size="sm"
        className="consumer-pressable bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
      >
        <Link to={loginHref}>
          <LogIn className="mr-1.5 h-4 w-4" />
          {t('catalog.logInToOrder')}
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline" className="consumer-pressable">
        <Link to="/register">
          <UserPlus className="mr-1.5 h-4 w-4" />
          {t('catalog.requestAccess')}
        </Link>
      </Button>
    </>
  ) : isRestaurant ? (
    <Button asChild size="sm" variant="outline" className="consumer-pressable">
      <Link to={`/app/suppliers/${supplier.id}`}>{t('catalog.viewInApp')}</Link>
    </Button>
  ) : null

  return (
    <PublicPageLayout
      wide
      title={displayName}
      subtitle={
        supplier.paymentTerms
          ? t('catalog.subtitleWithTerms', { terms: supplier.paymentTerms })
          : t('catalog.subtitleDefault')
      }
      logoUrl={supplier.logoUrl}
      logoInitial={displayName.charAt(0).toUpperCase()}
      headerActions={headerActions}
      className="pb-12"
      style={brandStyle}
    >
      <CatalogStats
        productCount={total}
        paymentTerms={supplier.paymentTerms}
        minimumOrderAmount={supplier.minimumOrderAmount}
      />

      {!user && !whiteLabel && <GuestAccessPanel loginHref={loginHref} />}

      <div className="mb-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <Input
            className="h-11 pl-9 shadow-none"
            placeholder={t('catalog.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            aria-label={t('catalog.searchAriaLabel')}
          />
        </div>
      </div>

      {categoryNavItems.length > 0 && (
        <CategoryNav
          className="-mx-4 mb-4 sm:-mx-6 sm:px-6"
          sticky={false}
          ariaLabel={t('catalog.categoryAriaLabel')}
          categories={categoryNavItems}
          activeCategoryId={category}
          onSelect={(id) => {
            setCategory(id)
            setPage(1)
          }}
        />
      )}

      {categories.length > 0 && categoryNavItems.length === 0 && (
        <div className="mb-4">
          <select
            className="h-11 w-full rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] sm:w-auto"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(1)
            }}
            aria-label={t('catalog.filterCategoryAriaLabel')}
          >
            <option value="">{t('catalog.allCategories')}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      )}

      {loadingProducts ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title={
            search || category ? t('catalog.emptyFilteredTitle') : t('catalog.emptyDefaultTitle')
          }
          description={
            search || category
              ? t('catalog.emptyFilteredDescription')
              : t('catalog.emptyDefaultDescription')
          }
          icon={<Package className="h-6 w-6" />}
          action={
            search || category ? (
              <Button
                variant="outline"
                className="consumer-pressable"
                onClick={() => {
                  setSearch('')
                  setCategory('')
                  setPage(1)
                }}
              >
                {t('catalog.clearFilters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            {t('catalog.showing', { shown: products.length, total })}
            {isFetching ? ` ${t('catalog.updating')}` : ''}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                showPrice={isRestaurant}
                canOrder={isRestaurant}
                loginHref={loginHref}
                onAdd={handleAddToCart}
                onRequestQuote={handleRequestQuote}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <nav
              className="flex justify-center gap-2 pt-8"
              aria-label={t('catalog.paginationAriaLabel')}
            >
              <Button
                variant="outline"
                size="sm"
                className="consumer-pressable"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('catalog.previous')}
              </Button>
              <span className="self-center text-sm text-[var(--text-muted)]">
                {t('catalog.pageOf', { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="consumer-pressable"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('catalog.next')}
              </Button>
            </nav>
          )}
        </>
      )}

      <PublicPanel className="mt-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
              <Link2 className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-[var(--text)]">{t('catalog.share.title')}</p>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                {t('catalog.share.description')}
              </p>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="consumer-pressable flex-1 sm:flex-none"
              onClick={() => void handleCopyLink()}
            >
              {linkCopied ? (
                <>
                  <Check className="mr-1.5 h-4 w-4 text-[var(--mint)]" />
                  {t('catalog.share.copied')}
                </>
              ) : (
                <>
                  <ClipboardCopy className="mr-1.5 h-4 w-4" />
                  {t('catalog.share.copyLink')}
                </>
              )}
            </Button>
            {!user && (
              <Button
                asChild
                size="sm"
                className="consumer-pressable flex-1 bg-[var(--brand-mid)] hover:bg-[var(--brand)] sm:flex-none"
              >
                <Link to={loginHref}>{t('catalog.logInToOrder')}</Link>
              </Button>
            )}
          </div>
        </div>
      </PublicPanel>
    </PublicPageLayout>
  )
}
