import { formatPrice } from '../../utils/format'

export type ReportDef = {
  key: string
  label: string
  path: string
  chart: 'line' | 'bar'
  xKey: string
  yKey: string
  columns: Array<{ key: string; label: string }>
}

export type ReportSummaryMetric = {
  label: string
  value: string
  emphasis?: boolean
}

export function computeReportSummary(
  def: ReportDef,
  rows: Array<Record<string, unknown>>
): ReportSummaryMetric[] {
  if (rows.length === 0) return []

  if (def.key === 'order-volume') {
    const orders = rows.reduce((sum, row) => sum + Number(row.order_count ?? 0), 0)
    const spend = rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0)
    return [
      { label: 'Total orders', value: String(orders), emphasis: true },
      { label: 'Total spend', value: formatPrice(spend) },
      { label: 'Periods', value: String(rows.length) },
    ]
  }

  if (def.key === 'spend-supplier') {
    const spend = rows.reduce((sum, row) => sum + Number(row.total_spend ?? 0), 0)
    const orders = rows.reduce((sum, row) => sum + Number(row.order_count ?? 0), 0)
    return [
      { label: 'Total spend', value: formatPrice(spend), emphasis: true },
      { label: 'Suppliers', value: String(rows.length) },
      { label: 'Orders', value: String(orders) },
    ]
  }

  if (def.key === 'top-products') {
    const spend = rows.reduce((sum, row) => sum + Number(row.total_spend ?? 0), 0)
    const qty = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0)
    return [
      { label: 'Product spend', value: formatPrice(spend), emphasis: true },
      { label: 'Products', value: String(rows.length) },
      { label: 'Quantity', value: String(qty) },
    ]
  }

  if (def.key === 'revenue') {
    const revenue = rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0)
    const orders = rows.reduce((sum, row) => sum + Number(row.order_count ?? 0), 0)
    return [
      { label: 'Revenue', value: formatPrice(revenue), emphasis: true },
      { label: 'Orders', value: String(orders) },
      { label: 'Periods', value: String(rows.length) },
    ]
  }

  if (def.key === 'top-restaurants') {
    const revenue = rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0)
    return [
      { label: 'Revenue', value: formatPrice(revenue), emphasis: true },
      { label: 'Restaurants', value: String(rows.length) },
    ]
  }

  const total = rows.reduce((sum, row) => sum + Number(row[def.yKey] ?? 0), 0)
  return [
    { label: 'Total', value: String(total), emphasis: true },
    { label: 'Rows', value: String(rows.length) },
  ]
}

export function ReportSummaryStrip({ metrics }: { metrics: ReportSummaryMetric[] }) {
  if (metrics.length === 0) return null

  return (
    <div
      data-testid="report-summary"
      className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/40 px-4 py-3"
    >
      {metrics.map((metric) => (
        <div key={metric.label}>
          <p className="text-xs text-[var(--text-mid)]">{metric.label}</p>
          <p
            className={
              metric.emphasis
                ? 'mt-0.5 text-lg font-semibold tabular-nums text-[var(--text)]'
                : 'mt-0.5 font-medium tabular-nums text-[var(--text)]'
            }
          >
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function formatCellValue(key: string, value: unknown) {
  if (value == null || value === '') return '—'
  if (key.includes('spend') || key.includes('amount') || key === 'revenue') {
    const num = Number(value)
    return Number.isFinite(num) ? formatPrice(num) : String(value)
  }
  if (key.includes('count') || key === 'quantity') {
    return String(value)
  }
  return String(value)
}

function isNumericColumn(key: string) {
  return (
    key.includes('spend') ||
    key.includes('amount') ||
    key === 'revenue' ||
    key === 'order_count' ||
    key === 'quantity'
  )
}

export function ReportDataTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, unknown>>
}) {
  const displayRows = rows.slice(0, 20)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--app-border)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm" data-testid="report-data-table">
          <thead>
            <tr className="border-b border-[var(--app-border)] bg-[var(--brand-ultra)]/30 text-left text-[var(--text-mid)]">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2.5 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-[var(--app-border)] transition-colors last:border-0 hover:bg-[var(--brand-ultra)]/50"
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 text-[var(--text)] ${
                      isNumericColumn(col.key) ? 'tabular-nums' : ''
                    } ${colIdx === 0 ? 'font-medium' : ''}`}
                  >
                    {formatCellValue(col.key, row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 20 ? (
        <p className="border-t border-[var(--app-border)] px-4 py-2 text-xs text-[var(--text-muted)]">
          Showing 20 of {rows.length} rows. Export CSV for the full dataset.
        </p>
      ) : null}
    </div>
  )
}
