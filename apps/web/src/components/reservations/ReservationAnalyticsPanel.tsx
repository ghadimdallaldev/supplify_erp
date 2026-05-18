import { useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import type { ReservationAnalyticsResponse } from '../../types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { Badge } from '../ui/badge'

interface ReservationAnalyticsPanelProps {
  analytics?: ReservationAnalyticsResponse
  onRangeChange?: (range: 'day' | 'week' | 'month') => void
  activeRange: 'day' | 'week' | 'month'
}

type ChartPoint = {
  hour_slot: string
  label: string
  confirmed: number
  cancelled: number
  waitlisted: number
  total_covers: number
}

function formatBucketLabel(iso: string, range: 'day' | 'week' | 'month'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (range === 'day') {
    return d.toLocaleTimeString([], { hour: 'numeric', hour12: true })
  }
  if (range === 'week') {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatBusiestLabel(iso: string, range: 'day' | 'week' | 'month'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  if (range === 'day') {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

export function ReservationAnalyticsPanel({
  analytics,
  onRangeChange,
  activeRange,
}: ReservationAnalyticsPanelProps) {
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!analytics?.slots?.length) return []
    return [...analytics.slots]
      .sort((a, b) => new Date(a.hour_slot).getTime() - new Date(b.hour_slot).getTime())
      .map((slot) => ({
        ...slot,
        confirmed: Number(slot.confirmed) || 0,
        cancelled: Number(slot.cancelled) || 0,
        waitlisted: Number(slot.waitlisted) || 0,
        total_covers: Number(slot.total_covers) || 0,
        label: formatBucketLabel(slot.hour_slot, activeRange),
      }))
  }, [analytics?.slots, activeRange])

  const totals = useMemo(() => {
    return chartData.reduce(
      (acc, row) => ({
        covers: acc.covers + row.total_covers,
        confirmed: acc.confirmed + row.confirmed,
        cancelled: acc.cancelled + row.cancelled,
        waitlisted: acc.waitlisted + row.waitlisted,
      }),
      { covers: 0, confirmed: 0, cancelled: 0, waitlisted: 0 }
    )
  }, [chartData])

  const busiest = useMemo(() => {
    if (!chartData.length) return null
    return chartData.reduce((max, row) => (row.total_covers > max.total_covers ? row : max))
  }, [chartData])

  const waitlistData = useMemo(() => {
    return (analytics?.waitlist ?? []).map((row) => ({
      status: row.status.replace(/_/g, ' '),
      total: Number(row.total) || 0,
    }))
  }, [analytics?.waitlist])

  if (!analytics) {
    return null
  }

  const rangeHint =
    activeRange === 'day'
      ? 'Covers by hour (today)'
      : activeRange === 'week'
        ? 'Covers by day (last 7 days)'
        : 'Covers by day (last 30 days)'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Guest flow intelligence</CardTitle>
            <CardDescription>
              Spot peak hours, cancellations, and waitlist pressure at a glance.
            </CardDescription>
          </div>
          {busiest && (
            <Badge variant="outline" className="text-xs shrink-0 w-fit">
              Busiest {activeRange === 'day' ? 'hour' : 'day'}:{' '}
              {formatBusiestLabel(busiest.hour_slot, activeRange)} ({busiest.total_covers} covers)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs
          value={activeRange}
          onValueChange={(value) => onRangeChange?.(value as 'day' | 'week' | 'month')}
        >
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-[var(--brand-ultra)] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Total covers
            </p>
            <p className="text-lg font-bold text-[var(--text)]">{totals.covers}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Confirmed
            </p>
            <p className="text-lg font-bold text-emerald-700">{totals.confirmed}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Cancelled
            </p>
            <p className="text-lg font-bold text-rose-700">{totals.cancelled}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Waitlisted
            </p>
            <p className="text-lg font-bold text-amber-700">{totals.waitlisted}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">{rangeHint}</p>
          <div className="h-52">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center rounded-lg border border-dashed text-sm text-[var(--text-muted)]">
                No reservations in this period yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="coversGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8f5" />
                  <XAxis
                    dataKey="label"
                    type="category"
                    tick={{ fontSize: 11 }}
                    interval={activeRange === 'month' ? 'preserveStartEnd' : 0}
                    angle={activeRange === 'month' ? -35 : 0}
                    textAnchor={activeRange === 'month' ? 'end' : 'middle'}
                    height={activeRange === 'month' ? 48 : 28}
                  />
                  <YAxis width={36} allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as ChartPoint | undefined
                      if (!row) return ''
                      return new Date(row.hour_slot).toLocaleString()
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="total_covers"
                    name="Covers"
                    stroke="#7c3aed"
                    fill="url(#coversGradient)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="cancelled"
                    name="Cancelled"
                    stroke="#e11d48"
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">Waitlist by status</p>
          <div className="h-44">
            {waitlistData.length === 0 ? (
              <div className="h-full flex items-center justify-center rounded-lg border border-dashed text-sm text-[var(--text-muted)]">
                No waitlist entries.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waitlistData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8f5" />
                  <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" name="Guests" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
