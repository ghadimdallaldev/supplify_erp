import type { ReactNode } from 'react'
import type { DashboardKpiKey } from '../../lib/workspaceRoleProfile'
import { AppPanel } from '../ui/app-panel'
import type { KpiTone } from '../ui/kpi-card'

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

export function dashboardKpiTone(kpiKey: DashboardKpiKey): KpiTone {
  if (kpiKey === 'orders') return 'success'
  if (kpiKey === 'pending') return 'warning'
  return 'brand'
}

export function DashboardWidgetPanel({
  title,
  children,
  action,
  testId,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  testId?: string
}) {
  return (
    <AppPanel title={title} titleClassName="section-label" action={action} testId={testId}>
      {children}
    </AppPanel>
  )
}
