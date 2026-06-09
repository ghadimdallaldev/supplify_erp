import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { DealCard } from '../../components/deals/DealCard'
import { useGetActivePromotionsQuery, useGetEntitlementsQuery } from '../../services/api'
import { getDealRedeemGate } from '../../lib/planLimits'
import { LIMIT_UPGRADE_COPY } from '../../lib/upgradeCopy'
import { Loader2, Sparkles, Store } from 'lucide-react'
import { useAppSelector } from '../../hooks/redux'
import { RESTAURANT_EMPTY_STATE } from '../../lib/dealDisplayLabels'
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
          <div className="flex justify-center py-16" aria-busy="true">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-mid)]" />
          </div>
        ) : promotions.length === 0 ? (
          <DealsEmptyState
            supplierFilter={supplierFilter}
            supplierName={suppliers.find(([id]) => id === supplierFilter)?.[1]}
            expiringSoon={expiringSoon}
            onClearSupplier={() => setSupplierFilter('')}
            onClearExpiringSoon={() => setExpiringSoon(false)}
          />
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
        Available deals
      </h1>
      <p className="text-xs text-[var(--text-muted)] mt-1">
        Supplier deals from suppliers you follow, plus sponsored placement from new suppliers
      </p>
    </div>
  )
}

function DealsEmptyState({
  supplierFilter,
  supplierName,
  expiringSoon,
  onClearSupplier,
  onClearExpiringSoon,
}: {
  supplierFilter: string
  supplierName?: string
  expiringSoon: boolean
  onClearSupplier: () => void
  onClearExpiringSoon: () => void
}) {
  if (supplierFilter) {
    return (
      <EmptyState
        title={supplierName ? `No deals from ${supplierName}` : 'No deals for this supplier'}
        description="They may not have active deals right now. Browse your full feed or pick another supplier."
        icon={<Store className="h-6 w-6" aria-hidden />}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onClearSupplier}>
            Show all suppliers
          </Button>
        }
      />
    )
  }

  if (expiringSoon) {
    return (
      <EmptyState
        title="No deals expiring in the next 7 days"
        description="Turn off “Expiring within 7 days” to see everything in your feed, or check back as new deals go live."
        icon={<Sparkles className="h-6 w-6" aria-hidden />}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onClearExpiringSoon}>
            Show all deals
          </Button>
        }
      />
    )
  }

  return (
    <EmptyState
      title={RESTAURANT_EMPTY_STATE.title}
      description={RESTAURANT_EMPTY_STATE.description}
      icon={<Sparkles className="h-6 w-6" aria-hidden />}
      action={
        <Button
          size="sm"
          asChild
          className="text-white"
          style={{ background: 'var(--brand)', borderColor: 'var(--brand)' }}
        >
          <Link to="/app/suppliers">Browse suppliers</Link>
        </Button>
      }
    />
  )
}
