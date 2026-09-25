import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Navigate } from 'react-router-dom'
import { BarChart3, Package, Store, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { useGetBranchesQuery, useGetEntitlementsQuery } from '../../services/api'
import { useImpersonation } from '../../hooks/useImpersonation'
import { usePermissions } from '../../hooks/usePermissions'
import { useWorkspaceRole } from '../../hooks/useWorkspaceRole'
import { RequirePermission } from '../../components/RequirePermission'
import { canUseGlobalReports } from '../../lib/planFeatureGates'
import { featureEnabled } from '../../lib/planLimits'
import {
  RESTAURANT_REPORTS_ANY_OF,
  SUPPLIER_ANALYTICS_ANY_OF,
} from '../../lib/workspaceRoleProfile'
import { applyReportDatePreset, ReportFiltersBar } from '../../components/reports/ReportFiltersBar'
import { ReportPanel } from '../../components/reports/ReportPanel'
import type { ReportDef } from '../../components/reports/reportSummary'
import { ensureNamespace } from '../../i18n'

function defaultRange() {
  return applyReportDatePreset(30)
}

function buildRestaurantReports(
  t: TFunction<'reports'>,
  options: { receiving: boolean; waste: boolean; invoices: boolean }
): ReportDef[] {
  const reports: ReportDef[] = [
    {
      key: 'order-volume',
      label: t('reports.orderVolume.label'),
      path: 'order-volume',
      chart: 'line',
      xKey: 'period',
      yKey: 'order_count',
      columns: [
        { key: 'period', label: t('reports.orderVolume.columns.period') },
        { key: 'order_count', label: t('reports.orderVolume.columns.orderCount') },
        { key: 'total_amount', label: t('reports.orderVolume.columns.totalAmount') },
        { key: 'currency', label: t('reports.currency') },
      ],
    },
    {
      key: 'spend-supplier',
      label: t('reports.spendBySupplier.label'),
      path: 'spend-by-supplier',
      chart: 'bar',
      xKey: 'supplier_name',
      yKey: 'total_spend',
      columns: [
        { key: 'supplier_name', label: t('reports.spendBySupplier.columns.supplierName') },
        { key: 'total_spend', label: t('reports.spendBySupplier.columns.totalSpend') },
        { key: 'currency', label: t('reports.currency') },
        { key: 'order_count', label: t('reports.spendBySupplier.columns.orderCount') },
      ],
    },
    {
      key: 'top-products',
      label: t('reports.topProducts.label'),
      path: 'top-products',
      chart: 'bar',
      xKey: 'product_name',
      yKey: 'total_spend',
      columns: [
        { key: 'product_name', label: t('reports.topProducts.columns.productName') },
        { key: 'total_spend', label: t('reports.topProducts.columns.totalSpend') },
        { key: 'currency', label: t('reports.currency') },
        { key: 'total_qty', label: t('reports.topProducts.columns.quantity') },
      ],
    },
    {
      key: 'spend-category',
      label: t('reports.spendByCategory.label'),
      path: 'spend-by-category',
      chart: 'bar',
      xKey: 'category',
      yKey: 'total_spend',
      columns: [
        { key: 'category', label: t('reports.spendByCategory.columns.category') },
        { key: 'total_spend', label: t('reports.spendByCategory.columns.totalSpend') },
        { key: 'currency', label: t('reports.currency') },
        { key: 'order_count', label: t('reports.spendByCategory.columns.orderCount') },
      ],
    },
    {
      key: 'cogs-trend',
      label: t('reports.cogsTrend.label'),
      path: 'cogs-trend',
      chart: 'line',
      xKey: 'period',
      yKey: 'cogs',
      columns: [
        { key: 'period', label: t('reports.cogsTrend.columns.period') },
        { key: 'cogs', label: t('reports.cogsTrend.columns.cogs') },
        { key: 'currency', label: t('reports.currency') },
      ],
    },
  ]

  if (options.receiving) {
    reports.push({
      key: 'receiving-quality',
      label: t('reports.receivingQuality.label'),
      path: 'receiving-quality',
      chart: 'bar',
      xKey: 'supplier_name',
      yKey: 'avg_quality_score',
      columns: [
        { key: 'supplier_name', label: t('reports.receivingQuality.columns.supplierName') },
        { key: 'report_count', label: t('reports.receivingQuality.columns.reportCount') },
        { key: 'avg_quality_score', label: t('reports.receivingQuality.columns.avgQuality') },
        { key: 'avg_fill_rate_pct', label: t('reports.receivingQuality.columns.fillRate') },
      ],
    })
  }

  if (options.waste) {
    reports.push({
      key: 'waste',
      label: t('reports.waste.label'),
      path: 'waste',
      chart: 'bar',
      xKey: 'period',
      yKey: 'total_cost',
      columns: [
        { key: 'period', label: t('reports.waste.columns.period') },
        { key: 'waste_category', label: t('reports.waste.columns.category') },
        { key: 'incident_count', label: t('reports.waste.columns.incidents') },
        { key: 'total_qty', label: t('reports.waste.columns.quantity') },
        { key: 'total_cost', label: t('reports.waste.columns.cost') },
      ],
    })
  }

  if (options.invoices) {
    reports.push({
      key: 'invoice-aging',
      label: t('reports.invoiceAging.label'),
      path: 'invoice-aging',
      chart: 'bar',
      xKey: 'bucket',
      yKey: 'total_balance',
      columns: [
        { key: 'bucket', label: t('reports.invoiceAging.columns.bucket') },
        { key: 'invoice_count', label: t('reports.invoiceAging.columns.invoiceCount') },
        { key: 'total_balance', label: t('reports.invoiceAging.columns.balance') },
        { key: 'currency', label: t('reports.currency') },
      ],
    })
  }

  return reports
}

function buildSupplierReports(
  t: TFunction<'reports'>,
  options: { invoices: boolean }
): ReportDef[] {
  const reports: ReportDef[] = [
    {
      key: 'revenue',
      label: t('reports.revenueTrend.label'),
      path: 'revenue-trend',
      chart: 'line',
      xKey: 'period',
      yKey: 'revenue',
      columns: [
        { key: 'period', label: t('reports.revenueTrend.columns.period') },
        { key: 'revenue', label: t('reports.revenueTrend.columns.revenue') },
        { key: 'currency', label: t('reports.currency') },
        { key: 'order_count', label: t('reports.revenueTrend.columns.orderCount') },
      ],
    },
    {
      key: 'top-restaurants',
      label: t('reports.topRestaurants.label'),
      path: 'top-restaurants',
      chart: 'bar',
      xKey: 'restaurant_name',
      yKey: 'revenue',
      columns: [
        { key: 'restaurant_name', label: t('reports.topRestaurants.columns.restaurantName') },
        { key: 'revenue', label: t('reports.topRestaurants.columns.revenue') },
        { key: 'currency', label: t('reports.currency') },
        { key: 'order_count', label: t('reports.topRestaurants.columns.orderCount') },
      ],
    },
    {
      key: 'order-volume',
      label: t('reports.orderVolume.label'),
      path: 'order-volume',
      chart: 'line',
      xKey: 'period',
      yKey: 'order_count',
      columns: [
        { key: 'period', label: t('reports.orderVolume.columns.period') },
        { key: 'order_count', label: t('reports.orderVolume.columns.orderCount') },
        { key: 'total_amount', label: t('reports.orderVolume.columns.totalAmount') },
        { key: 'currency', label: t('reports.currency') },
      ],
    },
    {
      key: 'supplier-top-products',
      label: t('reports.supplierTopProducts.label'),
      path: 'top-products',
      chart: 'bar',
      xKey: 'product_name',
      yKey: 'revenue',
      columns: [
        { key: 'product_name', label: t('reports.supplierTopProducts.columns.productName') },
        { key: 'revenue', label: t('reports.supplierTopProducts.columns.revenue') },
        { key: 'currency', label: t('reports.currency') },
        { key: 'total_qty', label: t('reports.supplierTopProducts.columns.quantity') },
      ],
    },
    {
      key: 'fulfillment',
      label: t('reports.fulfillment.label'),
      path: 'fulfillment-performance',
      chart: 'bar',
      xKey: 'status',
      yKey: 'order_count',
      columns: [
        { key: 'status', label: t('reports.fulfillment.columns.status') },
        { key: 'order_count', label: t('reports.fulfillment.columns.orderCount') },
      ],
    },
  ]

  if (options.invoices) {
    reports.push({
      key: 'invoice-collection',
      label: t('reports.invoiceCollection.label'),
      path: 'invoice-collection',
      chart: 'bar',
      xKey: 'status',
      yKey: 'balance_due',
      columns: [
        { key: 'status', label: t('reports.invoiceCollection.columns.status') },
        { key: 'invoice_count', label: t('reports.invoiceCollection.columns.invoiceCount') },
        { key: 'total_amount', label: t('reports.invoiceCollection.columns.totalAmount') },
        { key: 'paid_amount', label: t('reports.invoiceCollection.columns.paid') },
        { key: 'balance_due', label: t('reports.invoiceCollection.columns.balance') },
        { key: 'currency', label: t('reports.currency') },
      ],
    })
  }

  return reports
}

const RESTAURANT_REPORT_ICONS: Record<string, typeof TrendingUp> = {
  'order-volume': TrendingUp,
  'spend-supplier': Store,
  'top-products': Package,
}

export function ReportsPage() {
  const { t } = useTranslation('reports')

  useEffect(() => {
    void ensureNamespace('reports')
  }, [])

  const { isEffectiveRestaurant } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const { can } = usePermissions()
  const isRestaurant = isEffectiveRestaurant
  const range = defaultRange()
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [branchId, setBranchId] = useState('')
  const [granularity, setGranularity] = useState('day')

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const reportsEnabled = canUseGlobalReports(entitlementsData?.entitlements)
  const wasteEnabled = featureEnabled(entitlementsData?.entitlements?.features?.waste_tracking)
  const canViewInvoices = can('INVOICES_VIEW')
  const canViewReceiving = can('RECEIVING_VIEW')

  const restaurantReports = useMemo(
    () =>
      buildRestaurantReports(t, {
        receiving: canViewReceiving,
        waste: wasteEnabled,
        invoices: canViewInvoices,
      }),
    [t, canViewReceiving, wasteEnabled, canViewInvoices]
  )
  const supplierReports = useMemo(
    () => buildSupplierReports(t, { invoices: canViewInvoices }),
    [t, canViewInvoices]
  )
  const defs = isRestaurant ? restaurantReports : supplierReports

  const [activeReport, setActiveReport] = useState(defs[0]?.key ?? 'order-volume')
  const { data: branchesData } = useGetBranchesQuery(undefined, { skip: !isRestaurant })
  const branches = branchesData?.branches || []
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
          <PageHeader title={t('page.title')} />
          <Card>
            <CardContent className="py-8 text-sm text-[var(--text-mid)]">
              {t('page.planUnavailable')}
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
          title={isRestaurant ? t('page.purchasingTitle') : t('page.analyticsTitle')}
          description={
            isRestaurant ? t('page.purchasingDescription') : t('page.analyticsDescription')
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
          {current ? (
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
          ) : null}
        </Tabs>
      </PageShell>
    </RequirePermission>
  )
}
