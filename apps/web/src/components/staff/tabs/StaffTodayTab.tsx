import { format } from 'date-fns'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
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

function metricCount(value: number | null | undefined, emptyLabel: string) {
  if (value == null) return emptyLabel
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
  const { t } = useTranslation('staff')
  const today = clampToISODate(new Date())
  const { data, isLoading, isError, error, refetch } = useGetStaffLabourSummaryQuery({
    date: today,
  })

  if (isError) {
    return (
      <EmptyState
        title={t('today.loadFailedTitle')}
        description={getApiErrorMessage(error, t('today.loadFailedDescription'))}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t('shared.tryAgain')}
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

  const emDash = t('shared.emDash')
  const coverageMetrics = [
    {
      label: t('today.metrics.scheduledToday'),
      value: counts.scheduledToday,
      icon: CalendarDays,
      tone: 'brand' as const,
      description: t('today.metrics.scheduledTodayDesc'),
      onClick: () => onTabChange('schedule'),
    },
    {
      label: t('today.metrics.clockedInNow'),
      value: counts.clockedInNow,
      icon: UserCheck,
      tone: 'success' as const,
      description: t('today.metrics.clockedInNowDesc'),
      onClick: () => onTabChange('team'),
    },
    {
      label: t('today.metrics.lateArrivals'),
      value: metricCount(counts.lateArrivals, emDash),
      icon: Clock,
      tone:
        counts.lateArrivals != null && counts.lateArrivals > 0
          ? ('warning' as const)
          : ('neutral' as const),
      description:
        counts.lateArrivals == null
          ? t('today.metrics.lateArrivalsNotTracked')
          : t('today.metrics.lateArrivalsDesc'),
      onClick: () => onTabChange('schedule'),
    },
    {
      label: t('today.metrics.missedClockOuts'),
      value: counts.missedClockOuts,
      icon: LogOut,
      tone: counts.missedClockOuts > 0 ? ('warning' as const) : ('neutral' as const),
      description: t('today.metrics.missedClockOutsDesc'),
      onClick: () => onTabChange('team'),
    },
  ]

  const opsMetrics = [
    {
      label: t('today.metrics.pendingPto'),
      value: counts.pendingPto,
      icon: Palmtree,
      tone: counts.pendingPto > 0 ? ('info' as const) : ('neutral' as const),
      description: t('today.metrics.pendingPtoDesc'),
      onClick: () => onTabChange('pto'),
    },
    {
      label: t('today.metrics.pendingSwaps'),
      value: counts.pendingSwaps,
      icon: ArrowLeftRight,
      tone: counts.pendingSwaps > 0 ? ('info' as const) : ('neutral' as const),
      description: t('today.metrics.pendingSwapsDesc'),
      onClick: () => onTabChange('schedule'),
    },
    {
      label: t('today.metrics.estLabourCost'),
      value: labourCostToday.available ? formatPrice(counts.estimatedLabourCostToday ?? 0) : emDash,
      icon: DollarSign,
      tone: labourCostToday.available ? ('brand' as const) : ('neutral' as const),
      description: labourCostToday.available
        ? t('today.metrics.estLabourCostDesc')
        : t('today.metrics.estLabourCostUnavailable'),
      onClick: () => onTabChange('reports'),
    },
    {
      label: t('today.metrics.overtimeRisk'),
      value: metricCount(overtimeCount, emDash),
      icon: AlertTriangle,
      tone:
        overtimeCount != null && overtimeCount > 0 ? ('warning' as const) : ('neutral' as const),
      description: t('today.metrics.overtimeRiskDesc'),
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
              {t('today.heroEyebrow')}
            </p>
            <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">{formattedDate}</h2>
            <p className="max-w-xl text-sm text-[var(--text-muted)]">
              {t('today.heroDescription')}
            </p>
            {data.meta?.openEntriesIncluded ? (
              <p className="text-xs text-[var(--text-mid)]">{t('today.openEntriesNote')}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button size="sm" onClick={() => onTabChange('schedule')}>
              <CalendarDays className="mr-1.5 h-4 w-4" aria-hidden />
              {t('today.schedule')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onTabChange('team')}>
              {t('today.teamRoster')}
            </Button>
            {pendingActions > 0 ? (
              <Button size="sm" variant="outline" onClick={() => onTabChange('pto')}>
                {t('today.pendingApprovals', { count: pendingActions })}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">{t('today.coverageHeading')}</h3>
          <p className="text-xs text-[var(--text-muted)]">{t('today.coverageHint')}</p>
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
        <h3 className="text-sm font-semibold text-[var(--text)]">{t('today.requestsHeading')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {opsMetrics.map((metric) => (
            <StaffMetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StaffPanel
          title={t('today.attention.title')}
          description={
            attentionCount > 0
              ? t('today.attention.itemsNeedReview', { count: attentionCount })
              : t('today.attention.defaultDescription')
          }
        >
          {alerts.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--mint)]/25 bg-[var(--mint-pale)]/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mint-pale)]">
                <CheckCircle2 className="h-5 w-5 text-[var(--mint)]" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {t('today.attention.allClear')}
                </p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {attendanceIssues === 0 && pendingActions === 0
                    ? t('today.attention.noIssues')
                    : t('today.attention.noCritical')}
                </p>
              </div>
              <StatusBadge status="healthy" label={t('shared.healthy')} className="shrink-0" />
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
                      {t('shared.view')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </StaffPanel>

        {overtimeRisk && overtimeRisk.length > 0 ? (
          <StaffPanel
            title={t('today.overtime.title')}
            description={t('today.overtime.description')}
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
          <StaffPanel
            title={t('today.quickActions.title')}
            description={t('today.quickActions.description')}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() => onTabChange('schedule')}
              >
                <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
                <span>
                  <span className="block text-sm font-medium">
                    {t('today.quickActions.adjustSchedule')}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {t('today.quickActions.adjustScheduleDesc')}
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
                  <span className="block text-sm font-medium">
                    {t('today.quickActions.reviewTimeOff')}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {t('today.quickActions.reviewTimeOffDesc')}
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
                  <span className="block text-sm font-medium">
                    {t('today.quickActions.checkWorking')}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {t('today.quickActions.checkWorkingDesc')}
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
                  <span className="block text-sm font-medium">
                    {t('today.quickActions.payrollPreview')}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {t('today.quickActions.payrollPreviewDesc')}
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
