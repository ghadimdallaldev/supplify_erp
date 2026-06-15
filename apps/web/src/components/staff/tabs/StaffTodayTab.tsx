import { format } from 'date-fns'
import type { ComponentProps } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  LogOut,
  Palmtree,
  Timer,
  UserCheck,
} from 'lucide-react'
import { Button } from '../../ui/button'
import { Skeleton } from '../../ui/skeleton'
import { StatusBadge } from '../../ui/status-badge'
import { EmptyState } from '../../ui/empty-state'
import { KpiCard } from '../../ui/kpi-card'
import { useGetStaffLabourSummaryQuery } from '../../../services/staffApi'
import { clampToISODate, StaffPanel, type StaffTabKey } from '../staffShared'
import { formatPrice } from '../../../utils/format'
import { getApiErrorMessage } from '../../../lib/apiError'
import { cn } from '../../../lib/utils'

interface StaffTodayTabProps {
  onTabChange: (tab: StaffTabKey) => void
}

function metricCount(value: number | null | undefined) {
  if (value == null) return '—'
  return String(value)
}

function StaffMetricCard({
  onClick,
  className,
  ...props
}: ComponentProps<typeof KpiCard> & { onClick?: () => void; className?: string }) {
  const card = <KpiCard size="sm" className={cn('h-full', className)} {...props} />

  if (!onClick) return card

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)] focus-visible:ring-offset-2"
    >
      {card}
    </button>
  )
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
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  const { counts, alerts, labourCostToday, overtimeRisk } = data
  const formattedDate = format(new Date(data.date), 'EEEE, MMMM d, yyyy')
  const overtimeCount =
    counts.overtimeRiskCount ?? (overtimeRisk?.length ? overtimeRisk.length : null)

  const coverageMetrics = [
    {
      label: 'Scheduled today',
      value: counts.scheduledToday,
      icon: CalendarDays,
      tone: 'brand' as const,
      description: 'Shifts on the roster',
      onClick: () => onTabChange('schedule'),
    },
    {
      label: 'Clocked in now',
      value: counts.clockedInNow,
      icon: UserCheck,
      tone: 'success' as const,
      description: 'Currently on the clock',
      onClick: () => onTabChange('team'),
    },
    {
      label: 'Late arrivals',
      value: metricCount(counts.lateArrivals),
      icon: Clock,
      tone:
        counts.lateArrivals != null && counts.lateArrivals > 0
          ? ('warning' as const)
          : ('neutral' as const),
      description:
        counts.lateArrivals == null ? 'Not tracked on this plan' : 'Behind scheduled start',
      onClick: () => onTabChange('schedule'),
    },
    {
      label: 'Missed clock-outs',
      value: counts.missedClockOuts,
      icon: LogOut,
      tone: counts.missedClockOuts > 0 ? ('warning' as const) : ('neutral' as const),
      description: 'Still open from prior shifts',
      onClick: () => onTabChange('team'),
    },
  ]

  const opsMetrics = [
    {
      label: 'Pending PTO',
      value: counts.pendingPto,
      icon: Palmtree,
      tone: counts.pendingPto > 0 ? ('info' as const) : ('neutral' as const),
      description: 'Awaiting manager review',
      onClick: () => onTabChange('pto'),
    },
    {
      label: 'Pending swaps',
      value: counts.pendingSwaps,
      icon: ArrowLeftRight,
      tone: counts.pendingSwaps > 0 ? ('info' as const) : ('neutral' as const),
      description: 'Shift change requests',
      onClick: () => onTabChange('schedule'),
    },
    {
      label: 'Est. labour cost',
      value: labourCostToday.available ? formatPrice(counts.estimatedLabourCostToday ?? 0) : '—',
      icon: DollarSign,
      tone: labourCostToday.available ? ('brand' as const) : ('neutral' as const),
      description: labourCostToday.available
        ? 'Today’s hours × wage rates'
        : 'Add wage rates to estimate',
      onClick: () => onTabChange('reports'),
    },
    {
      label: 'Overtime risk',
      value: metricCount(overtimeCount),
      icon: AlertTriangle,
      tone:
        overtimeCount != null && overtimeCount > 0 ? ('warning' as const) : ('neutral' as const),
      description: 'Staff over 8 hours today',
      onClick: () => onTabChange('reports'),
    },
  ]

  const attentionCount = alerts.length
  const pendingActions = counts.pendingPto + counts.pendingSwaps
  const attendanceIssues =
    (counts.lateArrivals ?? 0) + counts.missedClockOuts + (overtimeCount ?? 0)

  return (
    <div className="space-y-5">
      <section
        data-testid="staff-labour-hero"
        className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-gradient-to-br from-[var(--brand-ultra)] via-[var(--surface)] to-[var(--surface)] p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-mid)]">
              Labour today
            </p>
            <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">{formattedDate}</h2>
            <p className="max-w-xl text-sm text-[var(--text-muted)]">
              Coverage, attendance, and approvals at a glance. Estimates only — not legal payroll or
              overtime compliance.
            </p>
            {data.meta?.openEntriesIncluded ? (
              <p className="text-xs text-[var(--text-mid)]">
                Open time entries count toward today&apos;s hours until staff clock out.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button size="sm" onClick={() => onTabChange('schedule')}>
              <CalendarDays className="mr-1.5 h-4 w-4" aria-hidden />
              Schedule
            </Button>
            <Button size="sm" variant="outline" onClick={() => onTabChange('team')}>
              Team roster
            </Button>
            {pendingActions > 0 ? (
              <Button size="sm" variant="outline" onClick={() => onTabChange('pto')}>
                {pendingActions} pending approval{pendingActions === 1 ? '' : 's'}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">Coverage & attendance</h3>
          <p className="text-xs text-[var(--text-muted)]">Tap a card to open the related tab</p>
        </div>
        <div
          data-testid="staff-labour-summary"
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          {coverageMetrics.map((metric) => (
            <StaffMetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">Requests & labour cost</h3>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {opsMetrics.map((metric) => (
            <StaffMetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StaffPanel
          title="Needs attention"
          description={
            attentionCount > 0
              ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need a manager look`
              : 'Operational alerts for your team today'
          }
        >
          {alerts.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--mint)]/25 bg-[var(--mint-pale)]/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mint-pale)]">
                <CheckCircle2 className="h-5 w-5 text-[var(--mint)]" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">All clear</p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {attendanceIssues === 0 && pendingActions === 0
                    ? 'No late arrivals, open approvals, or overtime flags right now.'
                    : 'No critical alerts — review the metrics above for follow-ups.'}
                </p>
              </div>
              <StatusBadge status="healthy" label="Healthy" className="shrink-0" />
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
            description="Staff over 8 hours worked — simple heuristic, not compliance advice."
          >
            <ul className="-mx-4 -mb-4 divide-y divide-[var(--app-border)] sm:-mx-5 sm:-mb-5">
              {overtimeRisk.map((row) => (
                <li
                  key={row.staffId}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--amber-pale)]">
                      <Timer className="h-4 w-4 text-[var(--amber)]" aria-hidden />
                    </span>
                    <span className="truncate font-medium text-[var(--text)]">{row.staffName}</span>
                  </div>
                  <span className="shrink-0 tabular-nums font-semibold text-[var(--amber)]">
                    {row.hoursWorked}h
                  </span>
                </li>
              ))}
            </ul>
          </StaffPanel>
        ) : (
          <StaffPanel title="Quick actions" description="Common manager workflows for today.">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() => onTabChange('schedule')}
              >
                <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
                <span>
                  <span className="block text-sm font-medium">Adjust today&apos;s schedule</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    Shifts, swaps, and time entries
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() => onTabChange('pto')}
              >
                <Palmtree className="mr-2 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
                <span>
                  <span className="block text-sm font-medium">Review time off</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    Approve or decline PTO requests
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() => onTabChange('team')}
              >
                <UserCheck className="mr-2 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
                <span>
                  <span className="block text-sm font-medium">Check who&apos;s working</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    Live clock-in status by team member
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() => onTabChange('reports')}
              >
                <DollarSign className="mr-2 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
                <span>
                  <span className="block text-sm font-medium">Payroll preview</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    Hours and estimated labour cost
                  </span>
                </span>
              </Button>
            </div>
          </StaffPanel>
        )}
      </div>
    </div>
  )
}
