import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useGetProductCategoriesQuery, useUpdateProductMutation } from '../../services/api'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { CategoryCombobox } from './CategoryCombobox'
import type { CategoryDepartment } from '../../types'

type FixableProduct = { id: string; name: string; category_needs_review?: boolean }

/**
 * Supplier catalog: the amber "Needs a category" badge opens a picker; choosing a category saves
 * it straight away (PATCH category_id clears the review flag).
 */
export function ProductCategoryFixer({ product }: { product: FixableProduct }) {
  const { t } = useTranslation('products')
  const [open, setOpen] = useState(false)
  const { data } = useGetProductCategoriesQuery(undefined, { skip: !open })
  const departments = (data?.departments ?? []) as CategoryDepartment[]
  const [updateProduct, { isLoading }] = useUpdateProductMutation()

  const choose = async (categoryId: string) => {
    try {
      await updateProduct({ id: product.id, data: { category_id: categoryId } }).unwrap()
      toast.success(t('categories.categorySaved'))
      setOpen(false)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('categories.categorySaveFailed'))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`product-needs-category-${product.id}`}
          className="inline-flex items-center rounded-full bg-[var(--amber-pale)] px-2 py-0.5 text-xs font-medium text-[var(--amber)] hover:underline"
        >
          {t('categories.needsReviewBadge')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3">
        <p className="text-sm font-medium">{t('categories.fixTitle', { name: product.name })}</p>
        <CategoryCombobox
          departments={departments}
          value=""
          onChange={(id) => void choose(id)}
          productName={product.name}
          ariaLabel={t('categories.categoryFor', { name: product.name })}
          autoSelect={false}
          disabled={isLoading}
        />
      </PopoverContent>
    </Popover>
  )
}
