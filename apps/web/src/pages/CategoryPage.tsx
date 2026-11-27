import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileQuestion, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useGetProductCategoriesQuery, useGetProductsQuery } from '../services/api'
import { PageShell } from '../components/ui/page-shell'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { TablePagination } from '../components/ui/table-pagination'
import {
  CategoryBrowse,
  CategoryIconBadge,
  categoryPath,
} from '../components/marketplace/CategoryBrowse'
import { ProductCatalogRow } from '../components/products/ProductCatalogRow'
import { useDebouncedSearch } from '../hooks/useDebouncedSearch'
import { useCartActions } from '../hooks/useCartActions'
import { getProductMoq } from '../lib/orderQuantityRules'
import { localizedName } from '../lib/categoryLabel'
import { getLanguageDirection } from '../i18n/config'
import type { CategoryDepartment, CategoryNode, Product } from '../types'

const PAGE_SIZE = 24

type Resolved =
  | { kind: 'department'; node: CategoryDepartment; department: CategoryDepartment }
  | { kind: 'category'; node: CategoryNode; department: CategoryDepartment }

function resolveSlug(departments: CategoryDepartment[], slug: string | undefined): Resolved | null {
  if (!slug) return null
  for (const department of departments) {
    if (department.slug === slug) return { kind: 'department', node: department, department }
    const leaf = department.categories.find((c) => c.slug === slug)
    if (leaf) return { kind: 'category', node: leaf, department }
  }
  return null
}

/**
 * `/app/shop/category/:slug`: every visible supplier's products in a department or category,
 * with search, an in-stock filter and paging. Empty → ask suppliers for a quote.
 */
export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const { t, i18n } = useTranslation('products')
  const dir = getLanguageDirection(i18n.language)
  const { addItem } = useCartActions()
  const { search, setSearch, debouncedSearch } = useDebouncedSearch('')
  const [inStock, setInStock] = useState(false)
  const [offset, setOffset] = useState(0)

  const { data: tree, isLoading: treeLoading } = useGetProductCategoriesQuery()
  const resolved = useMemo(
    () => resolveSlug((tree?.departments ?? []) as CategoryDepartment[], slug),
    [tree?.departments, slug]
  )

  useEffect(() => setOffset(0), [slug, debouncedSearch, inStock])

  const { data, isLoading, isFetching } = useGetProductsQuery(
    {
      categoryId: resolved?.node.id,
      q: debouncedSearch || undefined,
      inStock: inStock || undefined,
      includeStock: true,
      limit: PAGE_SIZE,
      offset,
    },
    { skip: !resolved }
  )
  const products = (data?.products ?? []) as Product[]
  const total = data?.pagination?.total ?? null

  const name = resolved ? localizedName(resolved.node, i18n.language) : ''

  if (treeLoading) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-10 w-full" />
        <CategoryResultsSkeleton />
      </PageShell>
    )
  }

  if (!resolved) {
    return (
      <PageShell>
        <EmptyState
          title={t('categories.notFoundTitle')}
          description={t('categories.notFoundDescription')}
          icon={<FileQuestion className="h-10 w-10" aria-hidden />}
          action={
            <Button asChild variant="outline">
              <Link to="/app/products">{t('categories.backToCatalog')}</Link>
            </Button>
          }
        />
      </PageShell>
    )
  }

  const showEmpty = !isLoading && products.length === 0

  return (
    <PageShell>
      <div dir={dir} className="space-y-4">
        <nav
          aria-label={t('categories.breadcrumbLabel')}
          className="text-sm text-[var(--text-muted)]"
        >
          <Link to="/app/products" className="hover:underline">
            {t('categories.allCategories')}
          </Link>
          {resolved.kind === 'category' ? (
            <>
              <span className="mx-1.5" aria-hidden="true">
                /
              </span>
              <Link to={categoryPath(resolved.department.slug)} className="hover:underline">
                {localizedName(resolved.department, i18n.language)}
              </Link>
            </>
          ) : null}
        </nav>

        <header className="flex items-center gap-3">
          <CategoryIconBadge
            iconKey={resolved.node.icon_key}
            tintKey={resolved.kind === 'department' ? resolved.node.slug : resolved.department.slug}
          />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">{name}</h1>
            {!showEmpty && total != null ? (
              <p className="text-sm tabular-nums text-[var(--text-muted)]">
                {t('categories.resultsSummary', { count: total })}
              </p>
            ) : null}
          </div>
        </header>

        <CategoryBrowse railOnly departmentId={resolved.department.id} activeSlug={slug} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              aria-label={t('categories.searchInCategory', { name })}
              placeholder={t('categories.searchInCategory', { name })}
              className="ps-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-mid)]">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => setInStock(e.target.checked)}
            />
            {t('categories.inStockOnly')}
          </label>
        </div>

        {isLoading ? (
          <CategoryResultsSkeleton />
        ) : showEmpty ? (
          <EmptyState
            title={
              debouncedSearch || inStock
                ? t('categories.noMatchesTitle')
                : t('categories.emptyTitle')
            }
            description={t('categories.emptyDescription')}
            icon={<FileQuestion className="h-10 w-10" aria-hidden />}
            action={
              <Button asChild>
                <Link to="/app/quote-requests/new">{t('categories.requestQuote')}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div
              data-testid="category-results"
              aria-busy={isFetching}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {products.map((product) => (
                <div
                  key={product.id}
                  data-testid={`category-product-${product.id}`}
                  className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3"
                >
                  <ProductCatalogRow
                    product={product}
                    isSupplier={false}
                    showFavorite={false}
                    layout="card"
                    onAddToCart={(p) => {
                      addItem({ productId: p.id, product: p, quantity: getProductMoq(p) })
                      toast.success(t('toast.addedToCart'))
                    }}
                    onAdjustStock={() => {}}
                  />
                </div>
              ))}
            </div>
            {total != null && total > PAGE_SIZE ? (
              <TablePagination
                summary={t('categories.pageSummary', {
                  start: offset + 1,
                  end: Math.min(offset + PAGE_SIZE, total),
                  total,
                })}
                isFetching={isFetching}
                hasPrevPage={offset > 0}
                hasNextPage={offset + PAGE_SIZE < total}
                onPrev={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                onNext={() => setOffset((o) => o + PAGE_SIZE)}
                prevLabel={t('categories.previousPage')}
                nextLabel={t('categories.nextPage')}
              />
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  )
}

function CategoryResultsSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-[var(--app-border)] p-3">
          <div className="flex gap-3">
            <Skeleton className="h-14 w-14 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}
