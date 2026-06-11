import { format } from 'date-fns'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Skeleton } from '../../ui/skeleton'
import { StatusBadge } from '../../ui/status-badge'
import { EmptyState } from '../../ui/empty-state'
import { useGetStaffLabourSummaryQuery } from '../../../services/staffApi'
import { clampToISODate, type StaffTabKey } from '../staffShared'
import { formatPrice } from '../../../utils/format'
import { getApiErrorMessage } from '../../../lib/apiError'

interface StaffTodayTabProps {
  onTabChange: (tab: StaffTabKey) => void
}

function KpiCard({
  label,
  value,
  onClick,
}: {
  label: string
  value: string | number
  onClick?: () => void
}) {
  const content = (
    <div className="rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{value}</p>
    </div>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left transition hover:opacity-90">
        {content}
      </button>
    )
  }
  return content
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
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  const { counts, alerts, labourCostToday, overtimeRisk } = data
  const costDisplay = labourCostToday.available
    ? formatPrice(counts.estimatedLabourCostToday ?? 0)
    : 'Not available'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Labour Today</CardTitle>
          <CardDescription>
            Operational snapshot for {format(new Date(data.date), 'EEEE, MMM d, yyyy')}. Estimates
            only — not legal payroll or OT compliance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Scheduled today"
              value={counts.scheduledToday}
              onClick={() => onTabChange('schedule')}
            />
            <KpiCard
              label="Clocked in now"
              value={counts.clockedInNow}
              onClick={() => onTabChange('team')}
            />
            <KpiCard
              label="Late arrivals"
              value={formatCount(counts.lateArrivals)}
              onClick={() => onTabChange('schedule')}
            />
            <KpiCard
              label="Missed clock-outs"
              value={counts.missedClockOuts}
              onClick={() => onTabChange('team')}
            />
            <KpiCard
              label="Pending PTO"
              value={counts.pendingPto}
              onClick={() => onTabChange('pto')}
            />
            <KpiCard
              label="Pending swaps"
              value={counts.pendingSwaps}
              onClick={() => onTabChange('schedule')}
            />
            <KpiCard
              label="Est. labour cost today"
              value={costDisplay}
              onClick={() => onTabChange('reports')}
            />
            <KpiCard
              label="Overtime risk (>8h)"
              value={
                counts.overtimeRiskCount != null
                  ? counts.overtimeRiskCount
                  : overtimeRisk?.length
                    ? overtimeRisk.length
                    : 'Not available'
              }
              onClick={() => onTabChange('reports')}
            />
          </div>
          {data.meta?.openEntriesIncluded ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Open time entries count toward today&apos;s hours until clocked out.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
          <CardDescription>Operational alerts for your team today.</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--mint)]/30 bg-[var(--mint-pale)]/50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--mint)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">All clear</p>
                <p className="text-xs text-[var(--text-muted)]">No operational alerts right now.</p>
              </div>
              <StatusBadge status="healthy" label="Healthy" className="ml-auto" />
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex flex-col gap-2 rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
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
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{alert.message}</p>
                  </div>
                  {alert.deepLinkTab ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onTabChange(alert.deepLinkTab as StaffTabKey)}
                    >
                      View
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {overtimeRisk && overtimeRisk.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Overtime risk today</CardTitle>
            <CardDescription>Staff over {8} hours worked (simple heuristic).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overtimeRisk.map((row) => (
              <div
                key={row.staffId}
                className="flex items-center justify-between rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[var(--text)]">{row.staffName}</span>
                <span className="text-[var(--text-muted)]">{row.hoursWorked}h</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
