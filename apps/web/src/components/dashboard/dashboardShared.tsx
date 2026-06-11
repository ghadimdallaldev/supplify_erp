import type { DashboardKpiKey } from '../../lib/workspaceRoleProfile'
import { formatCurrency } from '../../utils/format'

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

export function KpiCard({
  label,
  value,
  iconBg,
  iconColor,
  Icon,
  meta,
  sparkData,
  sparkColor,
}: KpiCardProps) {
  return (
    <div
      className="kpi-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        padding: 15,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          {label}
        </span>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={15} style={{ color: iconColor }} />
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>
        {value === 0 || value === '0' || value === '$0.00' || value === formatCurrency(0) ? (
          <span>{value}</span>
        ) : (
          value
        )}
      </div>
      {meta && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{meta}</div>}
      <Sparkline data={sparkData} color={sparkColor} />
    </div>
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
