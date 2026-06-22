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
import { ensureNamespace } from '../../i18n'

function defaultRange() {
  return applyReportDatePreset(30)
}

function buildRestaurantReports(t: TFunction<'reports'>): ReportDef[] {
  return [
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
        { key: 'quantity', label: t('reports.topProducts.columns.quantity') },
      ],
    },
  ]
}

function buildSupplierReports(t: TFunction<'reports'>): ReportDef[] {
  return [
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
      ],
    },
  ]
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
  const isRestaurant = isEffectiveRestaurant
  const range = defaultRange()
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [branchId, setBranchId] = useState('')
  const [granularity, setGranularity] = useState('day')

  const restaurantReports = useMemo(() => buildRestaurantReports(t), [t])
  const supplierReports = useMemo(() => buildSupplierReports(t), [t])
  const defs = isRestaurant ? restaurantReports : supplierReports

  const [activeReport, setActiveReport] = useState(defs[0]?.key ?? 'order-volume')

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const reportsEnabled = canUseGlobalReports(entitlementsData?.entitlements)
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
