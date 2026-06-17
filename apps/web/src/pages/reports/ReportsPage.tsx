import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BarChart3, Package, Store, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { useGetBranchesQuery, useGetEntitlementsQuery } from '../../services/api'
import { useImpersonation } from '../../hooks/useImpersonation'
import { useWorkspaceRole } from '../../hooks/useWorkspaceRole'
import { RequirePermission } from '../../components/RequirePermission'
import { canUseGlobalReports } from '../../lib/planFeatureGates'
import {
  RESTAURANT_REPORTS_ANY_OF,
  SUPPLIER_ANALYTICS_ANY_OF,
} from '../../lib/workspaceRoleProfile'
import { applyReportDatePreset, ReportFiltersBar } from '../../components/reports/ReportFiltersBar'
import { ReportPanel } from '../../components/reports/ReportPanel'
import type { ReportDef } from '../../components/reports/reportSummary'

function defaultRange() {
  return applyReportDatePreset(30)
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

const RESTAURANT_REPORT_ICONS: Record<string, typeof TrendingUp> = {
  'order-volume': TrendingUp,
  'spend-supplier': Store,
  'top-products': Package,
}

export function ReportsPage() {
  const { isEffectiveRestaurant } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const isRestaurant = isEffectiveRestaurant
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
  const reportsPermissionGate = isRestaurant
    ? { anyOf: [...RESTAURANT_REPORTS_ANY_OF] }
    : { anyOf: [...SUPPLIER_ANALYTICS_ANY_OF] }

  const applyPreset = (days: number) => {
    const next = applyReportDatePreset(days)
    setFrom(next.from)
    setTo(next.to)
  }

  if (isRestaurant && !persona.showGlobalReports) {
    return <Navigate to={persona.homePath} replace />
  }

  if (!reportsEnabled) {
    return (
      <RequirePermission {...reportsPermissionGate} title="reports">
        <PageShell data-testid="reports-page">
          <PageHeader title="Reports" />
          <Card>
            <CardContent className="py-8 text-sm text-[var(--text-mid)]">
              Reports are not available on your current plan. Contact support if this looks wrong.
            </CardContent>
          </Card>
        </PageShell>
      </RequirePermission>
    )
  }

  return (
    <RequirePermission {...reportsPermissionGate} title="reports">
      <PageShell data-testid="reports-page">
        <PageHeader
          title={isRestaurant ? 'Purchasing reports' : 'Reports & Analytics'}
          description={
            isRestaurant
              ? 'Track order volume, supplier spend, and top products across your locations.'
              : 'Supplier revenue and fulfillment insights'
          }
        />

        <ReportFiltersBar
          from={from}
          to={to}
          granularity={granularity}
          branchId={branchId}
          branches={branches}
          showBranchFilter={isRestaurant && branches.length > 0}
          onFromChange={setFrom}
          onToChange={setTo}
          onGranularityChange={setGranularity}
          onBranchChange={setBranchId}
          onPresetDays={applyPreset}
        />

        <Tabs value={activeReport} onValueChange={setActiveReport} className="space-y-4">
          <TabsList className="tabs-scroll h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
            {defs.map((def) => {
              const Icon = isRestaurant
                ? (RESTAURANT_REPORT_ICONS[def.key] ?? BarChart3)
                : BarChart3
              return (
                <TabsTrigger key={def.key} value={def.key} className="gap-1.5 text-xs sm:text-sm">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {def.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
          <TabsContent value={current.key}>
            <ReportPanel
              key={`${current.key}-${from}-${to}-${branchId}-${granularity}`}
              def={current}
              isRestaurant={isRestaurant}
              from={from}
              to={to}
              branchId={branchId}
              granularity={granularity}
            />
          </TabsContent>
        </Tabs>
      </PageShell>
    </RequirePermission>
  )
}
