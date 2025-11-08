import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts'
import type { ReservationAnalyticsResponse } from '../../types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Badge } from '../ui/badge'

interface ReservationAnalyticsPanelProps {
  analytics?: ReservationAnalyticsResponse
  onRangeChange?: (range: 'day' | 'week' | 'month') => void
  activeRange: 'day' | 'week' | 'month'
}

export function ReservationAnalyticsPanel({ analytics, onRangeChange, activeRange }: ReservationAnalyticsPanelProps) {
  if (!analytics) {
    return null
  }

  const busiestSlot = analytics.slots.reduce(
    (max, slot) => (slot.total_covers > (max?.total_covers || 0) ? slot : max),
    analytics.slots[0],
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Guest flow intelligence</CardTitle>
            <CardDescription>Spot peak hours, cancellations, and waitlist pressure at a glance.</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            Busiest slot: {busiestSlot ? new Date(busiestSlot.hour_slot).toLocaleTimeString([], { hour: '2-digit' }) : '—'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={activeRange} onValueChange={(value) => onRangeChange?.(value as 'day' | 'week' | 'month')}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.slots}>
              <defs>
                <linearGradient id="coversGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="hour_slot" tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit' })} />
              <YAxis width={40} />
              <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} />
              <Area dataKey="total_covers" name="Covers" stroke="#6366f1" fill="url(#coversGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.waitlist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="status" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

