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

export function buildOrderSpendTrend(orders: any[], days = SPEND_TREND_DAYS) {
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

export function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 3) return null
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26, marginTop: 8 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(12, Math.round((v / max) * 100))}%`,
            borderRadius: '2px 2px 0 0',
            background: color,
            opacity: 0.25 + (i / data.length) * 0.75,
          }}
        />
      ))}
    </div>
  )
}

export interface KpiCardProps {
  kpiKey: DashboardKpiKey
  label: string
  value: string | number
  iconBg: string
  iconColor: string
  Icon: any
  meta?: string
  sparkData: number[]
  sparkColor: string
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

export function KpiCard({ label, value, iconBg, Icon, meta, sparkData, sparkColor }: KpiCardProps) {
  const tone: KpiTone = iconBg.includes('mint')
    ? 'success'
    : iconBg.includes('amber')
      ? 'warning'
      : 'brand'

  return (
    <UiKpiCard
      label={label}
      value={value}
      icon={Icon}
      tone={tone}
      description={meta}
      sparkline={<Sparkline data={sparkData} color={sparkColor} />}
    />
  )
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
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 15px 10px',
          borderBottom: '1px solid var(--app-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-mid)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          {title}
        </span>
        {action}
      </div>
      <div style={{ padding: '12px 15px' }}>{children}</div>
    </div>
  )
}
