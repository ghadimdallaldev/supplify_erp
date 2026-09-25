import { useTranslation } from 'react-i18next'
import { AlertTriangle, TrendingUp } from 'lucide-react'

import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { useGetWasteIntelligenceQuery } from '../../services/api/endpoints/priceIntelligence'
import { formatCurrency } from '../../utils/format'

function percent(value: number | null): string {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

/** Advanced signals on top of the existing descriptive Waste & spoilage report. */
export function WasteIntelligenceCard({ days }: { days: number }) {
  const { t } = useTranslation('inventory')
  const { data, isLoading, isError } = useGetWasteIntelligenceQuery({ days })

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />
  if (isError) return null

  const summary = data?.summary
  const hotspots = data?.hotspots ?? []
  const uncosted = summary?.current.costCoverage.uncostedIncidents ?? 0

  return (
    <Card data-testid="waste-intelligence-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {t('wasteIntelligence.title')}
        </CardTitle>
        <CardDescription>{t('wasteIntelligence.description', { days })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>
              {t('wasteIntelligence.currentCost')}:{' '}
              <strong>
                {summary.current.wasteCost == null
                  ? '—'
                  : formatCurrency(summary.current.wasteCost)}
              </strong>
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              {t('wasteIntelligence.changeFromPrevious')}:{' '}
              <strong>{percent(summary.costChangePct)}</strong>
            </span>
          </div>
        ) : null}

        {hotspots.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('wasteIntelligence.empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {hotspots.map((hotspot) => (
              <li key={hotspot.productId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{hotspot.productName}</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {hotspot.currentWasteCost == null
                      ? '—'
                      : formatCurrency(hotspot.currentWasteCost)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {hotspot.signals.includes('repeated_waste') ? (
                    <Badge variant="secondary">
                      {t('wasteIntelligence.repeated', { count: hotspot.currentIncidents })}
                    </Badge>
                  ) : null}
                  {hotspot.signals.includes('rising_waste_cost') ? (
                    <Badge variant="destructive">
                      {t('wasteIntelligence.costRising', { pct: percent(hotspot.costChangePct) })}
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {uncosted > 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t('wasteIntelligence.missingCostCoverage', { count: uncosted })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
