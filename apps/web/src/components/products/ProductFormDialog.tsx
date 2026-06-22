import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('products')
  const unitOptions = [
    'kg',
    'g',
    'lb',
    'oz',
    'liter',
    'ml',
    'pack',
    'bottle',
    'box',
    'carton',
    'bag',
    'piece',
    'can',
    'jar',
    'unit',
  ] as const

  return (
    <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('form.title')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('form.productName')}</Label>
              <Input
                id="name"
                placeholder={t('form.productNamePlaceholder')}
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">{t('form.sku')}</Label>
              <Input
                id="sku"
                placeholder={t('form.skuPlaceholder')}
                value={productForm.sku}
                onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t('form.descriptionLabel')}</Label>
            <Input
              id="description"
              placeholder={t('form.descriptionPlaceholder')}
              value={productForm.description}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category_id">{t('form.category')}</Label>
              <Select
                value={productForm.category_id}
                onValueChange={(value) =>
                  setProductForm({ ...productForm, category_id: value, category: '' })
                }
              >
                <SelectTrigger id="category_id">
                  <option value="">{t('form.selectCategory')}</option>
                  {categoriesData?.categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">{t('form.unit')}</Label>
              <Select
                value={productForm.unit}
                onValueChange={(value) => setProductForm({ ...productForm, unit: value })}
              >
                <SelectTrigger id="unit">
                  <option value="">{t('form.selectUnit')}</option>
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(`form.units.${unit}`)}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">{t('form.price')}</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                placeholder={t('form.pricePlaceholder')}
                value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="initialStock">{t('form.initialStock')}</Label>
            <Input
              id="initialStock"
              type="number"
              step="0.01"
              placeholder={t('form.initialStockPlaceholder')}
              value={productForm.initialStock}
              onChange={(e) => setProductForm({ ...productForm, initialStock: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="warehouse">{t('form.warehouse')}</Label>
            <Select
              value={productForm.warehouse_id}
              onValueChange={(value) => setProductForm({ ...productForm, warehouse_id: value })}
            >
              <SelectTrigger id="warehouse">
                <option value="">{t('form.selectWarehouse')}</option>
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
            <Label htmlFor="tags">{t('form.tags')}</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder={t('form.tagsPlaceholder')}
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
                {t('form.addTag')}
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
                <p className="text-xs text-[var(--text-muted)] mb-1">{t('form.suggestedTags')}</p>
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
            <Label htmlFor="productImage">{t('form.productImage')}</Label>
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
                    alt={t('form.imagePreviewAlt')}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
            <p className="text-sm text-[var(--text-muted)]">{t('form.imageHint')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddProduct(false)}>
            {t('form.cancel')}
          </Button>
          <Button onClick={handleSubmitProduct} disabled={isCreating || isUploadingImage}>
            {isCreating || isUploadingImage ? t('form.creating') : t('form.createProduct')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
