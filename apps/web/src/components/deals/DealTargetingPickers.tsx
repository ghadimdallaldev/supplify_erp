import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Select, SelectTrigger } from '../ui/select'
import {
  useGetProductsQuery,
  useGetProductCategoriesQuery,
  useGetShelvesQuery,
  useGetSupplierMeQuery,
} from '../../services/api'
import { useAppSelector } from '../../hooks/redux'
import { ensureNamespace } from '../../i18n'
import type { CategoryDepartment, Product, SupplierShelf } from '../../types'
import { localizedName } from '../../lib/categoryLabel'
import { Loader2, Search, X } from 'lucide-react'
import { RESTAURANT_BUSINESS_TYPES } from '../../lib/restaurantBusinessTypes'

export type AppliesTo = 'all' | 'specific_products' | 'specific_categories' | 'specific_shelves'

export type DealTargetingValue = {
  appliesTo: AppliesTo
  productIds: string[]
  /** Leaf platform categories (the deal covers this supplier's products in them). */
  categoryIds: string[]
  /** The supplier's own shelves. */
  shelfIds: string[]
  restaurantTypes: string[]
  areas: string[]
}

type Props = {
  value: DealTargetingValue
  onChange: (value: DealTargetingValue) => void
}

export function DealTargetingPickers({ value, onChange }: Props) {
  const { t, i18n } = useTranslation('deals')
  const [productSearch, setProductSearch] = useState('')
  const [areaDraft, setAreaDraft] = useState('')
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  const { data: supplierMe } = useGetSupplierMeQuery(undefined, { skip: !isSupplier })
  const supplierId = supplierMe?.supplier?.id as string | undefined

  const { data: categoriesData, isLoading: categoriesLoading } = useGetProductCategoriesQuery(
    undefined,
    { skip: value.appliesTo !== 'specific_categories' }
  )
  const { data: shelvesData, isLoading: shelvesLoading } = useGetShelvesQuery(undefined, {
    skip: value.appliesTo !== 'specific_shelves' || !isSupplier,
  })
  const productsEnabled =
    value.appliesTo === 'specific_products' && (!isSupplier || Boolean(supplierId))
  const { data: productsData, isLoading: productsLoading } = useGetProductsQuery(
    {
      q: productSearch || undefined,
      limit: 200,
      supplier: supplierId,
    },
    { skip: !productsEnabled }
  )

  // Supplier counts are their own products: offer only the leaves they actually sell in.
  const departments = useMemo(
    () =>
      ((categoriesData?.departments ?? []) as CategoryDepartment[])
        .map((d) => ({ ...d, categories: d.categories.filter((c) => c.product_count > 0) }))
        .filter((d) => d.categories.length > 0),
    [categoriesData?.departments]
  )
  const shelves = (shelvesData?.shelves ?? []) as SupplierShelf[]
  const products = useMemo(
    () => (productsData?.products ?? []) as Product[],
    [productsData?.products]
  )

  const selectedProducts = useMemo(() => {
    const map = new Map(products.map((p) => [String(p.id), p]))
    return value.productIds.map((id) => ({
      id,
      name: String(map.get(id)?.name || id.slice(0, 8)),
    }))
  }, [value.productIds, products])

  useEffect(() => {
    void ensureNamespace('deals')
  }, [])

  const toggleProduct = (productId: string) => {
    const set = new Set(value.productIds)
    if (set.has(productId)) set.delete(productId)
    else set.add(productId)
    onChange({ ...value, productIds: [...set] })
  }

  const toggleCategory = (categoryId: string) => {
    const set = new Set(value.categoryIds)
    if (set.has(categoryId)) set.delete(categoryId)
    else set.add(categoryId)
    onChange({ ...value, categoryIds: [...set] })
  }

  const toggleShelf = (shelfId: string) => {
    const set = new Set(value.shelfIds)
    if (set.has(shelfId)) set.delete(shelfId)
    else set.add(shelfId)
    onChange({ ...value, shelfIds: [...set] })
  }

  const toggleRestaurantType = (type: string) => {
    const set = new Set(value.restaurantTypes || [])
    if (set.has(type)) set.delete(type)
    else set.add(type)
    onChange({ ...value, restaurantTypes: [...set] })
  }

  const addArea = () => {
    const area = areaDraft.trim()
    if (!area) return
    const set = new Set(value.areas || [])
    set.add(area)
    onChange({ ...value, areas: [...set] })
    setAreaDraft('')
  }

  const removeArea = (area: string) => {
    onChange({
      ...value,
      areas: (value.areas || []).filter((a) => a !== area),
    })
  }

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-[var(--app-muted)]/30">
      <p className="text-xs text-[var(--text-muted)]">{t('targeting.helperText')}</p>
      <div>
        <Label htmlFor="deal-applies-to">{t('targeting.appliesTo')}</Label>
        <Select
          value={value.appliesTo}
          onValueChange={(v) => {
            const appliesTo = v as AppliesTo
            // One kind of target per deal; switching clears the others.
            onChange({
              ...value,
              appliesTo,
              productIds: appliesTo === 'specific_products' ? value.productIds : [],
              categoryIds: appliesTo === 'specific_categories' ? value.categoryIds : [],
              shelfIds: appliesTo === 'specific_shelves' ? value.shelfIds : [],
            })
          }}
        >
          <SelectTrigger id="deal-applies-to" className="mt-1">
            <option value="all">{t('targeting.allProducts')}</option>
            <option value="specific_products">{t('targeting.specificProducts')}</option>
            <option value="specific_categories">{t('targeting.specificCategories')}</option>
            {isSupplier ? (
              <option value="specific_shelves">{t('targeting.specificShelves')}</option>
            ) : null}
          </SelectTrigger>
        </Select>
      </div>

      {value.appliesTo === 'specific_products' ? (
        <div className="space-y-2">
          <Label>{t('targeting.products')}</Label>
          {selectedProducts.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedProducts.map((p) => (
                <Badge key={p.id} variant="secondary" className="gap-1">
                  {p.name}
                  <button
                    type="button"
                    className="hover:opacity-70"
                    onClick={() => toggleProduct(p.id)}
                    aria-label={t('targeting.removeProduct', { name: p.name })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Search className="absolute start-2 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              className="ps-8"
              placeholder={t('targeting.searchProducts')}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
          {isSupplier && !supplierId ? (
            <p className="text-xs text-[var(--text-muted)]">{t('targeting.loadingCatalog')}</p>
          ) : productsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
              {products.map((p) => {
                const id = String(p.id)
                const selected = value.productIds.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    className={`w-full text-start px-3 py-2 text-sm hover:bg-[var(--app-bg-subtle)] ${
                      selected ? 'bg-[var(--brand)]/10 font-medium' : ''
                    }`}
                    onClick={() => toggleProduct(id)}
                  >
                    {String(p.name)}
                    {p.sku ? (
                      <span className="text-xs text-[var(--text-muted)] ms-2">{String(p.sku)}</span>
                    ) : null}
                  </button>
                )
              })}
              {products.length === 0 ? (
                <p className="px-3 py-4 text-xs text-[var(--text-muted)]">
                  {t('targeting.noProductsFound')}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {value.appliesTo === 'specific_categories' ? (
        <div className="space-y-2">
          <Label>{t('targeting.categories')}</Label>
          <p className="text-xs text-[var(--text-muted)]">{t('targeting.categoriesHelper')}</p>
          {categoriesLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="max-h-56 overflow-y-auto border rounded-md p-2 space-y-2">
              {departments.map((dept) => (
                <div key={dept.id} role="group" aria-label={localizedName(dept, i18n.language)}>
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {localizedName(dept, i18n.language)}
                  </p>
                  {dept.categories.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-sm cursor-pointer px-1 py-1 rounded hover:bg-[var(--app-bg-subtle)]"
                    >
                      <input
                        type="checkbox"
                        checked={value.categoryIds.includes(c.id)}
                        onChange={() => toggleCategory(c.id)}
                      />
                      <span className="flex-1">{localizedName(c, i18n.language)}</span>
                      <span className="text-xs tabular-nums text-[var(--text-muted)]">
                        {c.product_count}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
              {departments.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {t('targeting.noCategoriesAvailable')}
                </p>
              ) : null}
            </div>
          )}
          {value.categoryIds.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...value, categoryIds: [] })}
            >
              {t('targeting.clearSelection')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {value.appliesTo === 'specific_shelves' ? (
        <div className="space-y-2">
          <Label>{t('targeting.shelves')}</Label>
          {shelvesLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {shelves.map((shelf) => (
                <label
                  key={shelf.id}
                  className="flex items-center gap-2 text-sm cursor-pointer px-1 py-1 rounded hover:bg-[var(--app-bg-subtle)]"
                >
                  <input
                    type="checkbox"
                    checked={value.shelfIds.includes(shelf.id)}
                    onChange={() => toggleShelf(shelf.id)}
                  />
                  <span className="flex-1">{localizedName(shelf, i18n.language)}</span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {shelf.product_count}
                  </span>
                </label>
              ))}
              {shelves.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">{t('targeting.noShelves')}</p>
              ) : null}
            </div>
          )}
          {value.shelfIds.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...value, shelfIds: [] })}
            >
              {t('targeting.clearSelection')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 border-t pt-3">
        <Label>{t('targeting.audienceTitle')}</Label>
        <p className="text-xs text-[var(--text-muted)]">{t('targeting.audienceHelper')}</p>
        <div className="flex flex-wrap gap-2">
          {RESTAURANT_BUSINESS_TYPES.map((type) => {
            const selected = (value.restaurantTypes || []).includes(type)
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleRestaurantType(type)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  selected
                    ? 'border-[var(--brand)] bg-[var(--brand)]/10 font-medium'
                    : 'hover:bg-[var(--app-bg-subtle)]'
                }`}
              >
                {t(`targeting.restaurantTypes.${type}`, { defaultValue: type.replace(/_/g, ' ') })}
              </button>
            )
          })}
        </div>
        <div className="space-y-2">
          <Label>{t('targeting.areas')}</Label>
          {(value.areas || []).length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {(value.areas || []).map((area) => (
                <Badge key={area} variant="secondary" className="gap-1">
                  {area}
                  <button
                    type="button"
                    className="hover:opacity-70"
                    onClick={() => removeArea(area)}
                    aria-label={t('targeting.removeArea', { area })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input
              placeholder={t('targeting.areaPlaceholder')}
              value={areaDraft}
              onChange={(e) => setAreaDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addArea()
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addArea}>
              {t('targeting.addArea')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
