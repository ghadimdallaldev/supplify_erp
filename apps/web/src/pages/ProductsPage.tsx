import { Suspense, useState, useMemo } from 'react'
import {
  useGetProductsQuery,
  useGetProductCategoriesQuery,
  useGetProductTagsQuery,
  useCreateProductMutation,
  usePreviewProductImportMutation,
  useExecuteProductImportMutation,
  useGeneratePresignedUrlMutation,
  useGetWarehousesQuery,
  useGetSuppliersQuery,
  useGetActivePromotionsQuery,
  useGetEntitlementsQuery,
  useFavoriteProductMutation,
  useUnfavoriteProductMutation,
} from '../services/api'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { PageHeader } from '../components/ui/page-header'
import { DataTableShell } from '../components/ui/data-table-shell'
import { Plus, Upload, FileQuestion, Heart } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { useImpersonation } from '../hooks/useImpersonation'
import { useCartActions } from '../hooks/useCartActions'
import toast from 'react-hot-toast'
import { apiUrl } from '../lib/apiBase'
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
import { SearchHistoryDropdown } from '../components/search/SearchHistoryDropdown'
import {
  LazyProductFormDialog,
  LazyProductBulkUploadDialog,
  LazyInventoryAdjustmentDialog,
} from '../components/products/lazyProductDialogs'

export function ProductsPage() {
  const { search, setSearch, debouncedSearch } = useDebouncedSearch()
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [category, setCategory] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
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
  const [previewImport] = usePreviewProductImportMutation()
  const [executeImport, { isLoading: importing }] = useExecuteProductImportMutation()
  const [importSummary, setImportSummary] = useState<{
    created: number
    updated: number
    skipped: number
    failed: number
  } | null>(null)
  const [importPreviewMeta, setImportPreviewMeta] = useState<{
    totalRows: number
    validCount: number
    errorCount: number
  } | null>(null)
  const [importErrors, setImportErrors] = useState<
    Array<{ rowNumber: number; errors: Array<{ field: string; message: string }> }>
  >([])

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
      includeStock: true,
      favoritesOnly: isRestaurant && favoritesOnly ? true : undefined,
      limit: 100,
      offset: 0,
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
    ]
  )

  const { data, isLoading, error } = useGetProductsQuery(queryParams)

  let filteredProducts = isSupplier
    ? data?.products.filter((p) => p.supplier_email === user?.email)
    : data?.products || []

  if (!isSupplier && supplierFilter) {
    filteredProducts = filteredProducts.filter((p) => p.supplier_id === supplierFilter)
  }

  const handleAddToCart = (product: any) => {
    addItem({ productId: product.id, product, quantity: 1 })
    toast.success('Added to cart')
  }

  const handleToggleFavorite = async (product: any) => {
    try {
      if (product.is_favorited) {
        await unfavoriteProduct(product.id).unwrap()
        toast.success('Removed from favorites')
      } else {
        await favoriteProduct({ productId: product.id }).unwrap()
        toast.success('Added to favorites')
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update favorite')
    }
  }

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
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
          toast.error(error?.data?.error?.message || 'Failed to upload image')
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
      toast.success('Product created successfully')
      setShowAddProduct(false)
      setProductForm(EMPTY_PRODUCT_FORM)
      setNewTag('')
      setProductImage(null)
      setImagePreview(null)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create product')
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a .csv file. Using Excel? Save your sheet as CSV first.')
      return
    }
    setUploadedFile(file)
    setImportSummary(null)
    setImportPreviewMeta(null)
    setImportErrors([])
    try {
      const text = await file.text()
      const result = await previewImport({ csv: text }).unwrap()
      setUploadPreview(result.preview || [])
      setImportPreviewMeta({
        totalRows: result.totalRows ?? 0,
        validCount: result.validCount ?? 0,
        errorCount: result.errorCount ?? 0,
      })
      setImportErrors(result.errors || [])
      if ((result.validCount ?? 0) === 0) {
        toast.error('No valid rows to import — fix errors below')
      } else {
        toast.success(
          `Preview: ${result.validCount} valid, ${result.errorCount} with issues (${result.totalRows} rows)`
        )
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to preview file')
    }
  }

  const downloadErrorReport = async () => {
    const errors =
      importErrors.length > 0
        ? importErrors
        : (importSummary as { errors?: typeof importErrors })?.errors || []
    if (!errors.length) {
      toast.error('No errors to export')
      return
    }
    try {
      const res = await fetch(apiUrl('/api/supplier/products/import/error-report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Supplify' },
        credentials: 'include',
        body: JSON.stringify({ errors }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'import-errors.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download error report')
    }
  }

  const handleBulkSubmit = async () => {
    if (!uploadedFile) return
    if (importPreviewMeta && importPreviewMeta.validCount === 0) {
      toast.error('Fix validation errors before importing')
      return
    }
    try {
      const text = await uploadedFile.text()
      const result = await executeImport({ csv: text, partial: true }).unwrap()
      const summary = result.summary
      setImportSummary(summary)
      if (result.errors?.length) setImportErrors(result.errors)
      if (summary.failed > 0) {
        toast.error(`Import finished with ${summary.failed} failed row(s). Valid rows were saved.`)
      } else {
        toast.success(`Import complete: ${summary.created} created, ${summary.updated} updated`)
        setShowBulkUpload(false)
        setUploadedFile(null)
        setUploadPreview([])
        setImportPreviewMeta(null)
        setImportErrors([])
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Bulk upload failed')
    }
  }

  if (isLoading) return <ProductsPageLoading />
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Failed to load products</p>
      </div>
    )
  }

  return (
    <RequirePermission anyOf={['CATALOG_VIEW', 'ORDERS_VIEW']} title="products">
      <div className="space-y-6" data-testid="products-page">
        <PageHeader
          title="Products"
          description={
            isSupplier ? 'Manage your product catalog' : 'Browse and search products from suppliers'
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {isSupplier ? (
                <PermissionGate anyOf={['CATALOG_EDIT', 'CATALOG_MANAGE']}>
                  <>
                    <Button onClick={() => setShowAddProduct(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Product
                    </Button>
                    <Button variant="outline" onClick={() => setShowBulkUpload(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Bulk Upload
                    </Button>
                  </>
                </PermissionGate>
              ) : (
                <PermissionGate permission="ORDERS_CREATE">
                  <>
                    <Button asChild variant="outline">
                      <Link to="/app/quote-requests/new">
                        <FileQuestion className="h-4 w-4 mr-2" />
                        Request best price
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link to="/app/cart">View Cart</Link>
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
              {activeDeals.length} active deal{activeDeals.length === 1 ? '' : 's'}
            </Badge>
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link to="/app/deals">View all deals</Link>
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
              placeholder="Search products..."
              aria-label="Search products"
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
                  Favorites
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
      </div>
    </RequirePermission>
  )
}
