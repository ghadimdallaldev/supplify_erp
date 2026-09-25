import { useGetSupplierPriceComparisonsQuery } from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { ArrowDown, CircleDollarSign } from 'lucide-react'
import { formatCurrency } from '../../utils/format'

export function SupplierPriceComparisonPanel() {
  const { data, isLoading } = useGetSupplierPriceComparisonsQuery({ limit: 8 })
  const comparisons = data?.comparisons ?? []

  return (
    <Card data-testid="supplier-price-comparison">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDollarSign className="h-5 w-5 text-[var(--mint)]" />
          Best prices from suppliers you follow
        </CardTitle>
        <CardDescription>
          Like-for-like products are matched by name, unit, brand, and currency. Minimum quantities
          are shown so you can compare accurately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : comparisons.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Follow at least two suppliers that sell the same product to see comparisons.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {comparisons.map((comparison) => (
              <div
                key={`${comparison.productName}-${comparison.unit}-${comparison.currency}`}
                className="rounded-xl border border-[var(--app-border)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{comparison.productName}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {[comparison.brand, comparison.unit].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {comparison.savings > 0 ? (
                    <Badge className="bg-[var(--mint-pale)] text-[var(--mint-dark)]">
                      <ArrowDown className="me-1 h-3 w-3" />
                      Save {comparison.savingsPercent}%
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Best price</p>
                    <p className="text-lg font-bold text-[var(--brand-deep)]">
                      {formatCurrency(Number(comparison.bestOffer.amount), {
                        currency: comparison.currency,
                      })}
                    </p>
                    <p className="text-xs">{comparison.bestOffer.supplierName}</p>
                  </div>
                  <p className="text-right text-xs text-[var(--text-muted)]">
                    {comparison.supplierCount} suppliers
                    <br />
                    Min. {comparison.bestOffer.minQty || 1} {comparison.unit || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
