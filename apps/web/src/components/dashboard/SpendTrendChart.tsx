import { ResponsiveContainer, BarChart, Bar, Tooltip } from 'recharts'
import { formatCurrency } from '../../utils/format'

type SpendTrendPoint = { name: string; value: number }

type SpendTrendChartProps = {
  data: SpendTrendPoint[]
}

export function SpendTrendChart({ data }: SpendTrendChartProps) {
  return (
    <div style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={4}>
          <Bar dataKey="value" fill="var(--brand-mid)" radius={[2, 2, 0, 0]} opacity={0.75} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--app-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text)',
            }}
            formatter={(v: number | string) => [formatCurrency(Number(v)), 'Spend']}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
