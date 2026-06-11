import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const readLines = (p) => fs.readFileSync(path.join(root, p), 'utf8').split(/\r?\n/)
const writeFile = (p, content) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true })
  fs.writeFileSync(path.join(root, p), content)
  console.log('wrote', p)
}

function splitDashboard() {
  const lines = readLines('apps/web/src/pages/DashboardPage.tsx')
  const L = (a, b) => lines.slice(a - 1, b)

  writeFile(
    'apps/web/src/components/dashboard/dashboardShared.tsx',
    `import type { DashboardKpiKey } from '../../lib/workspaceRoleProfile'
import { formatCurrency } from '../../utils/format'

${L(45, 224).join('\n')}
`
  )

  writeFile(
    'apps/web/src/components/dashboard/DashboardLoading.tsx',
    `import { Skeleton } from '../ui/skeleton'

export function DashboardLoading() {
  return (
${L(329, 368)
  .map((l) => l.replace(/^      /, '    '))
  .join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/dashboard/DashboardPostOnboardingBanners.tsx',
    `import { Link } from 'react-router-dom'
import { Package, ShoppingCart } from 'lucide-react'
import { Button } from '../ui/button'

type Props = {
  isRestaurant: boolean
  isSupplier: boolean
  showRestaurantCta: boolean
  totalOrders: number
  totalProducts: number
}

export function DashboardPostOnboardingBanners({
  isRestaurant,
  isSupplier,
  showRestaurantCta,
  totalOrders,
  totalProducts,
}: Props) {
  return (
    <>
${L(542, 613)
  .map((l) => l.replace(/^      /, '    '))
  .join('\n')}
    </>
  )
}
`
  )

  writeFile(
    'apps/web/src/components/dashboard/DashboardWidgetGrid.tsx',
    `import { Link } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Package, ShoppingCart, AlertTriangle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { StatusBadge } from '../ui/status-badge'
import { formatCurrency } from '../../utils/format'
import { SectionCard, SPEND_TREND_DAYS } from './dashboardShared'

const SpendTrendChart = lazy(() =>
  import('./SpendTrendChart').then((m) => ({ default: m.SpendTrendChart }))
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DashboardWidgetGrid(props: any) {
  const {
    isRestaurant,
    isSupplier,
    showRestaurantSection,
    orders,
    stats,
    spendTrend,
    spendTrendSource,
    spendTrendPeriodTotal,
    lowStockItems,
    smartReorderEnabled,
    inventoryMgmtEnabled,
    reorderSuggestions,
    reorderRemindersData,
    expirySummaryData,
    atRiskData,
    quickListsData,
    addingSuggestionId,
    setAddingSuggestionId,
    addItemToQuickList,
  } = props

  return (
    <>
      <div className="dashboard-content-grid">
${L(637, 1199)
  .map((l) => l.replace(/^      /, '    '))
  .join('\n')}
      </div>
    </>
  )
}
`
  )

  writeFile(
    'apps/web/src/components/dashboard/lazyDashboardWidgets.ts',
    `import { lazy } from 'react'

export const LazyDashboardWidgetGrid = lazy(() =>
  import('./DashboardWidgetGrid').then((m) => ({ default: m.DashboardWidgetGrid }))
)
`
  )

  writeFile(
    'apps/web/src/pages/DashboardPage.tsx',
    `${L(1, 44)
      .join('\n')
      .replace(
        /const CalendarView = lazy[\s\S]*?const SpendTrendChart = lazy[\s\S]*?\)\s*\n/,
        ''
      )
      .replace(
        /\/\/ ─── Tiny helpers[\s\S]*?function SectionCard[\s\S]*?\n\}\n\n\/\/ ─── Main component/,
        `import {
  DASHBOARD_STACK_GAP,
  DASHBOARD_CALENDAR_EXTRA_GAP,
  KpiCard,
  buildOrderSpendTrend,
} from '../components/dashboard/dashboardShared'
import { DashboardLoading } from '../components/dashboard/DashboardLoading'
import { DashboardPostOnboardingBanners } from '../components/dashboard/DashboardPostOnboardingBanners'
import { LazyDashboardWidgetGrid } from '../components/dashboard/lazyDashboardWidgets'

const CalendarView = lazy(() =>
  import('../components/CalendarView').then((m) => ({ default: m.CalendarView }))
)

// ─── Main component`
      )}

export function DashboardPage() {
${L(229, 512).join('\n')}

  if (isLoading) {
    return <DashboardLoading />
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 64 }} data-testid="dashboard-page">
        <AlertTriangle size={32} style={{ color: 'var(--brand)', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          Failed to load dashboard
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Please try refreshing the page</p>
      </div>
    )
  }

  return (
    <div
      data-testid="dashboard-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: DASHBOARD_STACK_GAP,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {persona.readOnly && (
        <p
          style={{
            borderRadius: 8,
            border: '1px solid var(--app-border)',
            background: 'var(--brand-ultra)',
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--text-muted)',
            margin: 0,
          }}
          role="status"
        >
          Read-only workspace · {persona.roleLabel}
        </p>
      )}

      <DashboardPostOnboardingBanners
        isRestaurant={isRestaurant}
        isSupplier={isSupplier}
        showRestaurantCta={showRestaurantSection('showPostOnboardingCta')}
        totalOrders={stats?.totalOrders ?? 0}
        totalProducts={stats?.totalProducts ?? 0}
      />

      <div className="dashboard-page-header">
        <div className="min-w-0">
          <h1 style={{ fontSize: 21, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
            {dashboardConfig?.title ?? \`\${greeting}, \${firstName}\`}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {dashboardConfig?.description ?? formattedDate} &nbsp;·&nbsp; {persona.roleLabel}{' '}
            &nbsp;·&nbsp; {planName}
          </p>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
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
        />
      </Suspense>

${L(1202, 1236)
  .map((l) => l.replace(/^      /, '    '))
  .join('\n')}
    </div>
  )
}
`
  )
}

function splitQuickLists() {
  const lines = readLines('apps/web/src/pages/QuickListsPage.tsx')
  const L = (a, b) => lines.slice(a - 1, b)

  writeFile(
    'apps/web/src/components/quick-lists/QuickListStatCard.tsx',
    `import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

${L(70, 117).join('\n')}
`
  )

  const dialogImports = `import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectTrigger } from '../ui/select'
import { Badge } from '../ui/badge'
import { Search, Package, Plus, X, Clock, Calendar, CheckCircle, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../../utils/parseDaysOfWeek'
import { cn } from '../../lib/utils'`

  for (const [name, start, end, exportName] of [
    ['QuickListCreateDialog', 1007, 1055, 'QuickListCreateDialog'],
    ['QuickListProductDialog', 1058, 1112, 'QuickListProductDialog'],
    ['QuickListScheduleDialog', 1115, 1282, 'QuickListScheduleDialog'],
    ['QuickListDetailsDialog', 1285, 1461, 'QuickListDetailsDialog'],
  ]) {
    writeFile(
      `apps/web/src/components/quick-lists/${name}.tsx`,
      `${dialogImports}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ${exportName}(props: any) {
  return (
${L(start, end)
  .map((l) => l.replace(/^        /, '    '))
  .join('\n')}
  )
}
`
    )
  }

  writeFile(
    'apps/web/src/components/quick-lists/lazyQuickListDialogs.ts',
    `import { lazy } from 'react'

export const LazyQuickListCreateDialog = lazy(() =>
  import('./QuickListCreateDialog').then((m) => ({ default: m.QuickListCreateDialog }))
)
export const LazyQuickListProductDialog = lazy(() =>
  import('./QuickListProductDialog').then((m) => ({ default: m.QuickListProductDialog }))
)
export const LazyQuickListScheduleDialog = lazy(() =>
  import('./QuickListScheduleDialog').then((m) => ({ default: m.QuickListScheduleDialog }))
)
export const LazyQuickListDetailsDialog = lazy(() =>
  import('./QuickListDetailsDialog').then((m) => ({ default: m.QuickListDetailsDialog }))
)
`
  )

  const pageImports = L(1, 68)
    .join('\n')
    .replace(
      "import { useState, useMemo, type ReactNode } from 'react'",
      "import { Suspense, useState, useMemo } from 'react'"
    )
    .replace(
      "import { cn } from '../lib/utils'",
      `import { cn } from '../lib/utils'
import { QuickListStatCard } from '../components/quick-lists/QuickListStatCard'
import {
  LazyQuickListCreateDialog,
  LazyQuickListProductDialog,
  LazyQuickListScheduleDialog,
  LazyQuickListDetailsDialog,
} from '../components/quick-lists/lazyQuickListDialogs'`
    )

  const pageLogic = L(120, 1005).join('\n')

  writeFile(
    'apps/web/src/pages/QuickListsPage.tsx',
    `${pageImports}

export function QuickListsPage() {
${pageLogic}

        <Suspense fallback={null}>
          {showCreateDialog && <LazyQuickListCreateDialog {...{ showCreateDialog, setShowCreateDialog, newListName, setNewListName, newListDescription, setNewListDescription, handleCreateList }} />}
          {showProductDialog && (
            <LazyQuickListProductDialog
              {...{
                showProductDialog,
                setShowProductDialog,
                productSearch,
                setProductSearch,
                productsData,
                selectedListForProducts,
                handleAddProductToList,
                addingProductId,
              }}
            />
          )}
          {showScheduledOrder && (
            <LazyQuickListScheduleDialog
              {...{
                showScheduledOrder,
                setShowScheduledOrder,
                selectedListForSchedule,
                scheduleFrequency,
                setScheduleFrequency,
                scheduleDays,
                setScheduleDays,
                scheduleTime,
                setScheduleTime,
                autoCreateOrder,
                setAutoCreateOrder,
                handleCreateScheduledOrder,
                scheduleGate,
              }}
            />
          )}
          {showListDetails && (
            <LazyQuickListDetailsDialog
              {...{
                showListDetails,
                setShowListDetails,
                selectedListDetails,
                listDetailData,
                isLoadingListDetail,
                schedulingEnabled,
                handleAddAllToCart,
                handleOrderNow,
                handleOpenSchedule,
                handleUnschedule,
                handleDeleteList,
                handleEditList,
                handleAddProducts,
              }}
            />
          )}
        </Suspense>
      </div>
    </RequirePermission>
  )
}
`
  )
}

splitDashboard()
splitQuickLists()
