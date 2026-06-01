import { useState, useMemo } from 'react'
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
  useCreateInventoryAdjustmentMutation,
  useGetActivePromotionsQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Package, Search, Plus, Upload, Download, TrendingUp, TrendingDown } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { useImpersonation } from '../hooks/useImpersonation'
import { useCartActions } from '../hooks/useCartActions'
import toast from 'react-hot-toast'
import { apiUrl } from '../lib/apiBase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { formatPrice, formatNumber } from '../utils/format'
import { ContractPriceDisplay } from '../components/ContractPriceDisplay'
import { canUseSupplierDeals } from '../lib/planFeatureGates'
import { PermissionGate } from '../components/PermissionGate'
import { RequirePermission } from '../components/RequirePermission'

export function ProductsPage() {
  const [search, setSearch] = useState('')
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
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    category_id: '',
    tags: [] as string[],
    unit: '',
    price: '',
    initialStock: '',
    image_url: '',
    warehouse_id: '',
  })
  const [newTag, setNewTag] = useState('')
  const dispatch = useAppDispatch()
  const { addItem } = useCartActions()
  const { user } = useAppSelector((state) => state.auth)
  const { isEffectiveSupplier, isEffectiveRestaurant } = useImpersonation()
  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation()
  const [generatePresignedUrl, { isLoading: isUploadingImage }] = useGeneratePresignedUrlMutation()
  const [createInventoryAdjustment, { isLoading: isAdjustingInventory }] =
    useCreateInventoryAdjustmentMutation()
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

  // Check if user is a supplier
  const isSupplier = isEffectiveSupplier
  const isRestaurant = isEffectiveRestaurant
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !isRestaurant,
  })
  const supplierDealsEnabled = canUseSupplierDeals(entitlementsData?.entitlements)
  const { data: activeDealsData } = useGetActivePromotionsQuery(undefined, {
    skip: !isRestaurant || !supplierDealsEnabled,
  })
  const activeDeals = activeDealsData?.promotions || []

  // Fetch warehouses only for suppliers (warehouse selection in product creation)
  const { data: warehousesData } = useGetWarehousesQuery(undefined, {
    skip: !isSupplier, // Skip if not a supplier
  })

  // Fetch all suppliers for restaurants (for filter dropdown)
  const { data: suppliersData } = useGetSuppliersQuery(
    { limit: 100 },
    {
      skip: isSupplier, // Skip if supplier
    }
  )

  // Fetch categories and tags
  const { data: categoriesData } = useGetProductCategoriesQuery()
  const { data: tagsData } = useGetProductTagsQuery()

  // Dedupe by id — org branches often share the same contact_email
  const uniqueSuppliers = useMemo(() => {
    if (isSupplier) return []
    const byId = new Map<string, { id: string; name: string }>()
    for (const s of suppliersData?.suppliers ?? []) {
      if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name })
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [isSupplier, suppliersData?.suppliers])

  // Build query params with all filters
  const queryParams = useMemo(
    () => ({
      q: search || undefined,
      category: category || undefined,
      categoryId: categoryId || undefined,
      tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
      minPrice: minPrice ? minPrice : undefined,
      maxPrice: maxPrice ? maxPrice : undefined,
      limit: 100, // Increase limit to show more products
      offset: 0,
    }),
    [search, category, categoryId, selectedTags, minPrice, maxPrice]
  )

  const { data, isLoading, error } = useGetProductsQuery(queryParams)

  // Filter products to show only supplier's products if user is a supplier
  let filteredProducts = isSupplier
    ? data?.products.filter((p) => p.supplier_email === user?.email)
    : data?.products || []

  // Apply supplier filter for restaurants (by supplier_id)
  if (!isSupplier && supplierFilter) {
    filteredProducts = filteredProducts.filter((p) => p.supplier_id === supplierFilter)
  }

  const handleAddToCart = (product: any) => {
    addItem({
      productId: product.id,
      product,
      quantity: 1,
    })
    toast.success('Added to cart')
  }

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }

    setProductImage(file)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmitProduct = async () => {
    try {
      let imageUrl = productForm.image_url

      // Upload image if provided
      if (productImage) {
        try {
          // Get presigned URL
          const ext = productImage.name.split('.').pop()
          const fileName = `products/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`

          const presignedResponse = await generatePresignedUrl({
            fileType: productImage.type,
            fileName,
            fileSize: productImage.size,
          }).unwrap()

          // Upload to S3/MinIO
          const uploadUrl =
            presignedResponse.presignedUrl || (presignedResponse as { url?: string }).url
          if (!uploadUrl) {
            throw new Error('Missing upload URL from server')
          }

          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: productImage,
            headers: {
              'Content-Type': productImage.type,
            },
          })

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload image')
          }

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
      setProductForm({
        name: '',
        sku: '',
        description: '',
        category: '',
        category_id: '',
        tags: [],
        unit: '',
        price: '',
        initialStock: '',
        image_url: '',
        warehouse_id: '',
      })
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
      toast.error('Please upload a CSV file (Excel preview uses server validation on CSV export)')
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

  const downloadExampleFile = () => {
    const csvContent = `Name,SKU,Description,Category,Unit,Price,Stock
Fresh Tomatoes,FT001,Premium fresh tomatoes,Vegetables,kg,2.50,100
Organic Lettuce,OL002,Fresh organic lettuce heads,Vegetables,pack,1.80,50
Chicken Breast,CB003,Free-range chicken breast,Meat,kg,8.99,30
Basmati Rice,BR004,Premium long-grain rice,Grains,kg,3.25,200
Olive Oil,OO005,Extra virgin olive oil,Oils,bottle,12.99,40
Whole Milk,WM006,Fresh whole milk,Dairy,liter,1.25,75
Orange Juice,OJ007,Fresh squeezed orange juice,Beverages,liter,2.50,60
French Bread,FB008,Artisan French baguette,Grains,loaf,2.00,45`

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute('download', 'products-template.csv')
    link.style.visibility = 'hidden'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.success('Example file downloaded!')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Failed to load products</p>
      </div>
    )
  }

  const filterSelectClass =
    'h-10 w-full rounded-md border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]'

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
                  <Button asChild>
                    <Link to="/app/cart">View Cart</Link>
                  </Button>
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

        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4 pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end">
              <div className="min-w-0 sm:col-span-2 xl:col-span-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    placeholder="Search products..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 pl-10"
                  />
                </div>
              </div>
              {!isSupplier && (
                <div className="min-w-0 xl:col-span-2">
                  <Label htmlFor="product-supplier-filter" className="sr-only">
                    Supplier
                  </Label>
                  <select
                    id="product-supplier-filter"
                    value={supplierFilter}
                    onChange={(e) => setSupplierFilter(e.target.value)}
                    className={filterSelectClass}
                  >
                    <option value="">All Suppliers</option>
                    {uniqueSuppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div
                className={`min-w-0 ${!isSupplier ? 'xl:col-span-2' : 'sm:col-span-1 xl:col-span-3'}`}
              >
                <Label htmlFor="product-category-filter" className="sr-only">
                  Category
                </Label>
                <select
                  id="product-category-filter"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    setCategory('')
                  }}
                  className={filterSelectClass}
                >
                  <option value="">All Categories</option>
                  {categoriesData?.categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              {!isSupplier && (
                <div className="min-w-0 sm:col-span-2 xl:col-span-4">
                  <Label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                    Price range
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Min"
                      aria-label="Minimum price"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      className="h-10 w-full min-w-0 sm:max-w-[7.5rem]"
                    />
                    <span className="shrink-0 text-sm text-[var(--text-muted)]">–</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      aria-label="Maximum price"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      className="h-10 w-full min-w-0 sm:max-w-[7.5rem]"
                    />
                    {(minPrice || maxPrice) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 shrink-0 px-3"
                        onClick={() => {
                          setMinPrice('')
                          setMaxPrice('')
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tags Filter */}
            {!isSupplier && tagsData?.tags && tagsData.tags.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-[var(--app-border-mid)] pt-4">
                <Label className="text-sm font-medium">Filter by tags</Label>
                <div className="flex flex-wrap gap-2">
                  {tagsData.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                      className="cursor-pointer hover:bg-[var(--bg)]"
                      onClick={() => {
                        setSelectedTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        )
                      }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Filter Summary */}
            {(supplierFilter ||
              categoryId ||
              category ||
              selectedTags.length > 0 ||
              minPrice ||
              maxPrice) &&
              !isSupplier && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-[var(--text-muted)]">Filtered by:</span>
                  {supplierFilter && (
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-[var(--app-border-mid)]"
                      onClick={() => setSupplierFilter('')}
                    >
                      Supplier: {supplierFilter} ×
                    </Badge>
                  )}
                  {(categoryId || category) && (
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-[var(--app-border-mid)]"
                      onClick={() => {
                        setCategoryId('')
                        setCategory('')
                      }}
                    >
                      Category:{' '}
                      {categoriesData?.categories?.find((c) => c.id === categoryId)?.name ||
                        category}{' '}
                      ×
                    </Badge>
                  )}
                  {selectedTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer hover:bg-[var(--app-border-mid)]"
                      onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                    >
                      Tag: {tag} ×
                    </Badge>
                  ))}
                  {(minPrice || maxPrice) && (
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-[var(--app-border-mid)]"
                      onClick={() => {
                        setMinPrice('')
                        setMaxPrice('')
                      }}
                    >
                      Price: ${minPrice || '0'} - ${maxPrice || '∞'} ×
                    </Badge>
                  )}
                </div>
              )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden p-0 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-[var(--app-border)] bg-[var(--bg)]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                    Supplier
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                    Price
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border)]">
                {filteredProducts?.map((product) => (
                  <tr
                    key={product.id}
                    className="transition-colors hover:bg-[var(--bg)]"
                    data-testid={`product-row-${product.id}`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-[var(--bg)]">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="h-6 w-6 text-[var(--text-muted)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--text)] truncate">{product.name}</p>
                          <p className="text-sm text-[var(--text-muted)] truncate">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary">
                          {product.category_name || product.category || 'N/A'}
                        </Badge>
                        {product.tags && Array.isArray(product.tags) && product.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {product.tags.slice(0, 3).map((tag: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {product.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{product.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-[var(--text-muted)]">
                        {product.supplier_name || 'N/A'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {product.current_price ? (
                        <ContractPriceDisplay
                          compact
                          currentPrice={product.current_price}
                          catalogPrice={product.catalog_price}
                          pricingSource={product.pricing_source}
                          currency={product.currency}
                          unit={product.unit}
                        />
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">N/A</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p
                        className={`text-sm font-medium ${
                          parseFloat(product.available_qty || 0) > 0
                            ? 'text-[var(--mint)]'
                            : 'text-[var(--red)]'
                        }`}
                      >
                        {formatNumber(product.available_qty, { maximumFractionDigits: 2 })}{' '}
                        {product.unit || 'units'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {!isSupplier && (
                          <Button
                            size="sm"
                            onClick={() => handleAddToCart(product)}
                            disabled={!product.available_qty || product.available_qty <= 0}
                            data-testid={`product-add-to-cart-${product.id}`}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add to Cart
                          </Button>
                        )}
                        {isSupplier && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedProductForAdjustment(product)
                                setShowInventoryAdjustment(true)
                              }}
                            >
                              <TrendingUp className="h-4 w-4 mr-1" />
                              Adjust Stock
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                toast('Edit product functionality coming soon')
                              }}
                            >
                              Edit
                            </Button>
                          </>
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/app/products/${product.id}`}>View</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {filteredProducts?.length === 0 && (
          <EmptyState
            title={isSupplier ? 'No products in your catalog' : 'No products found'}
            description={
              isSupplier
                ? 'Add your first product or adjust filters to see existing items.'
                : 'Try a different search or supplier filter.'
            }
            icon={<Package className="h-10 w-10" aria-hidden />}
          />
        )}

        <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
              <DialogDescription>
                Add a new product to your catalog. Fill in all required fields.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Fresh Tomatoes"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    placeholder="e.g., FT001"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Product description"
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category_id">Category *</Label>
                  <select
                    id="category_id"
                    className="px-3 py-2 border border-[var(--app-border-mid)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)] w-full"
                    value={productForm.category_id}
                    onChange={(e) =>
                      setProductForm({ ...productForm, category_id: e.target.value, category: '' })
                    }
                  >
                    <option value="">Select category</option>
                    {categoriesData?.categories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit *</Label>
                  <select
                    id="unit"
                    className="px-3 py-2 border border-[var(--app-border-mid)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)] w-full"
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                  >
                    <option value="">Select unit</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="lb">Pound (lb)</option>
                    <option value="oz">Ounce (oz)</option>
                    <option value="liter">Liter (L)</option>
                    <option value="ml">Milliliter (ml)</option>
                    <option value="pack">Pack</option>
                    <option value="bottle">Bottle</option>
                    <option value="box">Box</option>
                    <option value="carton">Carton</option>
                    <option value="bag">Bag</option>
                    <option value="piece">Piece</option>
                    <option value="can">Can</option>
                    <option value="jar">Jar</option>
                    <option value="unit">Unit</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price (USD) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="initialStock">Initial Stock Quantity *</Label>
                <Input
                  id="initialStock"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={productForm.initialStock}
                  onChange={(e) => setProductForm({ ...productForm, initialStock: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse">Warehouse (Optional)</Label>
                <select
                  id="warehouse"
                  className="px-3 py-2 border border-[var(--app-border-mid)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)] w-full"
                  value={productForm.warehouse_id}
                  onChange={(e) => setProductForm({ ...productForm, warehouse_id: e.target.value })}
                >
                  <option value="">Select a warehouse (optional)</option>
                  {warehousesData?.warehouses?.map((warehouse: any) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} {warehouse.code ? `(${warehouse.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags Input */}
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <div className="flex gap-2">
                  <Input
                    id="tags"
                    placeholder="e.g., organic, fresh, local"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault()
                        if (!productForm.tags.includes(newTag.trim())) {
                          setProductForm({
                            ...productForm,
                            tags: [...productForm.tags, newTag.trim()],
                          })
                        }
                        setNewTag('')
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (newTag.trim() && !productForm.tags.includes(newTag.trim())) {
                        setProductForm({
                          ...productForm,
                          tags: [...productForm.tags, newTag.trim()],
                        })
                        setNewTag('')
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {productForm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {productForm.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => {
                          setProductForm({
                            ...productForm,
                            tags: productForm.tags.filter((_, i) => i !== index),
                          })
                        }}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                )}
                {tagsData?.tags && tagsData.tags.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Suggested tags:</p>
                    <div className="flex flex-wrap gap-1">
                      {tagsData.tags.slice(0, 10).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="cursor-pointer text-xs"
                          onClick={() => {
                            if (!productForm.tags.includes(tag)) {
                              setProductForm({ ...productForm, tags: [...productForm.tags, tag] })
                            }
                          }}
                        >
                          + {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="productImage">Product Image</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="productImage"
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="cursor-pointer"
                  />
                  {imagePreview && (
                    <div className="relative w-24 h-24 rounded-md overflow-hidden border">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Recommended: Square image, max 5MB. Formats: JPG, PNG, WebP
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddProduct(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitProduct} disabled={isCreating || isUploadingImage}>
                {isCreating || isUploadingImage ? 'Creating...' : 'Create Product'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Upload Products</DialogTitle>
              <DialogDescription>
                Upload a CSV file to preview and import products. Required: Name, SKU. Optional:
                Description, Category, Unit, Price, Stock. Duplicate SKUs in the file or existing
                catalog update the matching product.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="file-upload">Select File</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadExampleFile}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Example
                  </Button>
                </div>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="cursor-pointer"
                />
                <p className="text-sm text-[var(--text-muted)]">
                  CSV only for server preview (export Excel as CSV first).
                </p>
              </div>

              {importPreviewMeta && (
                <div
                  data-testid="import-preview-summary"
                  className="rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                >
                  <strong>{importPreviewMeta.validCount}</strong> valid ·{' '}
                  <strong className="text-[var(--red)]">{importPreviewMeta.errorCount}</strong> with
                  issues · {importPreviewMeta.totalRows} total rows
                </div>
              )}

              {uploadedFile && (
                <div className="space-y-2">
                  <Label>File: {uploadedFile.name}</Label>
                  <p className="text-sm text-[var(--text-muted)]">
                    Size: {formatNumber(uploadedFile.size / 1024, { maximumFractionDigits: 2 })} KB
                  </p>
                </div>
              )}

              {uploadPreview.length > 0 && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="border rounded-md overflow-x-auto max-h-48">
                    <table className="w-full text-sm" data-testid="import-preview-table">
                      <thead>
                        <tr className="bg-[var(--brand-ultra)] border-b">
                          <th className="px-3 py-2 text-left">Row</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadPreview.map((row: any) => (
                          <tr
                            key={row.rowNumber}
                            className={
                              row.status === 'valid' ? 'border-b' : 'border-b bg-red-50/50'
                            }
                          >
                            <td className="px-3 py-2">{row.rowNumber}</td>
                            <td className="px-3 py-2 font-medium">{row.status}</td>
                            <td className="px-3 py-2">{row.mapped?.sku ?? '—'}</td>
                            <td className="px-3 py-2">{row.mapped?.name ?? '—'}</td>
                            <td className="px-3 py-2 text-xs text-[var(--red)]">
                              {(row.errors || [])
                                .map((e: { message: string }) => e.message)
                                .join('; ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(importErrors.length > 0 || (importSummary && importSummary.failed > 0)) && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-[var(--red)]">
                    {importErrors.length || importSummary?.failed} row(s) need attention
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="import-download-errors"
                    onClick={downloadErrorReport}
                  >
                    Download error CSV
                  </Button>
                </div>
              )}

              {importSummary && (
                <div
                  data-testid="import-summary"
                  className="text-sm rounded-md bg-[var(--mint-pale)] px-3 py-2"
                >
                  Created {importSummary.created}, updated {importSummary.updated}, failed{' '}
                  {importSummary.failed}
                </div>
              )}

              <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
                <p className="text-sm text-[var(--brand-mid)]">
                  <strong>CSV Format Example:</strong>
                  <br />
                  Name,SKU,Description,Category,Unit,Price,Stock
                  <br />
                  Fresh Tomatoes,FT001,Premium tomatoes,Vegetables,kg,2.50,100
                  <br />
                  Organic Lettuce,OL002,Fresh organic lettuce,Vegetables,pack,1.80,50
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkUpload(false)
                  setUploadedFile(null)
                  setUploadPreview([])
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkSubmit}
                disabled={
                  !uploadedFile || !importPreviewMeta?.validCount || importing || isCreating
                }
                data-testid="import-submit-btn"
              >
                {importing ? 'Importing…' : 'Import valid rows'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Inventory Adjustment Dialog */}
        <Dialog open={showInventoryAdjustment} onOpenChange={setShowInventoryAdjustment}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Adjust Stock</DialogTitle>
              <DialogDescription>
                {adjustmentType === 'ADD' ? 'Add' : 'Remove'} stock for{' '}
                {selectedProductForAdjustment?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Adjustment Type</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={adjustmentType === 'ADD' ? 'default' : 'outline'}
                    onClick={() => setAdjustmentType('ADD')}
                    className="flex-1"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Add Stock
                  </Button>
                  <Button
                    type="button"
                    variant={adjustmentType === 'REMOVE' ? 'default' : 'outline'}
                    onClick={() => setAdjustmentType('REMOVE')}
                    className="flex-1"
                  >
                    <TrendingDown className="h-4 w-4 mr-2" />
                    Remove Stock
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(e.target.value)}
                  placeholder="Enter quantity"
                />
              </div>

              <div>
                <Label htmlFor="reason">Reason</Label>
                <select
                  id="reason"
                  className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                >
                  <option value="">Select a reason</option>
                  <option value="STOCK_TAKE">Stock Take / Count</option>
                  <option value="DAMAGE">Damage / Spoilage</option>
                  <option value="RETURN">Return</option>
                  <option value="ADJUSTMENT">Manual Adjustment</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]"
                  rows={3}
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  placeholder="Additional notes (optional)"
                />
              </div>

              {selectedProductForAdjustment && (
                <div className="bg-[var(--brand-ultra)] p-4 rounded-md">
                  <p className="text-sm font-medium text-[var(--text-mid)]">Current Stock</p>
                  <p className="text-lg font-semibold text-[var(--mint)]">
                    {formatNumber(selectedProductForAdjustment.available_qty, {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {selectedProductForAdjustment.unit || 'units'}
                  </p>
                  {adjustmentQuantity && (
                    <p className="text-sm text-[var(--text-muted)] mt-2">
                      New Stock:{' '}
                      {formatNumber(
                        parseFloat(String(selectedProductForAdjustment.available_qty || 0)) +
                          (adjustmentType === 'ADD' ? 1 : -1) * parseFloat(adjustmentQuantity),
                        { maximumFractionDigits: 2 }
                      )}{' '}
                      {selectedProductForAdjustment.unit || 'units'}
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowInventoryAdjustment(false)
                  setSelectedProductForAdjustment(null)
                  setAdjustmentQuantity('')
                  setAdjustmentReason('')
                  setAdjustmentNotes('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const qty = parseFloat(adjustmentQuantity)
                  if (!qty || qty <= 0 || !adjustmentReason || !selectedProductForAdjustment?.id)
                    return
                  try {
                    await createInventoryAdjustment({
                      productId: selectedProductForAdjustment.id,
                      adjustmentType: adjustmentType === 'ADD' ? 'IN' : 'OUT',
                      quantity: qty,
                      reason: adjustmentReason,
                      notes: adjustmentNotes || undefined,
                    }).unwrap()
                    toast.success(
                      `Stock ${adjustmentType === 'ADD' ? 'added' : 'removed'} successfully`
                    )
                    setShowInventoryAdjustment(false)
                    setSelectedProductForAdjustment(null)
                    setAdjustmentQuantity('')
                    setAdjustmentReason('')
                    setAdjustmentNotes('')
                  } catch (err: any) {
                    toast.error(err?.data?.error?.message || 'Failed to update inventory')
                  }
                }}
                disabled={!adjustmentQuantity || !adjustmentReason || isAdjustingInventory}
              >
                {adjustmentType === 'ADD' ? 'Add' : 'Remove'} Stock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  )
}
