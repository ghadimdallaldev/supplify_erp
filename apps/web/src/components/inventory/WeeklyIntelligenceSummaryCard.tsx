import { AlertTriangle, ClipboardList, PackageSearch, Receipt, Truck, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { useGetWeeklyIntelligenceSummaryQuery } from '../../services/api/endpoints/priceIntelligence'

const ITEMS = [
  { key: 'wasteHotspots', label: 'Waste hotspots', Icon: Trash2 },
  { key: 'supplierExceptions', label: 'Supplier exceptions', Icon: Truck },
  { key: 'overOrderedProducts', label: 'Over-ordering signals', Icon: ClipboardList },
  { key: 'invoicesWithAnomalies', label: 'Invoice anomalies', Icon: Receipt },
  { key: 'stockoutRisks', label: 'Stockout risks', Icon: PackageSearch },
] as const

export function WeeklyIntelligenceSummaryCard() {
  const { data, isLoading, isError } = useGetWeeklyIntelligenceSummaryQuery()

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />
  }
  if (isError || !data) return null

  const total = ITEMS.reduce((sum, item) => sum + data.summary[item.key], 0)

  return (
    <Card data-testid="weekly-intelligence-summary-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-[var(--brand-mid)]" />
          Weekly intelligence review
        </CardTitle>
        <CardDescription>
          Current review signals, using the evidence window shown by each source.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No review signals are currently flagged.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {ITEMS.map(({ key, label, Icon }) => (
              <li key={key} className="rounded-md border border-[var(--app-border)] p-3">
                <Icon className="mb-2 h-4 w-4 text-[var(--brand-mid)]" />
                <p className="text-xl font-semibold">{data.summary[key]}</p>
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
