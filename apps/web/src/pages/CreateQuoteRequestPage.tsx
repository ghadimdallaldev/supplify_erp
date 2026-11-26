import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useCreateQuoteRequestMutation,
  useGetProductsQuery,
  useGetSuppliersQuery,
} from '../services/api'
import { Checkbox } from '../components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { toast } from 'sonner'
import { ArrowLeft, Send } from 'lucide-react'
import type { Product, Supplier } from '../types'
import { ensureNamespace } from '../i18n'
import { Badge } from '../components/ui/badge'
import { useDebouncedSearch } from '../hooks/useDebouncedSearch'
import { useAccumulatedPages } from '../hooks/useAccumulatedPages'

const PICKER_PAGE_SIZE = 20

type PrefillState = {
  items?: Array<{ productId: string; quantity: number }>
  supplierIds?: string[]
}

export function CreateQuoteRequestPage() {
  const { t } = useTranslation('quotes')

  useEffect(() => {
    void ensureNamespace('quotes')
  }, [])

  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as { prefill?: PrefillState } | null)?.prefill

  const { search, setSearch, debouncedSearch: productQuery } = useDebouncedSearch('', 250)
  const {
    search: supplierSearch,
    setSearch: setSupplierSearch,
    debouncedSearch: supplierQuery,
  } = useDebouncedSearch('', 250)
  const [productOffset, setProductOffset] = useState(0)
  const [supplierOffset, setSupplierOffset] = useState(0)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [neededBy, setNeededBy] = useState('')

  // Both pickers search and page on the server (quotes may go to any supplier, spec §11.4);
  // followed suppliers come first and are marked.
  useEffect(() => setProductOffset(0), [productQuery])
  useEffect(() => setSupplierOffset(0), [supplierQuery])
  const {
    data: productsData,
    isLoading: loadingProducts,
    isFetching: fetchingProducts,
  } = useGetProductsQuery({
    q: productQuery || undefined,
    limit: PICKER_PAGE_SIZE,
    offset: productOffset,
  })
  const {
    data: suppliersData,
    isLoading: loadingSuppliers,
    isFetching: fetchingSuppliers,
  } = useGetSuppliersQuery({
    q: supplierQuery || undefined,
    sort: 'followed',
    limit: PICKER_PAGE_SIZE,
    offset: supplierOffset,
  })

  const [createQuoteRequest, { isLoading: submitting }] = useCreateQuoteRequestMutation()

  const products = useAccumulatedPages<Product>(productsData?.products, productOffset, productQuery)
  const suppliers = useAccumulatedPages<Supplier>(
    suppliersData?.suppliers,
    supplierOffset,
    supplierQuery
  )
  const productsTotal = Number(productsData?.pagination?.total ?? 0)
  const suppliersTotal = Number(suppliersData?.pagination?.total ?? 0)
  const hasMoreProducts =
    productOffset + PICKER_PAGE_SIZE < productsTotal ||
    Boolean(productsData?.pagination?.nextCursor)
  const hasMoreSuppliers = supplierOffset + PICKER_PAGE_SIZE < suppliersTotal

  useEffect(() => {
    if (!prefill) return
    if (prefill.items?.length) {
      setSelectedProductIds(new Set(prefill.items.map((i) => i.productId)))
      const q: Record<string, number> = {}
      prefill.items.forEach((i) => {
        q[i.productId] = i.quantity
      })
      setQuantities(q)
    }
    if (prefill.supplierIds?.length) {
      setSelectedSupplierIds(new Set(prefill.supplierIds))
    }
  }, [prefill])

  const toggleProduct = (product: Product) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(product.id)) {
        next.delete(product.id)
      } else {
        next.add(product.id)
        setQuantities((q) => ({ ...q, [product.id]: q[product.id] || 1 }))
      }
      return next
    })
  }

  const toggleSupplier = (supplierId: string) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev)
      if (next.has(supplierId)) next.delete(supplierId)
      else next.add(supplierId)
      return next
    })
  }

  const allProductsSelected =
    products.length > 0 && products.every((product) => selectedProductIds.has(product.id))
  const someProductsSelected = products.some((product) => selectedProductIds.has(product.id))
  const allSuppliersSelected =
    suppliers.length > 0 && suppliers.every((supplier) => selectedSupplierIds.has(supplier.id))
  const someSuppliersSelected = suppliers.some((supplier) => selectedSupplierIds.has(supplier.id))

  const productSelectAllRef = useRef<HTMLInputElement>(null)
  const supplierSelectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (productSelectAllRef.current) {
      productSelectAllRef.current.indeterminate = someProductsSelected && !allProductsSelected
    }
  }, [someProductsSelected, allProductsSelected])

  useEffect(() => {
    if (supplierSelectAllRef.current) {
      supplierSelectAllRef.current.indeterminate = someSuppliersSelected && !allSuppliersSelected
    }
  }, [someSuppliersSelected, allSuppliersSelected])

  const setAllProductsSelected = (checked: boolean) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        products.forEach((product) => next.add(product.id))
      } else {
        products.forEach((product) => next.delete(product.id))
      }
      return next
    })
    if (checked) {
      setQuantities((prev) => {
        const next = { ...prev }
        products.forEach((product) => {
          if (!next[product.id]) next[product.id] = 1
        })
        return next
      })
    }
  }

  const setAllSuppliersSelected = (checked: boolean) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        suppliers.forEach((supplier) => next.add(supplier.id))
      } else {
        suppliers.forEach((supplier) => next.delete(supplier.id))
      }
      return next
    })
  }

  const selectedItems = useMemo(
    () =>
      [...selectedProductIds].map((productId) => ({
        productId,
        quantity: quantities[productId] || 1,
      })),
    [selectedProductIds, quantities]
  )

  const handleSubmit = async () => {
    if (!selectedItems.length) {
      toast.error(t('create.selectProductError'))
      return
    }
    if (!selectedSupplierIds.size) {
      toast.error(t('create.selectSupplierError'))
      return
    }
    try {
      const result = await createQuoteRequest({
        items: selectedItems,
        supplierIds: [...selectedSupplierIds],
        note: note || undefined,
        neededBy: neededBy || undefined,
      }).unwrap()
      toast.success(t('create.sentSuccess'))
      navigate(`/app/quote-requests/${result.quoteRequest.id}`)
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('create.sendFailed'))
    }
  }

  return (
    <PageShell maxWidth="focused" className="space-y-6" data-testid="create-quote-request-page">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/app/quote-requests">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('common.back')}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('create.productsTitle')}</CardTitle>
            <CardDescription>{t('create.productsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder={t('create.searchProductsPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="quote-product-search"
            />
            {loadingProducts ? (
              <p className="text-sm text-[var(--text-muted)]">{t('create.loadingProducts')}</p>
            ) : products.length === 0 ? (
              <EmptyState
                title={t('create.noProductsTitle')}
                description={t('create.noProductsDescription')}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-subtle)]/50 px-3 py-2">
                  <label
                    htmlFor="select-all-products"
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium"
                  >
                    <Checkbox
                      ref={productSelectAllRef}
                      id="select-all-products"
                      checked={allProductsSelected}
                      onCheckedChange={setAllProductsSelected}
                      aria-label={t('create.selectAllProducts')}
                    />
                    <span>{t('create.selectAllProducts')}</span>
                    <span className="text-xs font-normal text-[var(--text-muted)]">
                      ({t('create.visibleCount', { count: products.length })})
                    </span>
                  </label>
                  {someProductsSelected && (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">
                      {t('create.selectedCount', { count: selectedProductIds.size })}
                    </span>
                  )}
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {products.map((product) => {
                    const checked = selectedProductIds.has(product.id)
                    return (
                      <div
                        key={product.id}
                        className="flex items-start gap-3 rounded-lg border border-[var(--app-border)] p-3"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(product)}
                          id={`product-${product.id}`}
                          className="mt-1 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={`product-${product.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {product.name}
                          </label>
                          <p className="text-xs text-[var(--text-muted)]">{product.sku}</p>
                          {checked && (
                            <div className="mt-2 flex items-center gap-2">
                              <Label htmlFor={`qty-${product.id}`} className="text-xs">
                                {t('common.qty')}
                              </Label>
                              <Input
                                id={`qty-${product.id}`}
                                type="number"
                                min={0.001}
                                step="any"
                                className="h-8 w-24"
                                value={quantities[product.id] ?? 1}
                                onChange={(e) =>
                                  setQuantities((q) => ({
                                    ...q,
                                    [product.id]: parseFloat(e.target.value) || 1,
                                  }))
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {hasMoreProducts && products.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={fetchingProducts}
                onClick={() => setProductOffset(productOffset + PICKER_PAGE_SIZE)}
              >
                {t('create.loadMoreProducts')}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('create.suppliersTitle')}</CardTitle>
              <CardDescription>{t('create.suppliersDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder={t('create.searchSuppliersPlaceholder')}
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                data-testid="quote-supplier-search"
              />
              {loadingSuppliers ? (
                <p className="text-sm text-[var(--text-muted)]">{t('create.loadingSuppliers')}</p>
              ) : suppliers.length === 0 ? (
                <EmptyState
                  title={t('create.noSuppliersTitle')}
                  description={t('create.noSuppliersDescription')}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-subtle)]/50 px-3 py-2">
                    <label
                      htmlFor="select-all-suppliers"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium"
                    >
                      <Checkbox
                        ref={supplierSelectAllRef}
                        id="select-all-suppliers"
                        checked={allSuppliersSelected}
                        onCheckedChange={setAllSuppliersSelected}
                        aria-label={t('create.selectAllSuppliers')}
                      />
                      <span>{t('create.selectAllSuppliers')}</span>
                      <span className="text-xs font-normal text-[var(--text-muted)]">
                        ({t('create.visibleCount', { count: suppliers.length })})
                      </span>
                    </label>
                    {someSuppliersSelected && (
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {t('create.selectedCount', { count: selectedSupplierIds.size })}
                      </span>
                    )}
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {suppliers.map((supplier) => (
                      <div
                        key={supplier.id}
                        className="flex items-center gap-3 rounded-lg border border-[var(--app-border)] p-3"
                        data-testid={`quote-supplier-${supplier.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSupplierIds.has(supplier.id)}
                          onChange={() => toggleSupplier(supplier.id)}
                          id={`supplier-${supplier.id}`}
                          className="rounded"
                        />
                        <label
                          htmlFor={`supplier-${supplier.id}`}
                          className="text-sm font-medium cursor-pointer flex-1"
                        >
                          {supplier.name}
                        </label>
                        {supplier.is_followed ? (
                          <Badge variant="secondary" className="shrink-0">
                            {t('common:marketplace.following')}
                          </Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {hasMoreSuppliers ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={fetchingSuppliers}
                      onClick={() => setSupplierOffset(supplierOffset + PICKER_PAGE_SIZE)}
                    >
                      {t('create.loadMoreSuppliers')}
                    </Button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('create.detailsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="needed-by">{t('create.neededByLabel')}</Label>
                <Input
                  id="needed-by"
                  type="date"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-note">{t('create.noteLabel')}</Label>
                <Textarea
                  id="quote-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('create.notePlaceholder')}
                />
              </div>
              <Button className="w-full" disabled={submitting} onClick={handleSubmit}>
                <Send className="h-4 w-4 mr-2" />
                {submitting ? t('common.sending') : t('create.sendQuoteRequest')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
