import { Suspense, useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useGetProductsQuery,
  useGetProductCategoriesQuery,
  useGetProductTagsQuery,
  useCreateProductMutation,
  useGeneratePresignedUrlMutation,
  useGetWarehousesQuery,
  useGetSuppliersQuery,
  useGetActivePromotionsQuery,
  useGetEntitlementsQuery,
  useFavoriteProductMutation,
  useUnfavoriteProductMutation,
} from '../services/api'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { EmptyState } from '../components/ui/empty-state'
import { filterControlClass } from '../components/ui/filter-control'
import { DataTableShell } from '../components/ui/data-table-shell'
import { cn } from '../lib/utils'
import {
  Plus,
  Upload,
  Image,
  FileQuestion,
  Heart,
  ChevronLeft,
  ChevronRight,
  Package,
  Loader2,
} from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { useImpersonation } from '../hooks/useImpersonation'
import { useCartActions } from '../hooks/useCartActions'
import { toast } from 'sonner'
import { canUseSupplierDeals } from '../lib/planFeatureGates'
import { PermissionGate } from '../components/PermissionGate'
import { RequirePermission } from '../components/RequirePermission'
import { usePermissions } from '../hooks/usePermissions'
import {
  EMPTY_PRODUCT_FORM,
  ProductsPageLoading,
  type ProductFormState,
} from '../components/products/productsShared'
import {
  ProductFilterFields,
  ProductTagFilters,
  ProductActiveFilters,
} from '../components/products/ProductFilters'
import { ProductCatalogTable } from '../components/products/ProductCatalogTable'
import { useDebouncedSearch } from '../hooks/useDebouncedSearch'
import { useProductCatalogImport } from '../hooks/useProductCatalogImport'
import { SearchHistoryDropdown } from '../components/search/SearchHistoryDropdown'
import {
  LazyProductFormDialog,
  LazyProductBulkUploadDialog,
  LazyProductImageImportDialog,
  LazyInventoryAdjustmentDialog,
} from '../components/products/lazyProductDialogs'

const PRODUCTS_PAGE_SIZE = 50

