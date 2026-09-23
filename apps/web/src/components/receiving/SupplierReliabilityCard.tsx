import { useTranslation } from 'react-i18next'
import { AlertTriangle, Truck } from 'lucide-react'

import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { useGetSupplierReliabilityQuery } from '../../services/api/endpoints/priceIntelligence'

function percentage(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`
}

/** Advanced facts layered on the existing receiving and quality workflow. */
export function SupplierReliabilityCard({ days = 90 }: { days?: number }) {
  const { t } = useTranslation('orders')
  const { data, isLoading, isError } = useGetSupplierReliabilityQuery({ days })

  if (isLoading) return <Skeleton className="h-56 rounded-xl" />
  if (isError) return null

  const suppliers = data?.suppliers ?? []

  return (
    <Card data-testid="supplier-reliability-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          {t('supplierReliability.title')}
        </CardTitle>
        <CardDescription>{t('supplierReliability.description', { days })}</CardDescription>
      </CardHeader>
      <CardContent>
        {suppliers.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('supplierReliability.empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {suppliers.map((supplier) => (
              <li key={supplier.supplierId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{supplier.supplierName}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {t('supplierReliability.ordersCompleted', {
                      completed: supplier.orders.completed,
                      placed: supplier.orders.placed,
                    })}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <span>
                    {t('supplierReliability.fillRate')}:{' '}
                    <strong>{percentage(supplier.receiving.fillRatePct)}</strong>
                  </span>
                  <span>
                    {t('supplierReliability.quality')}:{' '}
                    <strong>{supplier.receiving.averageQualityScore ?? '—'}</strong>
                  </span>
                  <span>
                    {t('supplierReliability.onTime')}:{' '}
                    <strong>{percentage(supplier.delivery.onTimeRatePct)}</strong>
                  </span>
                  <span>
                    {t('supplierReliability.openDisputes')}:{' '}
                    <strong>{supplier.disputes.unresolvedDisputedOrders}</strong>
                  </span>
                </div>
                {supplier.signals.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {supplier.signals.map((signal) => (
                      <Badge key={signal} variant="secondary" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t(`supplierReliability.signals.${signal}`)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
