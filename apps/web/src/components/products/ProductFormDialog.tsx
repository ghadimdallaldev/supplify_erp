import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import type { ProductFormState } from './productsShared'

type ProductFormDialogProps = {
  showAddProduct: boolean
  setShowAddProduct: (open: boolean) => void
  productForm: ProductFormState
  setProductForm: React.Dispatch<React.SetStateAction<ProductFormState>>
  newTag: string
  setNewTag: (v: string) => void
  categoriesData: { categories?: Array<{ id: string; name: string }> } | undefined
  tagsData: { tags?: string[] } | undefined
  warehousesData: { warehouses?: Array<{ id: string; name: string; code?: string }> } | undefined
  imagePreview: string | null
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSubmitProduct: () => void | Promise<void>
  isCreating: boolean
  isUploadingImage: boolean
}

export function ProductFormDialog({
  showAddProduct,
  setShowAddProduct,
  productForm,
  setProductForm,
  newTag,
  setNewTag,
  categoriesData,
  tagsData,
  warehousesData,
  imagePreview,
  handleImageSelect,
  handleSubmitProduct,
  isCreating,
  isUploadingImage,
}: ProductFormDialogProps) {
  return (
    <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>
            Add a new product to your catalog. Fill in all required fields.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category_id">Category *</Label>
              <Select
                value={productForm.category_id}
                onValueChange={(value) =>
                  setProductForm({ ...productForm, category_id: value, category: '' })
                }
              >
                <SelectTrigger id="category_id">
                  <option value="">Select category</option>
                  {categoriesData?.categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit *</Label>
              <Select
                value={productForm.unit}
                onValueChange={(value) => setProductForm({ ...productForm, unit: value })}
              >
                <SelectTrigger id="unit">
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
                </SelectTrigger>
              </Select>
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
            <Select
              value={productForm.warehouse_id}
              onValueChange={(value) => setProductForm({ ...productForm, warehouse_id: value })}
            >
              <SelectTrigger id="warehouse">
                <option value="">Select a warehouse (optional)</option>
                {warehousesData?.warehouses?.map((warehouse: any) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} {warehouse.code ? `(${warehouse.code})` : ''}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
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
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
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
  )
}
