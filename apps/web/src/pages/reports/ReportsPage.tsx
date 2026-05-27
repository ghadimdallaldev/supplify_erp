import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Label } from '../../components/ui/label'
import { Input } from '../../components/ui/input'
import {
  useGetRestaurantReportQuery,
  useGetSupplierReportQuery,
  useGetBranchesQuery,
  useGetEntitlementsQuery,
} from '../../services/api'
import { useAppSelector } from '../../hooks/redux'
import { canUseGlobalReports } from '../../lib/planFeatureGates'
import { downloadCsv, reportRowsToCsv } from '../../utils/csvExport'
import { Loader2, Download } from 'lucide-react'
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

function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

type ReportDef = {
  key: string
  label: string
  path: string
  chart: 'line' | 'bar'
  xKey: string
  yKey: string
  columns: Array<{ key: string; label: string }>
}

const RESTAURANT_REPORTS: ReportDef[] = [
  {
    key: 'order-volume',
    label: 'Order volume',
    path: 'order-volume',
    chart: 'line',
    xKey: 'period',
    yKey: 'order_count',
    columns: [
      { key: 'period', label: 'Period' },
      { key: 'order_count', label: 'Orders' },
      { key: 'total_amount', label: 'Total' },
    ],
  },
  {
    key: 'spend-supplier',
    label: 'Spend by supplier',
    path: 'spend-by-supplier',
    chart: 'bar',
    xKey: 'supplier_name',
    yKey: 'total_spend',
    columns: [
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'total_spend', label: 'Spend' },
      { key: 'order_count', label: 'Orders' },
    ],
  },
  {
    key: 'top-products',
    label: 'Top products',
    path: 'top-products',
    chart: 'bar',
    xKey: 'product_name',
    yKey: 'total_spend',
    columns: [
      { key: 'product_name', label: 'Product' },
      { key: 'total_spend', label: 'Spend' },
      { key: 'quantity', label: 'Qty' },
    ],
  },
]

const SUPPLIER_REPORTS: ReportDef[] = [
  {
    key: 'revenue',
    label: 'Revenue trend',
    path: 'revenue-trend',
    chart: 'line',
    xKey: 'period',
    yKey: 'revenue',
    columns: [
      { key: 'period', label: 'Period' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'order_count', label: 'Orders' },
    ],
  },
  {
    key: 'top-restaurants',
    label: 'Top restaurants',
    path: 'top-restaurants',
    chart: 'bar',
    xKey: 'restaurant_name',
    yKey: 'revenue',
    columns: [
      { key: 'restaurant_name', label: 'Restaurant' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'order_count', label: 'Orders' },
    ],
  },
  {
    key: 'order-volume',
    label: 'Order volume',
    path: 'order-volume',
    chart: 'line',
    xKey: 'period',
    yKey: 'order_count',
    columns: [
      { key: 'period', label: 'Period' },
      { key: 'order_count', label: 'Orders' },
    ],
  },
]

function ReportPanel({
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
    { skip: !isRestaurant }
  )
  const supplierQuery = useGetSupplierReportQuery(
    { path: def.path, from, to, granularity },
    { skip: isRestaurant }
  )
  const { data, isLoading, isFetching } = isRestaurant ? restaurantQuery : supplierQuery
  const rows = (data?.data as Array<Record<string, unknown>>) || []

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        name: String(row[def.xKey] ?? '').slice(0, 12),
        value: Number(row[def.yKey] ?? 0),
        full: row,
      })),
    [rows, def.xKey, def.yKey]
  )

  const exportCsv = () => {
    downloadCsv(
      `${def.key}-report.csv`,
      def.columns.map((c) => c.label),
      reportRowsToCsv(rows, def.columns)
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{def.label}</CardTitle>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-4 w-4 mr-1" />
          CSV
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading || isFetching ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No data for this period.</p>
        ) : (
          <div className="space-y-4">
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                {def.chart === 'line' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--brand)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--brand-mid)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    {def.columns.map((col) => (
                      <th key={col.key} className="py-2 pr-4">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, idx) => (
                    <tr key={idx} className="border-b border-[var(--app-border)]">
                      {def.columns.map((col) => (
                        <td key={col.key} className="py-2 pr-4">
                          {String(row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  const range = defaultRange()
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [branchId, setBranchId] = useState('')
  const [granularity, setGranularity] = useState('day')
  const [activeReport, setActiveReport] = useState(
    isRestaurant ? RESTAURANT_REPORTS[0].key : SUPPLIER_REPORTS[0].key
  )

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const reportsEnabled = canUseGlobalReports(entitlementsData?.entitlements)
  const { data: branchesData } = useGetBranchesQuery(undefined, { skip: !isRestaurant })
  const branches = branchesData?.branches || []
  const defs = isRestaurant ? RESTAURANT_REPORTS : SUPPLIER_REPORTS
  const current = defs.find((d) => d.key === activeReport) || defs[0]

  if (!reportsEnabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reports" />
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            Reports & analytics are not included on your current plan. Upgrade to unlock insights.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description={
          isRestaurant
            ? 'Restaurant purchasing and operations insights'
            : 'Supplier revenue and fulfillment insights'
        }
      />

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label>Granularity</Label>
            <select
              className="w-full h-10 rounded-md border border-[var(--app-border)] px-3 text-sm"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
          {isRestaurant && branches.length > 0 ? (
            <div>
              <Label>Branch</Label>
              <select
                className="w-full h-10 rounded-md border border-[var(--app-border)] px-3 text-sm"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">All branches</option>
                {branches.map((b: { id: string; name: string }) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={activeReport} onValueChange={setActiveReport}>
        <TabsList className="flex flex-wrap h-auto">
          {defs.map((def) => (
            <TabsTrigger key={def.key} value={def.key}>
              {def.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {defs.map((def) => (
          <TabsContent key={def.key} value={def.key} className="mt-4">
            <ReportPanel
              def={def}
              isRestaurant={isRestaurant}
              from={from}
              to={to}
              branchId={branchId}
              granularity={granularity}
            />
          </TabsContent>
        ))}
      </Tabs>

      {!current ? null : null}
    </div>
  )
}