export function ProductsPage() {
  const { t } = useTranslation('products')
  const [searchParams] = useSearchParams()
  const searchFromUrl = searchParams.get('q') ?? ''
  const { search, setSearch, debouncedSearch } = useDebouncedSearch(searchFromUrl)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [category, setCategory] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [showImageImport, setShowImageImport] = useState(false)
  const [showInventoryAdjustment, setShowInventoryAdjustment] = useState(false)
  const [selectedProductForAdjustment, setSelectedProductForAdjustment] = useState<any>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<any[]>([])
  const [productImage, setProductImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE'>('ADD')
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjustmentNotes, setAdjustmentNotes] = useState('')
  const [productForm, setProductForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM)
  const [newTag, setNewTag] = useState('')
  const { addItem } = useCartActions()
  const { user } = useAppSelector((state) => state.auth)
  const { isEffectiveSupplier, isEffectiveRestaurant } = useImpersonation()
  const { can } = usePermissions()
  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation()
  const [favoriteProduct] = useFavoriteProductMutation()
  const [unfavoriteProduct] = useUnfavoriteProductMutation()
  const [generatePresignedUrl, { isLoading: isUploadingImage }] = useGeneratePresignedUrlMutation()

  const isSupplier = isEffectiveSupplier
  const isRestaurant = isEffectiveRestaurant
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !isRestaurant })
  const supplierDealsEnabled = canUseSupplierDeals(entitlementsData?.entitlements)
  const { data: activeDealsData } = useGetActivePromotionsQuery(undefined, {
    skip: !isRestaurant || !supplierDealsEnabled,
  })
  const activeDeals = activeDealsData?.promotions || []

  const { data: warehousesData } = useGetWarehousesQuery(undefined, {
    skip: !isSupplier || !can('WAREHOUSES_VIEW'),
  })
  const { data: suppliersData } = useGetSuppliersQuery({ limit: 100 }, { skip: isSupplier })
  const { data: categoriesData } = useGetProductCategoriesQuery()
  const { data: tagsData } = useGetProductTagsQuery()

  const uniqueSuppliers = useMemo(() => {
    if (isSupplier) return []
    const byId = new Map<string, { id: string; name: string }>()
    for (const s of suppliersData?.suppliers ?? []) {
      if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name })
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [isSupplier, suppliersData?.suppliers])

  const queryParams = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      category: category || undefined,
      categoryId: categoryId || undefined,
      tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
      minPrice: minPrice ? minPrice : undefined,
      maxPrice: maxPrice ? maxPrice : undefined,
      supplier: !isSupplier && supplierFilter ? supplierFilter : undefined,
      includeStock: true,
      favoritesOnly: isRestaurant && favoritesOnly ? true : undefined,
      limit: PRODUCTS_PAGE_SIZE,
      ...(cursor ? { cursor } : { offset }),
    }),
    [
      debouncedSearch,
      category,
      categoryId,
      selectedTags,
      minPrice,
      maxPrice,
      isRestaurant,
      favoritesOnly,
      isSupplier,
      supplierFilter,
      offset,
      cursor,
    ]
  )

  useEffect(() => {
    setOffset(0)
    setCursor(undefined)
    setCursorHistory([])
  }, [
    debouncedSearch,
    category,
    categoryId,
    selectedTags,
    minPrice,
    maxPrice,
    supplierFilter,
    favoritesOnly,
  ])

  const { data, isLoading, isFetching, error, refetch } = useGetProductsQuery(queryParams)

  const clearBulkUpload = useCallback(() => {
    setShowBulkUpload(false)
    setUploadedFile(null)
    setUploadPreview([])
  }, [])

  const {
    importSummary,
    importPreviewMeta,
    importErrors,
    importJob,
    importJobActive,
    importing,
    previewImportFile,
    downloadErrorReport,
    submitImport,
  } = useProductCatalogImport({ refetch, onImportSuccess: clearBulkUpload })

  const allProducts = useMemo(() => data?.products ?? [], [data?.products])
  const filteredProducts = useMemo(() => {
    if (!isSupplier) return allProducts
    const email = user?.email?.trim().toLowerCase()
    if (!email) return allProducts
    return allProducts.filter((p) => p.supplier_email?.trim().toLowerCase() === email)
  }, [allProducts, isSupplier, user?.email])

  const pagination = data?.pagination
  const total = pagination?.total ?? null
  const pageSize = pagination?.limit ?? PRODUCTS_PAGE_SIZE
  const usesCursorPagination = Boolean(cursor)
  const rangeStart =
    filteredProducts.length === 0
      ? 0
      : usesCursorPagination
        ? cursorHistory.length * pageSize + 1
        : offset + 1
  const rangeEnd =
    filteredProducts.length === 0
      ? 0
      : usesCursorPagination
        ? rangeStart + filteredProducts.length - 1
        : total != null
          ? Math.min(offset + pageSize, total)
          : offset + filteredProducts.length
  const hasNextPage = usesCursorPagination
    ? Boolean(pagination?.nextCursor)
    : total != null
      ? offset + pageSize < total
      : Boolean(pagination?.nextCursor)
  const hasPrevPage = cursorHistory.length > 0 || Boolean(cursor) || offset > 0
  const showInitialLoad = isLoading && !data

  useEffect(() => {
    setSearch(searchFromUrl)
  }, [searchFromUrl, setSearch])

  const goToNextPage = () => {
    if (pagination?.nextCursor) {
      setCursorHistory((prev) => [...prev, cursor ?? ''])
      setCursor(pagination.nextCursor ?? undefined)
      return
    }
    setOffset((prev) => prev + PRODUCTS_PAGE_SIZE)
  }

  const goToPrevPage = () => {
    if (cursorHistory.length > 0) {
      const history = [...cursorHistory]
      const previousCursor = history.pop()
      setCursorHistory(history)
      setCursor(previousCursor || undefined)
      return
    }
    setOffset((prev) => Math.max(0, prev - PRODUCTS_PAGE_SIZE))
  }

  const handleAddToCart = (product: any) => {
    addItem({ productId: product.id, product, quantity: 1 })
    toast.success(t('toast.addedToCart'))
  }

  const handleToggleFavorite = async (product: any) => {
    try {
      if (product.is_favorited) {
        await unfavoriteProduct(product.id).unwrap()
        toast.success(t('toast.removedFromFavorites'))
      } else {
        await favoriteProduct({ productId: product.id }).unwrap()
        toast.success(t('toast.addedToFavorites'))
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('toast.favoriteUpdateFailed'))
    }
  }

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('toast.uploadImageFile'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('toast.imageTooLarge'))
      return
    }
    setProductImage(file)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmitProduct = async () => {
    try {
      let imageUrl = productForm.image_url
      if (productImage) {
        try {
          const ext = productImage.name.split('.').pop()
          const fileName = `products/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
          const presignedResponse = await generatePresignedUrl({
            fileType: productImage.type,
            fileName,
            fileSize: productImage.size,
          }).unwrap()
          const uploadUrl =
            presignedResponse.presignedUrl || (presignedResponse as { url?: string }).url
          if (!uploadUrl) throw new Error('Missing upload URL from server')
          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: productImage,
            headers: { 'Content-Type': productImage.type },
          })
          if (!uploadResponse.ok) throw new Error('Failed to upload image')
          imageUrl = presignedResponse.publicUrl || uploadUrl.split('?')[0]
        } catch (error: any) {
          toast.error(error?.data?.error?.message || t('toast.imageUploadFailed'))
          return
        }
      }
      await createProduct({
        name: productForm.name,
        sku: productForm.sku,
        description: productForm.description,
        category: productForm.category || undefined,
        category_id: productForm.category_id || undefined,
        tags: productForm.tags.length > 0 ? productForm.tags : undefined,
        unit: productForm.unit,
        price: parseFloat(productForm.price),
        initialStock: parseFloat(productForm.initialStock),
        image_url: imageUrl || undefined,
        warehouse_id: productForm.warehouse_id || undefined,
      }).unwrap()
      toast.success(t('toast.productCreated'))
      setShowAddProduct(false)
      setProductForm(EMPTY_PRODUCT_FORM)
      setNewTag('')
      setProductImage(null)
      setImagePreview(null)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('toast.productCreateFailed'))
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      toast.error(t('toast.invalidImportFile'))
      return
    }
    setUploadedFile(file)
    await previewImportFile(file, setUploadPreview)
  }

  const handleBulkSubmit = async () => {
    await submitImport(uploadedFile)
  }

  if (showInitialLoad) return <ProductsPageLoading />

  if (error) {
    return (
      <RequirePermission anyOf={['CATALOG_VIEW', 'ORDERS_VIEW']} title="products">
        <PageShell maxWidth="wide" data-testid="products-page">
          <PageHeader
            title={t('page.title')}
            description={
              isSupplier ? t('page.supplierDescription') : t('page.restaurantDescription')
            }
          />
          <EmptyState
            title={t('page.loadFailedTitle')}
            description={t('page.loadFailedDescription')}
            icon={<Package className="h-10 w-10" aria-hidden />}
            action={
              <Button onClick={() => refetch()} data-testid="products-retry">
                {t('page.retry')}
              </Button>
            }
          />
        </PageShell>
      </RequirePermission>
    )
  }

  return (
    <RequirePermission anyOf={['CATALOG_VIEW', 'ORDERS_VIEW']} title="products">
      <PageShell maxWidth="wide" data-testid="products-page">
        <PageHeader
          title={t('page.title')}
          description={isSupplier ? t('page.supplierDescription') : t('page.restaurantDescription')}
          actions={
            <div className="flex flex-wrap gap-2">
              {isSupplier ? (
                <PermissionGate anyOf={['CATALOG_EDIT', 'CATALOG_MANAGE']}>
                  <>
                    <Button onClick={() => setShowAddProduct(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('page.addProduct')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowBulkUpload(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      {t('page.bulkUpload')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowImageImport(true)}>
                      <Image className="h-4 w-4 mr-2" />
                      {t('page.importImages')}
                    </Button>
                  </>
                </PermissionGate>
              ) : (
                <PermissionGate permission="ORDERS_CREATE">
                  <>
                    <Button asChild variant="outline">
                      <Link to="/app/quote-requests/new">
                        <FileQuestion className="h-4 w-4 mr-2" />
                        {t('page.requestBestPrice')}
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link to="/app/cart">{t('page.viewCart')}</Link>
                    </Button>
                  </>
                </PermissionGate>
              )}
            </div>
          }
        />
        {isRestaurant && activeDeals.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 -mt-2">
            <Badge variant="secondary">
              {t('page.activeDeals', { count: activeDeals.length })}
            </Badge>
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link to="/app/deals">{t('page.viewAllDeals')}</Link>
            </Button>
          </div>
        )}

        <DataTableShell
          data-testid="products-table-shell"
          search={
            <SearchHistoryDropdown
              entityType="product"
              value={search}
              onChange={setSearch}
              placeholder={t('page.searchPlaceholder')}
              aria-label={t('page.searchAriaLabel')}
              inputClassName={cn(filterControlClass, 'pl-10')}
            />
          }
          filters={
            <>
              {isRestaurant && (
                <Button
                  variant={favoritesOnly ? 'default' : 'outline'}
                  size="sm"
                  className="h-10"
                  onClick={() => setFavoritesOnly((prev) => !prev)}
                >
                  <Heart
                    className={`mr-1.5 h-4 w-4 ${favoritesOnly ? 'fill-current' : ''}`}
                    aria-hidden
                  />
                  {t('page.favorites')}
                </Button>
              )}
              <ProductFilterFields
                isSupplier={isSupplier}
                supplierFilter={supplierFilter}
                setSupplierFilter={setSupplierFilter}
                uniqueSuppliers={uniqueSuppliers}
                categoryId={categoryId}
                setCategoryId={setCategoryId}
                setCategory={setCategory}
                categoriesData={categoriesData}
                minPrice={minPrice}
                maxPrice={maxPrice}
                setMinPrice={setMinPrice}
                setMaxPrice={setMaxPrice}
              />
            </>
          }
        >
          <ProductTagFilters
            isSupplier={isSupplier}
            tagsData={tagsData}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
          />
          <ProductActiveFilters
            isSupplier={isSupplier}
            supplierFilter={supplierFilter}
            setSupplierFilter={setSupplierFilter}
            categoryId={categoryId}
            category={category}
            setCategoryId={setCategoryId}
            setCategory={setCategory}
            categoriesData={categoriesData}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            minPrice={minPrice}
            maxPrice={maxPrice}
            setMinPrice={setMinPrice}
            setMaxPrice={setMaxPrice}
          />
          <div className="relative">
            {isFetching && !showInitialLoad && (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-[var(--surface)]/70 pt-6"
                aria-live="polite"
                data-testid="products-table-fetching"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('page.updating')}
                </div>
              </div>
            )}
            <ProductCatalogTable
              filteredProducts={filteredProducts}
              isSupplier={isSupplier}
              isRestaurant={isRestaurant}
              onAddToCart={handleAddToCart}
              onToggleFavorite={handleToggleFavorite}
              onAdjustStock={(product) => {
                setSelectedProductForAdjustment(product)
                setShowInventoryAdjustment(true)
              }}
            />
          </div>
          {(total != null ? total > 0 : filteredProducts.length > 0) && (
            <div
              className="flex flex-col gap-3 border-t border-[var(--app-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid="products-pagination"
            >
              <p className="text-sm text-[var(--text-muted)]">
                {t('page.showingRange', { start: rangeStart, end: rangeEnd })}
                {total != null ? t('page.showingTotal', { total }) : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasPrevPage || isFetching}
                  onClick={goToPrevPage}
                  data-testid="products-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('page.previous')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasNextPage || isFetching}
                  onClick={goToNextPage}
                  data-testid="products-next-page"
                >
                  {t('page.next')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </DataTableShell>

        <Suspense fallback={null}>
          {showAddProduct && (
            <LazyProductFormDialog
              showAddProduct={showAddProduct}
              setShowAddProduct={setShowAddProduct}
              productForm={productForm}
              setProductForm={setProductForm}
              newTag={newTag}
              setNewTag={setNewTag}
              categoriesData={categoriesData}
              tagsData={tagsData}
              warehousesData={warehousesData}
              imagePreview={imagePreview}
              handleImageSelect={handleImageSelect}
              handleSubmitProduct={handleSubmitProduct}
              isCreating={isCreating}
              isUploadingImage={isUploadingImage}
            />
          )}
          {showImageImport && (
            <LazyProductImageImportDialog
              open={showImageImport}
              onOpenChange={setShowImageImport}
            />
          )}
          {showBulkUpload && (
            <LazyProductBulkUploadDialog
              showBulkUpload={showBulkUpload}
              setShowBulkUpload={setShowBulkUpload}
              uploadedFile={uploadedFile}
              setUploadedFile={setUploadedFile}
              uploadPreview={uploadPreview}
              setUploadPreview={setUploadPreview}
              importPreviewMeta={importPreviewMeta}
              importErrors={importErrors}
              importSummary={importSummary}
              handleFileUpload={handleFileUpload}
              downloadErrorReport={downloadErrorReport}
              handleBulkSubmit={handleBulkSubmit}
              importing={importing}
              isCreating={isCreating}
              importJob={importJob}
              importJobActive={importJobActive}
            />
          )}
          {showInventoryAdjustment && (
            <LazyInventoryAdjustmentDialog
              showInventoryAdjustment={showInventoryAdjustment}
              setShowInventoryAdjustment={setShowInventoryAdjustment}
              selectedProductForAdjustment={selectedProductForAdjustment}
              setSelectedProductForAdjustment={setSelectedProductForAdjustment}
              adjustmentType={adjustmentType}
              setAdjustmentType={setAdjustmentType}
              adjustmentQuantity={adjustmentQuantity}
              setAdjustmentQuantity={setAdjustmentQuantity}
              adjustmentReason={adjustmentReason}
              setAdjustmentReason={setAdjustmentReason}
              adjustmentNotes={adjustmentNotes}
              setAdjustmentNotes={setAdjustmentNotes}
            />
          )}
        </Suspense>
      </PageShell>
    </RequirePermission>
  )
}
