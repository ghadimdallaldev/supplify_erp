import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { filterControlClass } from '../ui/filter-control'
import { cn } from '../../lib/utils'

type ProductFiltersProps = {
  isSupplier: boolean
  supplierFilter: string
  setSupplierFilter: (v: string) => void
  uniqueSuppliers: Array<{ id: string; name: string }>
  categoryId: string
  setCategoryId: (v: string) => void
  setCategory: (v: string) => void
  categoriesData: { categories?: Array<{ id: string; name: string }> } | undefined
  minPrice: string
  maxPrice: string
  setMinPrice: (v: string) => void
  setMaxPrice: (v: string) => void
  category: string
  selectedTags: string[]
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>
  tagsData: { tags?: string[] } | undefined
}

export function ProductFilterFields({
  isSupplier,
  supplierFilter,
  setSupplierFilter,
  uniqueSuppliers,
  categoryId,
  setCategoryId,
  setCategory,
  categoriesData,
  minPrice,
  maxPrice,
  setMinPrice,
  setMaxPrice,
}: Pick<
  ProductFiltersProps,
  | 'isSupplier'
  | 'supplierFilter'
  | 'setSupplierFilter'
  | 'uniqueSuppliers'
  | 'categoryId'
  | 'setCategoryId'
  | 'setCategory'
  | 'categoriesData'
  | 'minPrice'
  | 'maxPrice'
  | 'setMinPrice'
  | 'setMaxPrice'
>) {
  const { t } = useTranslation('products')
  const hasPriceFilter = Boolean(minPrice || maxPrice)

  const priceRangeFields = (
    <>
      <Label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
        {t('filters.priceRange')}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder={t('filters.minPrice')}
          aria-label={t('filters.minPriceAria')}
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          min="0"
          step="0.01"
          className={cn(filterControlClass, 'min-w-0 flex-1')}
        />
        <span className="shrink-0 text-sm text-[var(--text-muted)]">–</span>
        <Input
          type="number"
          placeholder={t('filters.maxPrice')}
          aria-label={t('filters.maxPriceAria')}
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          min="0"
          step="0.01"
          className={cn(filterControlClass, 'min-w-0 flex-1')}
        />
        {hasPriceFilter && (
          <Button
            variant="outline"
            size="sm"
            className="h-10 shrink-0 px-3"
            onClick={() => {
              setMinPrice('')
              setMaxPrice('')
            }}
          >
            {t('filters.clear')}
          </Button>
        )}
      </div>
    </>
  )

  return (
    <div className="grid min-w-0 w-full grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
      {!isSupplier && (
        <div className="min-w-0">
          <Label
            htmlFor="product-supplier-filter"
            className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]"
          >
            {t('filters.supplier')}
          </Label>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger id="product-supplier-filter">
              <option value="">{t('filters.allSuppliers')}</option>
              {uniqueSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </SelectTrigger>
          </Select>
        </div>
      )}
      <div className="min-w-0">
        <Label
          htmlFor="product-category-filter"
          className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]"
        >
          {t('filters.category')}
        </Label>
        <Select
          value={categoryId}
          onValueChange={(value) => {
            setCategoryId(value)
            setCategory('')
          }}
        >
          <SelectTrigger id="product-category-filter">
            <option value="">{t('filters.allCategories')}</option>
            {categoriesData?.categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </SelectTrigger>
        </Select>
      </div>
      {!isSupplier && <div className="min-w-0 sm:col-span-2 xl:col-span-1">{priceRangeFields}</div>}
    </div>
  )
}

export function ProductTagFilters({
  isSupplier,
  tagsData,
  selectedTags,
  setSelectedTags,
}: Pick<ProductFiltersProps, 'isSupplier' | 'tagsData' | 'selectedTags' | 'setSelectedTags'>) {
  const { t } = useTranslation('products')
  if (isSupplier || !tagsData?.tags?.length) return null
  return (
    <div className="px-4 py-3">
      <Label className="text-sm font-medium">{t('filters.filterByTags')}</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {tagsData.tags.map((tag) => (
          <Button
            key={tag}
            type="button"
            size="sm"
            variant={selectedTags.includes(tag) ? 'default' : 'outline'}
            className="min-h-10 rounded-full px-3 text-xs"
            aria-pressed={selectedTags.includes(tag)}
            onClick={() => {
              setSelectedTags((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
              )
            }}
          >
            {tag}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function ProductActiveFilters({
  isSupplier,
  supplierFilter,
  setSupplierFilter,
  categoryId,
  category,
  setCategoryId,
  setCategory,
  categoriesData,
  selectedTags,
  setSelectedTags,
  minPrice,
  maxPrice,
  setMinPrice,
  setMaxPrice,
}: Omit<ProductFiltersProps, 'uniqueSuppliers' | 'tagsData'>) {
  const { t } = useTranslation('products')
  if (
    isSupplier ||
    !(supplierFilter || categoryId || category || selectedTags.length || minPrice || maxPrice)
  ) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <span className="text-sm text-[var(--text-muted)]">{t('filters.filteredBy')}</span>
      {supplierFilter && (
        <Badge
          variant="secondary"
          className="cursor-pointer hover:bg-[var(--app-border-mid)]"
          onClick={() => setSupplierFilter('')}
        >
          {t('filters.filterSupplier', { value: supplierFilter })}
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
          {t('filters.filterCategory', {
            value: categoriesData?.categories?.find((c) => c.id === categoryId)?.name || category,
          })}{' '}
        </Badge>
      )}
      {selectedTags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="cursor-pointer hover:bg-[var(--app-border-mid)]"
          onClick={() => setSelectedTags((prev) => prev.filter((item) => item !== tag))}
        >
          {t('filters.filterTag', { value: tag })}
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
          {t('filters.filterPrice', { min: minPrice || '0', max: maxPrice || '∞' })}
        </Badge>
      )}
    </div>
  )
}
