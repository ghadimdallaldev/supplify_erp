import { RefreshCw, Radio } from 'lucide-react'
import { Button } from '../ui/button'
import { PageHeader } from '../ui/page-header'
import { getDriverGpsBannerLabel } from '../../lib/driverDeliveryUi'

type Props = {
  activeCount: number
  doneCount: number
  trackingActive: boolean
  trackableCount: number
  permissionDenied: boolean
  gpsError?: string | null
  pendingLocationCount?: number
  lastSyncedAt?: string | null
  isLoading: boolean
  onRefresh: () => void
  onStartTracking?: () => void
  onStopTracking?: () => void
}

export function DriverDeliveriesHeader({
  activeCount,
  doneCount,
  trackingActive,
  trackableCount,
  permissionDenied,
  gpsError,
  pendingLocationCount = 0,
  lastSyncedAt = null,
  isLoading,
  onRefresh,
  onStartTracking,
  onStopTracking,
}: Props) {
  const gpsLabel = getDriverGpsBannerLabel({
    trackableCount,
    trackingActive,
    permissionDenied,
    gpsError,
  })

  return (
    <div className="space-y-3" data-testid="driver-deliveries-header">
      <PageHeader
        title="Today's deliveries"
        description="Tap a button when you arrive"
        size="compact"
        actions={
          <div className="flex items-center gap-2">
            {trackableCount > 0 && (onStartTracking || onStopTracking) ? (
              <Button
                variant={trackingActive ? 'outline' : 'default'}
                size="sm"
                className="h-10 rounded-xl"
                onClick={() => (trackingActive ? onStopTracking?.() : onStartTracking?.())}
              >
                {trackingActive ? 'Stop sharing' : 'Start sharing'}
              </Button>
            ) : null}
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
        }
      />

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text)]">
          {activeCount} active
        </span>
        {doneCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            {doneCount} done
          </span>
        ) : null}
        {pendingLocationCount > 0 ? (
          <span
            className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            data-testid="driver-gps-pending-count"
          >
            {pendingLocationCount} location{pendingLocationCount === 1 ? '' : 's'} waiting to sync
          </span>
        ) : null}
        {lastSyncedAt ? (
          <span className="text-xs text-[var(--text-muted)]">
            Last sync {new Date(lastSyncedAt).toLocaleTimeString()}
          </span>
        ) : null}{' '}
        {gpsLabel ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
              trackingActive
                ? 'bg-emerald-600 text-white'
                : permissionDenied || gpsError
                  ? 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
                  : 'border border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
            data-testid="driver-gps-tracking-badge"
          >
            <Radio className="h-3 w-3" aria-hidden />
            {gpsLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}
