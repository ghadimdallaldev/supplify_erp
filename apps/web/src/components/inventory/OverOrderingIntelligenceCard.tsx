import { useTranslation } from 'react-i18next'
import { AlertTriangle, Boxes } from 'lucide-react'

import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { useGetOverOrderingIntelligenceQuery } from '../../services/api/endpoints/priceIntelligence'

function amount(value: number | null, digits = 1): string {
  return value == null ? '—' : value.toFixed(digits)
}

/** Advanced comparison layer on the existing restaurant inventory workspace. */
export function OverOrderingIntelligenceCard({ days = 90 }: { days?: number }) {
  const { t } = useTranslation('inventory')
  const { data, isLoading, isError } = useGetOverOrderingIntelligenceQuery({ days })

  if (isLoading) return <Skeleton className="h-56 rounded-xl" />
  if (isError) return null

  const products = data?.products ?? []
  const summary = data?.summary

  return (
    <Card data-testid="over-ordering-intelligence-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          {t('overOrdering.title')}
        </CardTitle>
        <CardDescription>{t('overOrdering.description', { days })}</CardDescription>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('overOrdering.empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {products.map((product) => (
              <li key={product.productId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{product.productName}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {t('overOrdering.stockCoverage', {
                      days: amount(product.stock.coverageDays, 0),
                    })}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <span>
                    {t('overOrdering.ordered')}: <strong>{amount(product.orders.quantity)}</strong>
                  </span>
                  <span>
                    {t('overOrdering.received')}:{' '}
                    <strong>{amount(product.receiving.quantity)}</strong>
                  </span>
                  <span>
                    {t('overOrdering.used')}: <strong>{amount(product.usage.quantity)}</strong>
                  </span>
                  <span>
                    {t('overOrdering.waste')}: <strong>{amount(product.waste.quantity)}</strong>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.signals.map((signal) => (
                    <Badge key={signal} variant="secondary" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {t(`overOrdering.signals.${signal}`)}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {summary?.productsWithReceiptUnitMismatch ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {t('overOrdering.unitCoverage', {
              count: summary.productsWithReceiptUnitMismatch,
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
