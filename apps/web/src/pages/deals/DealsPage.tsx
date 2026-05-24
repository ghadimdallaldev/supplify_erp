import { useMemo, useState } from 'react'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { DealCard } from '../../components/deals/DealCard'
import { useGetActivePromotionsQuery } from '../../services/api'
import { Loader2, Sparkles } from 'lucide-react'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'biggest_discount', label: 'Biggest discount' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'sponsored', label: 'Sponsored first' },
]

export function DealsPage() {
  const [sort, setSort] = useState('newest')
  const [expiringSoon, setExpiringSoon] = useState(false)
  const [supplierFilter, setSupplierFilter] = useState('')

  const queryParams = useMemo(
    () => ({
      sort,
      expiringSoon: expiringSoon ? 'true' : undefined,
      supplierId: supplierFilter || undefined,
    }),
    [sort, expiringSoon, supplierFilter]
  )

  const { data, isLoading } = useGetActivePromotionsQuery(queryParams)
  const promotions = data?.promotions || []

  const suppliers = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of promotions) {
      if (p.supplier_id && p.supplier_name) {
        map.set(String(p.supplier_id), String(p.supplier_name))
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [promotions])

  const sponsoredCount = promotions.filter((p) => p.is_sponsored).length

  return (
    <div className="space-y-6">
      <motionDealsHeader />
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
          <div>
            <Label>Sort</Label>
            <select
              className="mt-1 h-10 rounded-md border px-3 text-sm block min-w-[160px]"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Supplier</Label>
            <select
              className="mt-1 h-10 rounded-md border px-3 text-sm block min-w-[180px]"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
            >
              <option value="">All suppliers</option>
              {suppliers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={expiringSoon}
              onChange={(e) => setExpiringSoon(e.target.checked)}
            />
            Expiring within 7 days
          </label>
        </CardContent>
      </Card>

      {sponsoredCount > 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {sponsoredCount} sponsored {sponsoredCount === 1 ? 'deal' : 'deals'} in your feed
        </p>
      ) : null}

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : promotions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--text-muted)]">
            No deals available right now. Follow suppliers or check back for sponsored promotions.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {promotions.map((p) => (
            <DealCard key={String(p.id)} deal={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function motionDealsHeader() {
  return (
    <div>
      <h1 className="text-[21px] font-black text-[var(--text)] flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[var(--brand)]" />
        Deals & promotions
      </h1>
      <p className="text-xs text-[var(--text-muted)] mt-1">
        Deals from suppliers you follow, plus sponsored offers from new suppliers
      </p>
    </div>
  )
}
