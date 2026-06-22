import type { DashboardKpiKey } from '../../lib/workspaceRoleProfile'
import { SummaryStrip } from '../ui/app-panel'
import { KpiCard as UiKpiCard, type KpiTone } from '../ui/kpi-card'

/** Vertical rhythm between dashboard sections (KPIs, cards row, calendar). */
export const DASHBOARD_STACK_GAP = 24
/** Horizontal gap between KPI cards and between the three content cards. */
export const DASHBOARD_GRID_GAP = 20
/** Extra space above the calendar so it separates clearly from the cards row. */
export const DASHBOARD_CALENDAR_EXTRA_GAP = 12

// ─── Tiny helpers ────────────────────────────────────────────────────────────

export const SPEND_TREND_DAYS = 30

export type SpendTrendPeriodDays = 7 | 30 | 90

export const SPEND_TREND_PERIOD_OPTIONS: SpendTrendPeriodDays[] = [7, 30, 90]

export function buildOrderSpendTrend(orders: any[], days: number = SPEND_TREND_DAYS) {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - days)
  const buckets = new Map<string, number>()
  for (const o of orders) {
    const raw = o.created_at || o.createdAt
    if (!raw) continue
    const d = new Date(raw)
    if (Number.isNaN(d.getTime()) || d < cutoff) continue
    const key = raw.slice(5, 10)
    buckets.set(key, (buckets.get(key) || 0) + (Number(o.total_amount) || 0))
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }))
}

export interface KpiCardProps {
  kpiKey: DashboardKpiKey
  label: string
  value: string | number
  iconBg: string
  iconColor: string
  Icon: any
  meta?: string
}

export function DashboardSummaryStrip({
  metrics,
}: {
  metrics: Array<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'mint' | 'amber' | 'brand'
  }>
}) {
  return <SummaryStrip testId="dashboard-summary" metrics={metrics} />
}

export function KpiCard({ label, value, iconBg, Icon, meta }: KpiCardProps) {
  const tone: KpiTone = iconBg.includes('mint')
    ? 'success'
    : iconBg.includes('amber')
      ? 'warning'
      : 'brand'

  return <UiKpiCard label={label} value={value} icon={Icon} tone={tone} description={meta} />
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  // A flat, static section container — deliberately not the interactive <Card>
  // primitive (which adds a hover shadow/lift that would be decorative noise here).
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--app-border)] px-[15px] pb-2.5 pt-3">
        <span className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--text-mid)]">
          {title}
        </span>
        {action}
      </div>
      <div className="px-[15px] py-3">{children}</div>
    </div>
  )
}
