import { useMemo, useState } from 'react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  useGetProductsQuery,
  useGetProductCategoriesQuery,
  useGetSupplierMeQuery,
} from '../../services/api'
import { useAppSelector } from '../../hooks/redux'
import type { Product } from '../../types'
import { Loader2, Search, X } from 'lucide-react'

export type AppliesTo = 'all' | 'specific_products' | 'specific_categories'

export type DealTargetingValue = {
  appliesTo: AppliesTo
  productIds: string[]
  categoryIds: string[]
}

type Props = {
  value: DealTargetingValue
  onChange: (value: DealTargetingValue) => void
}

export function DealTargetingPickers({ value, onChange }: Props) {
  const [productSearch, setProductSearch] = useState('')
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  const { data: supplierMe } = useGetSupplierMeQuery(undefined, { skip: !isSupplier })
  const supplierId = supplierMe?.supplier?.id as string | undefined

  const { data: categoriesData, isLoading: categoriesLoading } = useGetProductCategoriesQuery()
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

  const categories = categoriesData?.categories || []
  const products: Product[] = productsData?.products ?? []

  const selectedProducts = useMemo(() => {
    const map = new Map(products.map((p) => [String(p.id), p]))
    return value.productIds.map((id) => ({
      id,
      name: String(map.get(id)?.name || id.slice(0, 8)),
    }))
  }, [value.productIds, products])

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

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-[var(--app-muted)]/30">
      <p className="text-xs text-[var(--text-muted)]">
        Limit which catalog items this deal applies to. Leave as all products for store-wide offers.
      </p>
      <div>
        <Label>Applies to</Label>
        <select
          className="mt-1 w-full h-10 border rounded-md px-3 text-sm"
          value={value.appliesTo}
          onChange={(e) => {
            const appliesTo = e.target.value as AppliesTo
            onChange({
              appliesTo,
              productIds: appliesTo === 'specific_products' ? value.productIds : [],
              categoryIds: appliesTo === 'specific_categories' ? value.categoryIds : [],
            })
          }}
        >
          <option value="all">All products</option>
          <option value="specific_products">Specific products</option>
          <option value="specific_categories">Specific categories</option>
        </select>
      </div>

      {value.appliesTo === 'specific_products' ? (
        <div className="space-y-2">
          <Label>Products</Label>
          {selectedProducts.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedProducts.map((p) => (
                <Badge key={p.id} variant="secondary" className="gap-1">
                  {p.name}
                  <button
                    type="button"
                    className="hover:opacity-70"
                    onClick={() => toggleProduct(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              className="pl-8"
              placeholder="Search products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
          {isSupplier && !supplierId ? (
            <p className="text-xs text-[var(--text-muted)]">Loading your catalog…</p>
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
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--app-muted)] ${
                      selected ? 'bg-[var(--brand)]/10 font-medium' : ''
                    }`}
                    onClick={() => toggleProduct(id)}
                  >
                    {String(p.name)}
                    {p.sku ? (
                      <span className="text-xs text-[var(--text-muted)] ml-2">{String(p.sku)}</span>
                    ) : null}
                  </button>
                )
              })}
              {products.length === 0 ? (
                <p className="px-3 py-4 text-xs text-[var(--text-muted)]">No products found</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {value.appliesTo === 'specific_categories' ? (
        <div className="space-y-2">
          <Label>Categories</Label>
          {categoriesLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {categories.map((c) => {
                const id = String(c.id)
                const checked = value.categoryIds.includes(id)
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 text-sm cursor-pointer px-1 py-1 rounded hover:bg-[var(--app-muted)]"
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleCategory(id)} />
                    {String(c.name)}
                  </label>
                )
              })}
              {categories.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No categories available</p>
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
              Clear selection
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
