import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { formatCurrency } from '../../utils/format'

const ChartLine = Line as unknown as ComponentType<any>
const ChartTooltip = Tooltip as unknown as ComponentType<any>
type SpendTrendPoint = { name: string; value: number }

export function SpendTrendChart({ data }: { data: SpendTrendPoint[] }) {
  const { t, i18n } = useTranslation('dashboard')
  const dateLabel = (value: string) => {
    const match = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(value)
    if (!match) return value
    return new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
      numberingSystem: 'latn',
    }).format(new Date(2000, Number(match[1]) - 1, Number(match[2])))
  }
  return (
    <figure
      className="restaurant-spend-chart"
      dir="ltr"
      aria-label={t('widgets.spendTrend.chartDescription', { count: data.length })}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--app-border)" vertical={false} strokeDasharray="3 5" />
          <XAxis
            dataKey="name"
            tickFormatter={dateLabel}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
            tickMargin={12}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <YAxis
            width={64}
            tickFormatter={(value: number) => formatCurrency(value, { maximumFractionDigits: 0 })}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <ChartLine
            type="linear"
            dataKey="value"
            stroke="var(--brand-mid)"
            strokeWidth={2}
            dot={data.length === 1 ? { r: 4, fill: 'var(--brand-mid)' } : false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            isAnimationActive={false}
          />
          <ChartTooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--app-border)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text)',
            }}
            labelFormatter={dateLabel}
            formatter={(value: number | string) => [
              formatCurrency(Number(value)),
              t('widgets.spendTrend.tooltipLabel'),
            ]}
            cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '4 4' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}
