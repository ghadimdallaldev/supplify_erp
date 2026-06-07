import { RefreshCw, Radio, Truck } from 'lucide-react'
import { Button } from '../ui/button'

type Props = {
  activeCount: number
  doneCount: number
  trackingActive: boolean
  trackableCount: number
  isLoading: boolean
  onRefresh: () => void
}

export function DriverDeliveriesHeader({
  activeCount,
  doneCount,
  trackingActive,
  trackableCount,
  isLoading,
  onRefresh,
}: Props) {
  return (
    <div className="space-y-3" data-testid="driver-deliveries-header">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-mid)]/10 text-[var(--brand-mid)]">
              <Truck className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text)]">My deliveries</h1>
              <p className="text-sm text-[var(--text-muted)]">Tap an action when you arrive</p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh deliveries"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text)]">
          {activeCount} active
        </span>
        {doneCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            {doneCount} done
          </span>
        ) : null}
        {trackableCount > 0 ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
              trackingActive
                ? 'bg-emerald-600 text-white'
                : 'border border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
            data-testid="driver-gps-tracking-badge"
          >
            <Radio className="h-3 w-3" aria-hidden />
            {trackingActive ? 'Live GPS' : 'GPS waiting'}
          </span>
        ) : null}
      </div>
    </div>
  )
}
