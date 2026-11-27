import { useCallback, useMemo, useState } from 'react'
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
import { CategoryCombobox } from './CategoryCombobox'
import { CategoryRequestSheet } from './CategoryRequestSheet'
import { localizedName } from '../../lib/categoryLabel'
import { OTHER_CATEGORY_SLUG } from '../../lib/categoryTree'
import type { CategoryDepartment, SupplierShelf } from '../../types'

type ProductFormDialogProps = {
  showAddProduct: boolean
  setShowAddProduct: (open: boolean) => void
  productForm: ProductFormState
  setProductForm: React.Dispatch<React.SetStateAction<ProductFormState>>
  newTag: string
  setNewTag: (v: string) => void
  /** Platform category tree (supplier view: full tree). */
  departments: CategoryDepartment[]
  /** The branch's active shelves. */
  shelves: SupplierShelf[]
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
  departments,
  shelves,
  tagsData,
  warehousesData,
  imagePreview,
  handleImageSelect,
  handleSubmitProduct,
  isCreating,
  isUploadingImage,
}: ProductFormDialogProps) {
  const { t, i18n } = useTranslation('products')
  const [requestOpen, setRequestOpen] = useState(false)
  const otherLeafId = useMemo(
    () =>
      departments.flatMap((d) => d.categories).find((c) => c.slug === OTHER_CATEGORY_SLUG)?.id ??
      '',
    [departments]
  )
  const setCategory = useCallback(
    (categoryId: string) =>
      setProductForm((form) => ({
        ...form,
        category_id: categoryId,
        // Choosing a real category drops a pending "request a category".
        pendingCategoryRequest: categoryId === otherLeafId ? form.pendingCategoryRequest : null,
      })),
    [setProductForm, otherLeafId]
  )
  const toggleShelf = (shelfId: string) =>
    setProductForm((form) => ({
      ...form,
      shelfIds: form.shelfIds.includes(shelfId)
        ? form.shelfIds.filter((id) => id !== shelfId)
        : [...form.shelfIds, shelfId],
    }))
  const missingCategory = !productForm.category_id
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
          <div className="space-y-2">
            <Label htmlFor="category_id">{t('form.category')}</Label>
            <CategoryCombobox
              id="category_id"
              departments={departments}
              value={productForm.category_id}
              onChange={setCategory}
              productName={productForm.name}
            />
            {productForm.pendingCategoryRequest ? (
              <p className="text-xs text-[var(--text-muted)]" aria-live="polite">
                {t('categoryRequest.pending', {
                  name: productForm.pendingCategoryRequest.proposedName,
                })}
              </p>
            ) : missingCategory ? (
              <p className="text-xs text-[var(--amber)]">{t('form.chooseCategory')}</p>
            ) : null}
            <button
              type="button"
              className="text-xs font-medium text-[var(--brand-mid)] hover:underline"
              onClick={() => setRequestOpen(true)}
            >
              {t('categoryRequest.open')}
            </button>
          </div>
          {shelves.length > 0 ? (
            <div className="space-y-2">
              <Label>{t('form.shelves')}</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('form.shelves')}>
                {shelves.map((shelf) => {
                  const on = productForm.shelfIds.includes(shelf.id)
                  return (
                    <button
                      key={shelf.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleShelf(shelf.id)}
                      className={
                        on
                          ? 'rounded-full border border-[var(--brand)] bg-[var(--brand-pale)] px-3 py-1 text-xs font-medium text-[var(--brand-mid)]'
                          : 'rounded-full border border-[var(--app-border)] px-3 py-1 text-xs text-[var(--text-mid)] hover:bg-[var(--app-bg-subtle)]'
                      }
                    >
                      {localizedName(shelf, i18n.language)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <Button
            onClick={handleSubmitProduct}
            disabled={isCreating || isUploadingImage || missingCategory}
          >
            {isCreating || isUploadingImage ? t('form.creating') : t('form.createProduct')}
          </Button>
        </DialogFooter>
        <CategoryRequestSheet
          open={requestOpen}
          onOpenChange={setRequestOpen}
          departments={departments}
          suggestedName={productForm.name}
          onSubmit={(body) => {
            // The product is saved under Other for now; the request is sent with its id.
            setProductForm((form) => ({
              ...form,
              category_id: otherLeafId || form.category_id,
              pendingCategoryRequest: body,
            }))
            setRequestOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
