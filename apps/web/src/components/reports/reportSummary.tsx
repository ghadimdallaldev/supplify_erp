import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { formatCurrency, formatPrice } from '../../utils/format'
import { ensureNamespace } from '../../i18n'
import { TableScroll } from '../ui/table-scroll'

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

function formatMoneyAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${formatPrice(amount)}`
  }
}

function currencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

/** Sum a money column inside each currency. Never add JOD to USD, and never label a missing currency as USD. */
export function sumByCurrency(rows: Array<Record<string, unknown>>, amountKey: string): string {
  const totals = new Map<string, number>()
  let unscoped = 0
  let sawUnscoped = false
  for (const row of rows) {
    const amount = Number(row[amountKey] ?? 0)
    if (!Number.isFinite(amount)) continue
    const currency = currencyCode(row.currency)
    if (!currency) {
      sawUnscoped = true
      unscoped += amount
      continue
    }
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }
  const parts = [...totals.entries()].map(([currency, amount]) =>
    formatMoneyAmount(amount, currency)
  )
  if (sawUnscoped) parts.push(formatPrice(unscoped))
  if (parts.length === 0) return formatPrice(0)
  return parts.join(' · ')
}

export function computeReportSummary(
  def: ReportDef,
  rows: Array<Record<string, unknown>>,
  t: TFunction<'reports'>
): ReportSummaryMetric[] {
  if (rows.length === 0) return []

  if (def.key === 'order-volume') {
    const orders = rows.reduce((sum, row) => sum + Number(row.order_count ?? 0), 0)
    return [
      { label: t('summary.totalOrders'), value: String(orders), emphasis: true },
      { label: t('summary.totalSpend'), value: sumByCurrency(rows, 'total_amount') },
      {
        label: t('summary.periods'),
        value: String(new Set(rows.map((row) => String(row.period ?? ''))).size),
      },
    ]
  }

  if (def.key === 'spend-supplier') {
    const orders = rows.reduce((sum, row) => sum + Number(row.order_count ?? 0), 0)
    const suppliers = new Set(rows.map((row) => String(row.supplier_id ?? row.supplier_name ?? '')))
      .size
    return [
      { label: t('summary.totalSpend'), value: sumByCurrency(rows, 'total_spend'), emphasis: true },
      { label: t('summary.suppliers'), value: String(suppliers) },
      { label: t('summary.orders'), value: String(orders) },
    ]
  }

  if (def.key === 'top-products' || def.key === 'supplier-top-products') {
    const amountKey = rows.some((row) => row.total_spend != null) ? 'total_spend' : 'revenue'
    const qty = rows.reduce((sum, row) => sum + Number(row.total_qty ?? row.quantity ?? 0), 0)
    return [
      { label: t('summary.productSpend'), value: sumByCurrency(rows, amountKey), emphasis: true },
      { label: t('summary.products'), value: String(rows.length) },
      { label: t('summary.quantity'), value: String(qty) },
    ]
  }

  if (def.key === 'revenue') {
    const orders = rows.reduce((sum, row) => sum + Number(row.order_count ?? 0), 0)
    return [
      { label: t('summary.revenue'), value: sumByCurrency(rows, 'revenue'), emphasis: true },
      { label: t('summary.orders'), value: String(orders) },
      {
        label: t('summary.periods'),
        value: String(new Set(rows.map((row) => String(row.period ?? ''))).size),
      },
    ]
  }

  if (def.key === 'fulfillment') {
    const orders = rows.reduce((sum, row) => sum + Number(row.order_count ?? 0), 0)
    const rate = rows[0]?.completion_rate_pct
    return [
      { label: t('summary.orders'), value: String(orders), emphasis: true },
      {
        label: t('reports.fulfillment.columns.completionRate'),
        value: rate == null || rate === '' ? '—' : `${rate}%`,
      },
    ]
  }

  if (def.key === 'top-restaurants') {
    const restaurants = new Set(
      rows.map((row) => String(row.restaurant_id ?? row.restaurant_name ?? ''))
    ).size
    return [
      { label: t('summary.revenue'), value: sumByCurrency(rows, 'revenue'), emphasis: true },
      { label: t('summary.restaurants'), value: String(restaurants) },
    ]
  }

  const total = rows.reduce((sum, row) => sum + Number(row[def.yKey] ?? 0), 0)
  return [
    {
      label: t('summary.total'),
      value: isMoneyColumn(def.yKey) ? sumByCurrency(rows, def.yKey) : String(total),
      emphasis: true,
    },
    { label: t('summary.rows'), value: String(rows.length) },
  ]
}

function isMoneyColumn(key: string) {
  return (
    key.includes('spend') ||
    key.includes('amount') ||
    key.includes('balance') ||
    key.includes('cost') ||
    key === 'revenue' ||
    key === 'cogs' ||
    key === 'paid_amount'
  )
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

function formatCellValue(key: string, value: unknown, currency?: unknown) {
  if (value == null || value === '') return '—'
  if (isMoneyColumn(key)) {
    const num = Number(value)
    if (!Number.isFinite(num)) return String(value)
    if (typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency)) {
      return formatCurrency(num, { currency: currency.toUpperCase() })
    }
    return formatPrice(num)
  }
  if (
    key.includes('count') ||
    key === 'quantity' ||
    key === 'total_qty' ||
    key.includes('pct') ||
    key.includes('score')
  ) {
    return String(value)
  }
  return String(value)
}

function isNumericColumn(key: string) {
  return isMoneyColumn(key) || key.includes('count') || key === 'quantity' || key === 'total_qty'
}

export function ReportDataTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, unknown>>
}) {
  const { t } = useTranslation('reports')

  useEffect(() => {
    void ensureNamespace('reports')
  }, [])

  const displayRows = rows.slice(0, 20)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--app-border)]">
      <TableScroll aria-label="Report data" className="rounded-none border-0">
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
                    {formatCellValue(col.key, row[col.key], row.currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {rows.length > 20 ? (
        <p className="border-t border-[var(--app-border)] px-4 py-2 text-xs text-[var(--text-muted)]">
          {t('table.showingRows', { total: rows.length })}
        </p>
      ) : null}
    </div>
  )
}
