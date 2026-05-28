import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { DealCard } from '../../components/deals/DealCard'
import { useGetActivePromotionsQuery, useGetEntitlementsQuery } from '../../services/api'
import { getDealRedeemGate } from '../../lib/planLimits'
import { LIMIT_UPGRADE_COPY } from '../../lib/upgradeCopy'
import { Loader2, Sparkles } from 'lucide-react'
import { useAppSelector } from '../../hooks/redux'
import { RequirePermission } from '../../components/RequirePermission'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'biggest_discount', label: 'Biggest discount' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'sponsored', label: 'Sponsored first' },
]

export function DealsPage() {
  const [searchParams] = useSearchParams()
  const highlightDealId = searchParams.get('highlight') || ''
  const [sort, setSort] = useState('newest')
  const [expiringSoon, setExpiringSoon] = useState(false)
  const [supplierFilter, setSupplierFilter] = useState(searchParams.get('supplierId') || '')
  const { user } = useAppSelector((state) => state.auth)
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !user || user.role !== 'RESTAURANT',
  })
  const dealRedeemGate = getDealRedeemGate(entitlementsData?.entitlements)
  const canRedeem = dealRedeemGate.canRedeem
  const redeemCopy = LIMIT_UPGRADE_COPY.deal_redemptions_per_day

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

  useEffect(() => {
    const supplierFromUrl = searchParams.get('supplierId')
    if (supplierFromUrl) setSupplierFilter(supplierFromUrl)
  }, [searchParams])

  useEffect(() => {
    if (!highlightDealId || isLoading || promotions.length === 0) return
    const el = document.getElementById(`deal-card-${highlightDealId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightDealId, isLoading, promotions.length])

  return (
    <RequirePermission anyOf={['ORDERS_VIEW', 'CATALOG_VIEW']} title="deals">
      <div className="space-y-6">
        <MotionDealsHeader />
        {!canRedeem ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            {dealRedeemGate.message || redeemCopy.value}
          </div>
        ) : dealRedeemGate.limit != null ? (
          <p className="text-sm text-[var(--text-muted)]">
            Deal redemptions today: {dealRedeemGate.current}/{dealRedeemGate.limit}
          </p>
        ) : null}
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
              <div
                key={String(p.id)}
                id={`deal-card-${String(p.id)}`}
                className={
                  highlightDealId && String(p.id) === highlightDealId
                    ? 'ring-2 ring-[var(--brand)] rounded-xl'
                    : undefined
                }
              >
                <DealCard deal={p} canRedeem={canRedeem} />
              </div>
            ))}
          </div>
        )}
      </div>
    </RequirePermission>
  )
}

function MotionDealsHeader() {
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
