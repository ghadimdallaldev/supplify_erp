import { useState } from 'react'
import { useGetProductsQuery, useCreateProductMutation, useGeneratePresignedUrlMutation, useGetWarehousesQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Label } from '../components/ui/label'
import { Package, Search, Plus, Upload, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { addItem } from '../features/cart/cartSlice'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<any[]>([])
  const [productImage, setProductImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    unit: '',
    price: '',
    initialStock: '',
    image_url: '',
    warehouse_id: '',
  })
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation()
  const [generatePresignedUrl, { isLoading: isUploadingImage }] = useGeneratePresignedUrlMutation()
  
  // Check if user is a supplier
  const isSupplier = user?.role === 'SUPPLIER'

  const { data, isLoading, error } = useGetProductsQuery({
    q: search || undefined,
    category: category || undefined,
    limit: 20,
    offset: 0,
  })
  
  // Fetch warehouses for warehouse selection
  const { data: warehousesData } = useGetWarehousesQuery()
  
  // Get unique suppliers from products
  const supplierMap = new Map()
  data?.products?.forEach(p => {
    if (p.supplier_name && p.supplier_email) {
      supplierMap.set(p.supplier_email, { name: p.supplier_name, email: p.supplier_email })
    }
  })
  const uniqueSuppliers = Array.from(supplierMap.values())
  
  // Filter products to show only supplier's products if user is a supplier
  let filteredProducts = isSupplier 
    ? data?.products.filter(p => p.supplier_email === user?.email)
    : data?.products || []
  
  // Apply supplier filter for restaurants
  if (!isSupplier && supplierFilter) {
    filteredProducts = filteredProducts.filter(p => 
      p.supplier_name?.toLowerCase().includes(supplierFilter.toLowerCase())
    )
  }

  const handleAddToCart = (product: any) => {
    dispatch(addItem({
      productId: product.id,
      product,
      quantity: 1,
    }))
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
          }).unwrap()

          // Upload to S3/MinIO
          const uploadResponse = await fetch(presignedResponse.url, {
            method: 'PUT',
            body: productImage,
            headers: {
              'Content-Type': productImage.type,
            },
          })

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload image')
          }

          // Get the public URL
          imageUrl = presignedResponse.url.split('?')[0]
        } catch (error: any) {
          toast.error(error?.data?.error?.message || 'Failed to upload image')
          return
        }
      }

      await createProduct({
        name: productForm.name,
        sku: productForm.sku,
        description: productForm.description,
        category: productForm.category,
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
        unit: '',
        price: '',
        initialStock: '',
        image_url: '',
        warehouse_id: '',
      })
      setProductImage(null)
      setImagePreview(null)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create product')
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file')
      return
    }

    setUploadedFile(file)

    try {
      // Read file as text (for CSV) or use a library for Excel
      const text = await file.text()
      
      // Parse CSV
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length < 2) {
        toast.error('File is empty or has no data rows')
        return
      }

      const headers = lines[0].split(',').map(h => h.trim())
      const preview = lines.slice(1, 6).map(line => {
        const values = line.split(',').map(v => v.trim())
        const row: any = {}
        headers.forEach((header, index) => {
          row[header] = values[index] || ''
        })
        return row
      })

      setUploadPreview(preview)
      toast.success(`File loaded. Found ${lines.length - 1} rows`)
    } catch (error) {
      toast.error('Failed to read file')
      console.error(error)
    }
  }

  const handleBulkSubmit = async () => {
    if (!uploadedFile) return

    try {
      const text = await uploadedFile.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        toast.error('File is empty')
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      
      // Map Excel columns to our product structure
      // Expected columns: Name, SKU, Description, Category, Unit, Price, InitialStock
      const nameIndex = headers.findIndex(h => h.includes('name'))
      const skuIndex = headers.findIndex(h => h.includes('sku'))
      const descIndex = headers.findIndex(h => h.includes('description'))
      const catIndex = headers.findIndex(h => h.includes('category'))
      const unitIndex = headers.findIndex(h => h.includes('unit'))
      const priceIndex = headers.findIndex(h => h.includes('price'))
      const stockIndex = headers.findIndex(h => h.includes('stock') || h.includes('quantity'))

      if (nameIndex === -1 || skuIndex === -1) {
        toast.error('File must contain Name and SKU columns')
        return
      }

      // Create products in batches
      const rows = lines.slice(1).filter(line => line.trim())
      let successCount = 0
      let errorCount = 0

      for (const row of rows) {
        const values = row.split(',').map(v => v.trim())
        
        try {
          await createProduct({
            name: values[nameIndex] || '',
            sku: values[skuIndex] || '',
            description: values[descIndex] || '',
            category: values[catIndex] || 'Other',
            unit: values[unitIndex] || 'unit',
            price: parseFloat(values[priceIndex]) || 0,
            initialStock: parseFloat(values[stockIndex]) || 0,
          }).unwrap()
          successCount++
        } catch (error) {
          errorCount++
        }
      }

      toast.success(`Upload complete: ${successCount} created, ${errorCount} failed`)
      setShowBulkUpload(false)
      setUploadedFile(null)
      setUploadPreview([])
    } catch (error) {
      toast.error('Bulk upload failed')
      console.error(error)
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load products</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-2">
            {isSupplier ? 'Manage your product catalog' : 'Browse and search products from suppliers'}
          </p>
        </div>
        <div className="flex space-x-2">
          {isSupplier ? (
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
          ) : (
            <Button asChild>
              <Link to="/app/cart">
                View Cart
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          {!isSupplier && (
            <div className="w-56">
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary w-full"
              >
                <option value="">All Suppliers</option>
                {uniqueSuppliers.map((supplier: any) => (
                  <option key={supplier.email} value={supplier.name}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Categories</option>
            <option value="Vegetables">Vegetables</option>
            <option value="Meat">Meat</option>
            <option value="Grains">Grains</option>
            <option value="Oils">Oils</option>
          </select>
        </div>
        
        {/* Filter Summary */}
        {(supplierFilter || category) && !isSupplier && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">Filtered by:</span>
            {supplierFilter && (
              <Badge variant="secondary" className="cursor-pointer hover:bg-gray-300" onClick={() => setSupplierFilter('')}>
                Supplier: {supplierFilter}
              </Badge>
            )}
            {category && (
              <Badge variant="secondary" className="cursor-pointer hover:bg-gray-300" onClick={() => setCategory('')}>
                Category: {category}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts?.map((product) => (
          <Card key={product.id} className="overflow-hidden">
            <div className="aspect-square bg-gray-100 flex items-center justify-center">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-12 w-12 text-gray-400" />
              )}
            </div>
            <CardHeader>
              <CardTitle className="text-lg">{product.name}</CardTitle>
              <CardDescription>
                {product.description || 'No description available'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                  <p className="text-sm text-gray-600">Supplier: {product.supplier_name}</p>
                </div>
                <Badge variant="secondary">{product.category}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">
                    ${product.current_price?.toFixed(2) || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600">
                    Stock: {product.available_qty || 0} {product.unit || 'units'}
                  </p>
                </div>
                {!isSupplier && (
                  <Button
                    size="sm"
                    onClick={() => handleAddToCart(product)}
                    disabled={!product.available_qty || product.available_qty <= 0}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add to Cart
                  </Button>
                )}
                {isSupplier && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // TODO: Implement edit product
                      toast.info('Edit product functionality coming soon')
                    }}
                  >
                    Edit Product
                  </Button>
                )}
              </div>
              
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link to={`/app/products/${product.id}`}>
                  View Details
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredProducts?.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {isSupplier ? 'No products yet. Click "Add Product" to get started!' : 'No products found'}
          </p>
        </div>
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
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary w-full"
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  <option value="Vegetables">Vegetables</option>
                  <option value="Meat">Meat</option>
                  <option value="Grains">Grains</option>
                  <option value="Oils">Oils</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <select
                  id="unit"
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary w-full"
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
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary w-full"
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
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500">
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
              Upload a CSV or Excel file to add multiple products at once.
              <br />
              <strong>Required columns:</strong> Name, SKU
              <br />
              <strong>Optional columns:</strong> Description, Category, Unit, Price, Stock (or Quantity)
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
              <p className="text-sm text-gray-500">
                Supported formats: CSV, Excel (.xlsx, .xls)
              </p>
            </div>

            {uploadedFile && (
              <div className="space-y-2">
                <Label>File: {uploadedFile.name}</Label>
                <p className="text-sm text-gray-600">
                  Size: {(uploadedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}

            {uploadPreview.length > 0 && (
              <div className="space-y-2">
                <Label>Preview (first 5 rows):</Label>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        {Object.keys(uploadPreview[0] || {}).map((key) => (
                          <th key={key} className="px-3 py-2 text-left font-medium">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadPreview.map((row, index) => (
                        <tr key={index} className="border-b">
                          {Object.values(row).map((value: any, i) => (
                            <td key={i} className="px-3 py-2">
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-sm text-blue-800">
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
            <Button variant="outline" onClick={() => {
              setShowBulkUpload(false)
              setUploadedFile(null)
              setUploadPreview([])
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkSubmit} 
              disabled={!uploadedFile || uploadPreview.length === 0 || isCreating}
            >
              {isCreating ? 'Uploading...' : 'Upload Products'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
