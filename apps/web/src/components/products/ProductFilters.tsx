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
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end w-full">
      {!isSupplier && (
        <div className="min-w-0 xl:col-span-2">
          <Label htmlFor="product-supplier-filter" className="sr-only">
            Supplier
          </Label>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger id="product-supplier-filter">
              <option value="">All Suppliers</option>
              {uniqueSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </SelectTrigger>
          </Select>
        </div>
      )}
      <div className={`min-w-0 ${!isSupplier ? 'xl:col-span-2' : 'sm:col-span-1 xl:col-span-3'}`}>
        <Label htmlFor="product-category-filter" className="sr-only">
          Category
        </Label>
        <Select
          value={categoryId}
          onValueChange={(value) => {
            setCategoryId(value)
            setCategory('')
          }}
        >
          <SelectTrigger id="product-category-filter">
            <option value="">All Categories</option>
            {categoriesData?.categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </SelectTrigger>
        </Select>
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
              className={cn(filterControlClass, 'min-w-0 sm:max-w-[7.5rem]')}
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
              className={cn(filterControlClass, 'min-w-0 sm:max-w-[7.5rem]')}
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
  )
}

export function ProductTagFilters({
  isSupplier,
  tagsData,
  selectedTags,
  setSelectedTags,
}: Pick<ProductFiltersProps, 'isSupplier' | 'tagsData' | 'selectedTags' | 'setSelectedTags'>) {
  if (isSupplier || !tagsData?.tags?.length) return null
  return (
    <div className="px-4 py-3">
      <Label className="text-sm font-medium">Filter by tags</Label>
      <div className="mt-2 flex flex-wrap gap-2">
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
  if (
    isSupplier ||
    !(supplierFilter || categoryId || category || selectedTags.length || minPrice || maxPrice)
  ) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
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
          Category: {categoriesData?.categories?.find((c) => c.id === categoryId)?.name || category}{' '}
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
  )
}
