import { useMemo } from 'react'
import { Download, AlertCircle, BarChart3 } from 'lucide-react'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { EmptyState } from '../ui/empty-state'
import { useGetRestaurantReportQuery, useGetSupplierReportQuery } from '../../services/api'
import { downloadCsv, reportRowsToCsv } from '../../utils/csvExport'
import { reportErrorMessage } from '../../lib/reportResponse'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  computeReportSummary,
  ReportDataTable,
  ReportSummaryStrip,
  type ReportDef,
} from './reportSummary'

const CHART_GRID = 'var(--app-border)'
const CHART_BRAND = 'var(--brand-mid)'
const CHART_MUTED = 'var(--text-mid)'

function ChartSkeleton() {
  return (
    <div className="space-y-3" data-testid="report-chart-loading">
      <Skeleton className="h-[280px] w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  )
}

export function ReportPanel({
  def,
  isRestaurant,
  from,
  to,
  branchId,
  granularity,
}: {
  def: ReportDef
  isRestaurant: boolean
  from: string
  to: string
  branchId: string
  granularity: string
}) {
  const restaurantQuery = useGetRestaurantReportQuery(
    { path: def.path, from, to, branchId: branchId || undefined, granularity },
    { skip: !isRestaurant, refetchOnMountOrArgChange: true }
  )
  const supplierQuery = useGetSupplierReportQuery(
    { path: def.path, from, to, granularity },
    { skip: isRestaurant, refetchOnMountOrArgChange: true }
  )
  const { data, isLoading, isFetching, isError, error, refetch } = isRestaurant
    ? restaurantQuery
    : supplierQuery
  const rows = useMemo(() => data?.data ?? [], [data])
  const showInitialLoad = isLoading && !data
  const showRefreshing = isFetching && !isLoading && rows.length > 0

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        name: String(row[def.xKey] ?? '').slice(0, 14),
        value: Number(row[def.yKey] ?? 0),
        full: row,
      })),
    [rows, def.xKey, def.yKey]
  )

  const summaryMetrics = useMemo(() => computeReportSummary(def, rows), [def, rows])

  const exportCsv = () => {
    downloadCsv(
      `${def.key}-report.csv`,
      def.columns.map((c) => c.label),
      reportRowsToCsv(rows, def.columns)
    )
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
      data-testid={`report-panel-${def.key}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[var(--text)]">{def.label}</h2>
          {showRefreshing ? (
            <span className="text-xs text-[var(--text-muted)]">Updating…</span>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={!rows.length || showInitialLoad}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </header>

      <div className="p-4 sm:p-5">
        {showInitialLoad ? (
          <ChartSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-[var(--red)]" aria-hidden />
            <p className="max-w-md text-sm text-[var(--text-mid)]">{reportErrorMessage(error)}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" aria-hidden />}
            title="No data for this period"
            description="Try widening the date range, changing granularity, or placing orders in this window."
          />
        ) : (
          <div className="space-y-5">
            <ReportSummaryStrip metrics={summaryMetrics} />

            <div className="w-full min-h-[280px] rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/20 p-3 sm:p-4">
              <ResponsiveContainer width="100%" height={280}>
                {def.chart === 'line' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: CHART_MUTED }}
                      axisLine={{ stroke: CHART_GRID }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: CHART_MUTED }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid var(--app-border)',
                        background: 'var(--surface)',
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={CHART_BRAND}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART_BRAND, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={chartData} barCategoryGap="20%">
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: CHART_MUTED }}
                      axisLine={{ stroke: CHART_GRID }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: CHART_MUTED }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid var(--app-border)',
                        background: 'var(--surface)',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" fill={CHART_BRAND} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <ReportDataTable columns={def.columns} rows={rows} />
          </div>
        )}
      </div>
    </section>
  )
}
