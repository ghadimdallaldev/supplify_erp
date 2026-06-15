import { format } from 'date-fns'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '../../ui/button'
import { Skeleton } from '../../ui/skeleton'
import { StatusBadge } from '../../ui/status-badge'
import { EmptyState } from '../../ui/empty-state'
import { useGetStaffLabourSummaryQuery } from '../../../services/staffApi'
import {
  clampToISODate,
  StaffLabourSummaryStrip,
  StaffPanel,
  type StaffTabKey,
} from '../staffShared'
import { formatPrice } from '../../../utils/format'
import { getApiErrorMessage } from '../../../lib/apiError'

interface StaffTodayTabProps {
  onTabChange: (tab: StaffTabKey) => void
}

function formatCount(value: number | null | undefined, fallback = 'Not available') {
  if (value == null) return fallback
  return String(value)
}

export function StaffTodayTab({ onTabChange }: StaffTodayTabProps) {
  const today = clampToISODate(new Date())
  const { data, isLoading, isError, error, refetch } = useGetStaffLabourSummaryQuery({
    date: today,
  })

  if (isError) {
    return (
      <EmptyState
        title="Unable to load labour summary"
        description={getApiErrorMessage(error, 'Try again in a moment.')}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  const { counts, alerts, labourCostToday, overtimeRisk } = data
  const costDisplay = labourCostToday.available
    ? formatPrice(counts.estimatedLabourCostToday ?? 0)
    : 'Not available'

  const overtimeDisplay =
    counts.overtimeRiskCount != null
      ? counts.overtimeRiskCount
      : overtimeRisk?.length
        ? overtimeRisk.length
        : 'Not available'

  const summaryMetrics = [
    {
      label: 'Scheduled today',
      value: counts.scheduledToday,
      onClick: () => onTabChange('schedule'),
    },
    {
      label: 'Clocked in now',
      value: counts.clockedInNow,
      tone: 'mint' as const,
      onClick: () => onTabChange('team'),
    },
    {
      label: 'Late arrivals',
      value: formatCount(counts.lateArrivals),
      tone: counts.lateArrivals ? ('amber' as const) : undefined,
      onClick: () => onTabChange('schedule'),
    },
    {
      label: 'Missed clock-outs',
      value: counts.missedClockOuts,
      tone: counts.missedClockOuts ? ('amber' as const) : undefined,
      onClick: () => onTabChange('team'),
    },
    {
      label: 'Pending PTO',
      value: counts.pendingPto,
      onClick: () => onTabChange('pto'),
    },
    {
      label: 'Pending swaps',
      value: counts.pendingSwaps,
      onClick: () => onTabChange('schedule'),
    },
    {
      label: 'Est. labour cost',
      value: costDisplay,
      onClick: () => onTabChange('reports'),
    },
    {
      label: 'Overtime risk (>8h)',
      value: overtimeDisplay,
      tone:
        typeof overtimeDisplay === 'number' && overtimeDisplay > 0 ? ('amber' as const) : undefined,
      onClick: () => onTabChange('reports'),
    },
  ]

  return (
    <div className="space-y-4">
      <StaffLabourSummaryStrip metrics={summaryMetrics} />

      <StaffPanel
        title="Labour today"
        description={`Operational snapshot for ${format(new Date(data.date), 'EEEE, MMM d, yyyy')}. Estimates only — not legal payroll or OT compliance.`}
      >
        {data.meta?.openEntriesIncluded ? (
          <p className="text-xs text-[var(--text-mid)]">
            Open time entries count toward today&apos;s hours until clocked out.
          </p>
        ) : (
          <p className="text-xs text-[var(--text-mid)]">
            Tap any metric above to jump to the relevant tab.
          </p>
        )}
      </StaffPanel>

      <StaffPanel title="Needs attention" description="Operational alerts for your team today.">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--mint)]/30 bg-[var(--mint-pale)]/50 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--mint)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">All clear</p>
              <p className="text-xs text-[var(--text-mid)]">No operational alerts right now.</p>
            </div>
            <StatusBadge status="healthy" label="Healthy" className="ml-auto" />
          </div>
        ) : (
          <ul className="-mx-4 -mb-4 divide-y divide-[var(--app-border)] sm:-mx-5 sm:-mb-5">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={
                        alert.severity === 'critical'
                          ? 'FAILED'
                          : alert.severity === 'warning'
                            ? 'PENDING'
                            : 'ACKNOWLEDGED'
                      }
                      label={alert.severity}
                    />
                    <p className="text-sm font-semibold text-[var(--text)]">{alert.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-mid)]">{alert.message}</p>
                </div>
                {alert.deepLinkTab ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onTabChange(alert.deepLinkTab as StaffTabKey)}
                  >
                    View
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </StaffPanel>

      {overtimeRisk && overtimeRisk.length > 0 ? (
        <StaffPanel
          title="Overtime risk today"
          description="Staff over 8 hours worked (simple heuristic)."
        >
          <ul className="-mx-4 -mb-4 divide-y divide-[var(--app-border)] sm:-mx-5 sm:-mb-5">
            {overtimeRisk.map((row) => (
              <li
                key={row.staffId}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5"
              >
                <span className="font-medium text-[var(--text)]">{row.staffName}</span>
                <span className="tabular-nums text-[var(--text-mid)]">{row.hoursWorked}h</span>
              </li>
            ))}
          </ul>
        </StaffPanel>
      ) : null}
    </div>
  )
}
