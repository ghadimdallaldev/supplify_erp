import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { ResponsiveContainer, BarChart, Bar, Tooltip } from 'recharts'
import { formatCurrency } from '../../utils/format'

const ChartBar = Bar as unknown as ComponentType<any>
const ChartTooltip = Tooltip as unknown as ComponentType<any>

type SpendTrendPoint = { name: string; value: number }

type SpendTrendChartProps = {
  data: SpendTrendPoint[]
}

export function SpendTrendChart({ data }: SpendTrendChartProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div style={{ height: 120 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={4}>
          <ChartBar dataKey="value" fill="var(--brand-mid)" radius={[2, 2, 0, 0]} opacity={0.75} />
          <ChartTooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--app-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text)',
            }}
            formatter={(v: number | string) => [
              formatCurrency(Number(v)),
              t('widgets.spendTrend.tooltipLabel'),
            ]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
