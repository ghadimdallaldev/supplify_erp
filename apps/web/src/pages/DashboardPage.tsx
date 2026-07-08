import { Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import {
  useGetDashboardSummaryQuery,
  useGetReorderSuggestionsQuery,
  useGetExpirySummaryQuery,
  useGetReorderRemindersQuery,
  useGetSupplierAtRiskOrdersQuery,
  useGetInvoiceAnalyticsQuery,
  useGetQuickListsQuery,
  useAddItemToQuickListMutation,
  useGetEntitlementsQuery,
} from '../services/api'
import { usePermissions } from '../hooks/usePermissions'
import { ContentReveal, Skeleton } from '../components/ui/skeleton'
import { ErrorState } from '../components/ui/error-state'
import { Button } from '../components/ui/button'
import { ShoppingCart, Users, Building2, DollarSign, AlertTriangle, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ensureNamespace } from '../i18n'
import { formatDate } from '../i18n/formatters'
import { useAppSelector } from '../hooks/redux'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { featureEnabled } from '../lib/planLimits'
import { canUseFinanceInvoices } from '../lib/planFeatureGates'
import {
  getRestaurantDashboardLayout,
  shouldShowDashboardCalendar,
} from '../lib/workspaceRoleProfile'
import { formatPlanDisplayName } from '../lib/planComparison'
import { formatCurrency } from '../utils/format'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { Badge } from '../components/ui/badge'
import { KpiCard } from '../components/ui/kpi-card'
import {
  DASHBOARD_CALENDAR_EXTRA_GAP,
  buildOrderSpendTrend,
  dashboardKpiTone,
  SPEND_TREND_DAYS,
  type KpiCardProps,
  type SpendTrendPeriodDays,
} from '../components/dashboard/dashboardShared'
import { DashboardLoading } from '../components/dashboard/DashboardLoading'
import { DashboardPostOnboardingBanners } from '../components/dashboard/DashboardPostOnboardingBanners'
import { LazyDashboardWidgetGrid } from '../components/dashboard/lazyDashboardWidgets'

const CalendarView = lazy(() =>
  import('../components/CalendarView').then((m) => ({ default: m.CalendarView }))
)

export function DashboardPage() {
  const { t } = useTranslation('dashboard')

  useEffect(() => {
    void ensureNamespace('dashboard')
  }, [])
  const { user } = useAppSelector((state) => state.auth)
  const {
    isImpersonating,
    isPlatformAdmin,
    isEffectiveRestaurant,
    isEffectiveSupplier,
    effectiveRole,
    shouldLoadTenantEntitlements,
  } = useImpersonation()
  const { isDriverRole, persona } = useWorkspaceRole()
  const { can } = usePermissions()
  const isAdminNotImpersonating = isPlatformAdmin && !isImpersonating
  const skipDashboardData = isAdminNotImpersonating || isDriverRole
  const {
    data: summary,
    isLoading,
    error,
    refetch,
  } = useGetDashboardSummaryQuery(undefined, {
    skip: skipDashboardData,
  })
  const stats = summary?.stats

  const isRestaurant = isEffectiveRestaurant
  const isSupplier = isEffectiveSupplier
  const tenantType = isRestaurant ? 'RESTAURANT' : isSupplier ? 'SUPPLIER' : null
  const showDashboardCalendar = shouldShowDashboardCalendar(persona, tenantType, can)
  const restaurantLayout =
    isRestaurant && persona.restaurantDashboardMode
      ? getRestaurantDashboardLayout(persona.restaurantDashboardMode, can, persona.readOnly)
      : null
  const showRestaurantSection = (flag: keyof NonNullable<typeof restaurantLayout>) =>
    !isRestaurant || !restaurantLayout || restaurantLayout[flag]

  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const smartReorderEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.smart_reorder
  )
  const { data: reorderSuggestions } = useGetReorderSuggestionsQuery(undefined, {
    skip: !isRestaurant || !smartReorderEnabled,
  })
  const inventoryMgmtEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.inventory_management
  )
  const { data: expirySummaryData } = useGetExpirySummaryQuery(undefined, {
    skip: !isRestaurant || !inventoryMgmtEnabled,
  })
  const { data: reorderRemindersData } = useGetReorderRemindersQuery(undefined, {
    skip: !isRestaurant || !smartReorderEnabled,
  })
  const { data: atRiskData } = useGetSupplierAtRiskOrdersQuery(undefined, {
    skip: !isSupplier || !smartReorderEnabled,
  })
  const { data: quickListsData } = useGetQuickListsQuery(undefined, {
    skip: !isRestaurant,
  })
  const [addItemToQuickList] = useAddItemToQuickListMutation()
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null)
  const financeInvoicesEnabled = canUseFinanceInvoices(entitlementsData?.entitlements)
  const [periodDays, setPeriodDays] = useState<SpendTrendPeriodDays>(SPEND_TREND_DAYS)
  const { data: invoiceAnalytics } = useGetInvoiceAnalyticsQuery(
    { period: periodDays },
    { skip: !isRestaurant || !financeInvoicesEnabled }
  )
  const planName = formatPlanDisplayName(
    entitlementsData?.entitlements?.plan?.code,
    entitlementsData?.entitlements?.plan?.name
  )
  const firstName =
    (user?.displayName || user?.email || '').split(/[\s@]/)[0] || t('greeting.fallbackName')

  const now = new Date()
  const hour = now.getHours()
  const greeting =
    hour < 12 ? t('greeting.morning') : hour < 17 ? t('greeting.afternoon') : t('greeting.evening')
  const formattedDate = formatDate(now, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  if (isAdminNotImpersonating) {
    return <Navigate to="/app/admin" replace />
  }

  if (isDriverRole) {
    return <Navigate to="/app/driver-deliveries" replace />
  }

  if (!persona.dashboard) {
    return <Navigate to={persona.homePath} replace />
  }

  if (isLoading) {
    return <DashboardLoading />
  }

  if (error) {
    return (
      <PageShell data-testid="dashboard-page" maxWidth="wide">
        <ErrorState
          title={t('error.loadFailed')}
          description={t('error.refreshHint')}
          icon={<AlertTriangle className="h-10 w-10" aria-hidden />}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('error.retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      </PageShell>
    )
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const orders = (summary?.recentOrders || []).slice(0, 7)

  const invoiceSpendTrend = Array.isArray(invoiceAnalytics?.points)
    ? invoiceAnalytics.points.map((p: any) => ({
        name: p.date?.slice(5) || '',
        value: Number(p.total) || 0,
      }))
    : []
  const orderSpendTrend = summary?.spendTrend?.length
    ? summary.spendTrend
    : buildOrderSpendTrend(orders, SPEND_TREND_DAYS)
  const spendTrendSource: 'invoices' | 'orders' | null =
    invoiceSpendTrend.length > 0 ? 'invoices' : orderSpendTrend.length > 0 ? 'orders' : null
  const spendTrend = spendTrendSource === 'invoices' ? invoiceSpendTrend : orderSpendTrend
  const spendTrendPeriodTotal = spendTrend.reduce((sum, p) => sum + p.value, 0)
  const lowStockItems = summary?.lowStockPreview || []

  // ── KPI definitions ──────────────────────────────────────────────────────
  const supplierKpis: KpiCardProps[] = [
    {
      kpiKey: 'revenue',
      label: t('kpi.supplier.revenue.label'),
      value:
        typeof stats?.totalRevenue === 'number'
          ? formatCurrency(stats.totalRevenue)
          : t('kpi.zeroCurrency'),
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: DollarSign,
      meta: t('kpi.supplier.revenue.meta'),
    },
    {
      kpiKey: 'orders',
      label: t('kpi.supplier.orders.label'),
      value: stats?.totalOrders ?? 0,
      iconBg: 'var(--mint-pale)',
      iconColor: 'var(--mint)',
      Icon: ShoppingCart,
      meta: t('kpi.supplier.orders.meta'),
    },
    {
      kpiKey: 'pending',
      label: t('kpi.supplier.pending.label'),
      value: stats?.pendingOrders ?? 0,
      iconBg: 'var(--amber-pale)',
      iconColor: 'var(--amber)',
      Icon: TrendingUp,
      meta: t('kpi.supplier.pending.meta'),
    },
    {
      kpiKey: 'counterpart',
      label: t('kpi.supplier.counterpart.label'),
      value: stats?.totalRestaurants ?? 0,
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: Users,
      meta: t('kpi.supplier.counterpart.meta'),
    },
  ]

  const restaurantKpis: KpiCardProps[] = [
    {
      kpiKey: 'revenue',
      label: t('kpi.restaurant.revenue.label'),
      value:
        typeof stats?.totalSpent === 'number'
          ? formatCurrency(stats.totalSpent)
          : t('kpi.zeroCurrency'),
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: DollarSign,
      meta: t('kpi.restaurant.revenue.meta'),
    },
    {
      kpiKey: 'orders',
      label: t('kpi.restaurant.orders.label'),
      value: stats?.totalOrders ?? 0,
      iconBg: 'var(--mint-pale)',
      iconColor: 'var(--mint)',
      Icon: ShoppingCart,
      meta: t('kpi.restaurant.orders.meta'),
    },
    {
      kpiKey: 'pending',
      label: t('kpi.restaurant.pending.label'),
      value: stats?.pendingOrders ?? 0,
      iconBg: 'var(--amber-pale)',
      iconColor: 'var(--amber)',
      Icon: TrendingUp,
      meta: t('kpi.restaurant.pending.meta'),
    },
    {
      kpiKey: 'counterpart',
      label: t('kpi.restaurant.counterpart.label'),
      value: stats?.totalSuppliers ?? 0,
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: Building2,
      meta: t('kpi.restaurant.counterpart.meta'),
    },
  ]

  const baseKpis = isSupplier ? supplierKpis : restaurantKpis
  const dashboardConfig = persona.dashboard
  const kpis = dashboardConfig
    ? baseKpis
        .filter((kpi) => dashboardConfig.kpiKeys.includes(kpi.kpiKey))
        .map((kpi) => {
          const override = dashboardConfig.kpiLabels[kpi.kpiKey]
          return override ? { ...kpi, label: override.label, meta: override.meta } : kpi
        })
    : baseKpis

  return (
    <ContentReveal>
      <PageShell data-testid="dashboard-page" maxWidth="wide">
        {persona.readOnly && (
          <p
            className="m-0 rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2.5 text-xs text-[var(--text-muted)]"
            role="status"
          >
            {t('readOnlyWorkspace', { roleLabel: persona.roleLabel })}
          </p>
        )}

        <DashboardPostOnboardingBanners
          isRestaurant={isRestaurant}
          isSupplier={isSupplier}
          showRestaurantCta={showRestaurantSection('showPostOnboardingCta')}
          totalOrders={stats?.totalOrders ?? 0}
          totalProducts={stats?.totalProducts ?? 0}
        />

        <PageHeader
          title={dashboardConfig?.title ?? `${greeting}, ${firstName}`}
          description={dashboardConfig?.description ?? formattedDate}
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{persona.roleLabel}</Badge>
              <Badge variant="default">{planName}</Badge>
            </div>
          }
        />

        <div className="dashboard-kpi-grid" data-testid="dashboard-kpi-grid">
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.kpiKey}
              label={kpi.label}
              value={kpi.value}
              icon={kpi.Icon}
              tone={dashboardKpiTone(kpi.kpiKey)}
              description={kpi.meta}
              testId={`dashboard-kpi-${kpi.kpiKey}`}
            />
          ))}
        </div>

        <Suspense
          fallback={
            <div className="dashboard-content-grid">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          }
        >
          <LazyDashboardWidgetGrid
            isRestaurant={isRestaurant}
            isSupplier={isSupplier}
            showRestaurantSection={showRestaurantSection}
            orders={orders}
            stats={stats}
            spendTrend={spendTrend}
            spendTrendSource={spendTrendSource}
            spendTrendPeriodTotal={spendTrendPeriodTotal}
            periodDays={financeInvoicesEnabled ? periodDays : SPEND_TREND_DAYS}
            onPeriodDaysChange={financeInvoicesEnabled ? setPeriodDays : undefined}
            financeInvoicesEnabled={financeInvoicesEnabled}
            lowStockItems={lowStockItems}
            smartReorderEnabled={smartReorderEnabled}
            inventoryMgmtEnabled={inventoryMgmtEnabled}
            reorderSuggestions={reorderSuggestions}
            reorderRemindersData={reorderRemindersData}
            expirySummaryData={expirySummaryData}
            atRiskData={atRiskData}
            quickListsData={quickListsData}
            addingSuggestionId={addingSuggestionId}
            setAddingSuggestionId={setAddingSuggestionId}
            addItemToQuickList={addItemToQuickList}
            restaurantLayout={restaurantLayout}
          />
        </Suspense>

        {showDashboardCalendar && (
          <div
            className="min-w-0"
            style={{
              marginTop: DASHBOARD_CALENDAR_EXTRA_GAP,
              background: 'var(--surface)',
              border: '1px solid var(--app-border)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <Suspense
              fallback={
                <div className="p-6">
                  <Skeleton className="h-8 w-48 mb-4" />
                  <Skeleton className="h-64 w-full" />
                </div>
              }
            >
              <CalendarView
                role={
                  effectiveRole === 'ADMIN' ||
                  effectiveRole === 'RESTAURANT' ||
                  effectiveRole === 'SUPPLIER'
                    ? effectiveRole
                    : null
                }
                isAdmin={user?.role === 'ADMIN'}
              />
            </Suspense>
          </div>
        )}
      </PageShell>
    </ContentReveal>
  )
}
