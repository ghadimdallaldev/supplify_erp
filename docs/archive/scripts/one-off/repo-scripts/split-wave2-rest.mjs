/**
 * Wave 2 splits: invoices, quick-lists, dashboard, reservations, receiving
 * Run: node scripts/split-wave2-rest.mjs [all|invoices|quicklists|dashboard|reservations|receiving]
 */
import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const src = (p) => path.join(root, p)
const readLines = (p) => fs.readFileSync(src(p), 'utf8').split(/\r?\n/)
const writeFile = (p, content) => {
  fs.mkdirSync(path.dirname(src(p)), { recursive: true })
  fs.writeFileSync(src(p), content)
  console.log('wrote', p)
}

function dedent(lines, prefix) {
  return lines.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l))
}

function wrapComponent(name, bodyLines, imports, propsDecl = 'props: Record<string, unknown>') {
  const body = bodyLines.join('\n')
  return `${imports}

export function ${name}(${propsDecl}) {
  return (
${body}
  )
}
`
}

function splitInvoices() {
  const lines = readLines('apps/web/src/pages/InvoicesPage.tsx')
  const L = (a, b) => lines.slice(a - 1, b)

  writeFile(
    'apps/web/src/components/invoices/InvoiceCreditNotesCard.tsx',
    wrapComponent(
      'InvoiceCreditNotesCard',
      dedent(L(334, 394), '        '),
      `import { Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { StatusBadge } from '../ui/status-badge'
import { formatPrice } from '../../utils/format'
import { useApplyCreditNoteMutation } from '../../services/api'`,
      `{
  tenantCreditNotes,
  refetchCreditNotes,
  refetch,
}: {
  tenantCreditNotes: Record<string, unknown>[]
  refetchCreditNotes: () => void
  refetch: () => void
}`
    ).replace(
      'export function InvoiceCreditNotesCard',
      `export function InvoiceCreditNotesCard`
    )
  )

  // Fix credit notes - needs applyCreditNote hook inside component
  writeFile(
    'apps/web/src/components/invoices/InvoiceCreditNotesCard.tsx',
    `import { Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { StatusBadge } from '../ui/status-badge'
import { formatPrice } from '../../utils/format'
import { useApplyCreditNoteMutation } from '../../services/api'

type InvoiceCreditNotesCardProps = {
  tenantCreditNotes: Record<string, unknown>[]
  refetchCreditNotes: () => void
  refetch: () => void
}

export function InvoiceCreditNotesCard({
  tenantCreditNotes,
  refetchCreditNotes,
  refetch,
}: InvoiceCreditNotesCardProps) {
  const [applyCreditNote] = useApplyCreditNoteMutation()

  return (
${dedent(L(334, 394), '        ')
  .join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/invoices/InvoiceStatsCards.tsx',
    `type InvoiceStatsCardsProps = {
  stats: {
    total: number
    unpaid: number
    overdue: number
    totalOutstanding: number
    totalPaid: number
  }
  analytics: Record<string, unknown>
  analyticsData: unknown
  overdueData: { summary?: { totalOverdue?: number } } | undefined
}

export function InvoiceStatsCards({
  stats,
  analytics,
  analyticsData,
  overdueData,
}: InvoiceStatsCardsProps) {
  return (
    <>
${dedent(L(396, 512), '        ').join('\n')}
    </>
  )
}
`.replace(
      /^type InvoiceStatsCardsProps/m,
      `import {
  FileText,
  Clock,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '../ui/card'
import { formatPrice } from '../../utils/format'

type InvoiceStatsCardsProps`
    )
  )

  writeFile(
    'apps/web/src/components/invoices/InvoiceListPanel.tsx',
    `import { Link } from 'react-router-dom'
import {
  FileText,
  Search,
  CreditCard,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { StatusBadge } from '../ui/status-badge'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { formatPrice } from '../../utils/format'
import { splitRowClass } from '../ui/card-layout'

type InvoiceListPanelProps = {
  search: string
  setSearch: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  supplierFilter: string
  setSupplierFilter: (v: string) => void
  suppliers: Array<{ id: string; name: string }>
  filteredInvoices: any[]
  canRecordPayments: boolean
  onSelectInvoice: (invoice: any) => void
  onPayInvoice: (invoice: any) => void
}

export function InvoiceListPanel({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  supplierFilter,
  setSupplierFilter,
  suppliers,
  filteredInvoices,
  canRecordPayments,
  onSelectInvoice,
  onPayInvoice,
}: InvoiceListPanelProps) {
  return (
${dedent(L(515, 651), '        ')
  .map((l) =>
    l
      .replace(
        /setSelectedInvoice\(invoice\)\s*\n\s*setShowInvoiceDetail\(true\)/g,
        'onSelectInvoice(invoice)'
      )
      .replace(/handleOpenPaymentDialog\(invoice\)/g, 'onPayInvoice(invoice)')
      .replace(
        /onClick=\{\(\) => \{\s*setSelectedInvoice\(invoice\)\s*setShowInvoiceDetail\(true\)\s*\}\}/g,
        'onClick={() => onSelectInvoice(invoice)}'
      )
  )
  .join('\n')}
  )
}
`
  )

  // Detail + payment dialogs - keep as large components with any props for brevity
  const dialogImports = `import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { StatusBadge } from '../ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { Loader2, Download, CreditCard, ArrowRightLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatPrice } from '../../utils/format'
import { apiUrl } from '../../lib/apiBase'`

  writeFile(
    'apps/web/src/components/invoices/InvoiceDetailDialog.tsx',
    `${dialogImports}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function InvoiceDetailDialog(props: any) {
  const {
    showInvoiceDetail,
    setShowInvoiceDetail,
    selectedInvoice,
    invoiceDetail,
    isLoadingDetail,
    downloadingPdfId,
    setDownloadingPdfId,
    isRestaurant,
    canRecordPayments,
    handleOpenPaymentDialog,
    remainingBalance,
  } = props

  return (
${dedent(L(654, 1026), '        ').join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/invoices/InvoicePaymentDialog.tsx',
    `${dialogImports}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function InvoicePaymentDialog(props: any) {
  const {
    showPaymentDialog,
    setShowPaymentDialog,
    selectedInvoice,
    remainingBalance,
    isRestaurant,
    paymentMode,
    setPaymentMode,
    paymentAmount,
    setPaymentAmount,
    creditAmount,
    setCreditAmount,
    selectedCreditNoteId,
    setSelectedCreditNoteId,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    bankName,
    setBankName,
    paymentNotes,
    setPaymentNotes,
    paidByHQ,
    setPaidByHQ,
    hqNotes,
    setHqNotes,
    creditNotes,
    handleRecordPayment,
    isProcessingAnyPayment,
  } = props

  return (
${dedent(L(1028, 1472), '        ').join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/invoices/lazyInvoiceDialogs.ts',
    `import { lazy } from 'react'

export const LazyInvoiceDetailDialog = lazy(() =>
  import('./InvoiceDetailDialog').then((m) => ({ default: m.InvoiceDetailDialog }))
)
export const LazyInvoicePaymentDialog = lazy(() =>
  import('./InvoicePaymentDialog').then((m) => ({ default: m.InvoicePaymentDialog }))
)
`
  )

  // Thin page: keep lines 1-305, replace return body
  const header = L(1, 305).join('\n')
  writeFile(
    'apps/web/src/pages/InvoicesPage.tsx',
    `${header}

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-mid)]" />
      </div>
    )
  }

  const handleSelectInvoice = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowInvoiceDetail(true)
  }

  return (
    <RequirePermission permission="INVOICES_VIEW" title="invoices">
      <div className="space-y-6">
        <PageHeader
          title={invoicesTitle}
          description={invoicesDescription}
          actions={
            <Button variant="outline" onClick={handleExportCsv} disabled={exportingCsv}>
              {exportingCsv ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export CSV
            </Button>
          }
        />

        {!isRestaurant && financeInvoicesEnabled && <SupplierReceivablesPanel />}

        {disputesEnabled && tenantCreditNotes.length > 0 && (
          <InvoiceCreditNotesCard
            tenantCreditNotes={tenantCreditNotes}
            refetchCreditNotes={refetchCreditNotes}
            refetch={refetch}
          />
        )}

        <InvoiceStatsCards
          stats={stats}
          analytics={analytics}
          analyticsData={analyticsData}
          overdueData={overdueData}
        />

        <InvoiceListPanel
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          supplierFilter={supplierFilter}
          setSupplierFilter={setSupplierFilter}
          suppliers={suppliers}
          filteredInvoices={filteredInvoices}
          canRecordPayments={canRecordPayments}
          onSelectInvoice={handleSelectInvoice}
          onPayInvoice={handleOpenPaymentDialog}
        />

        <Suspense fallback={null}>
          {showInvoiceDetail && (
            <LazyInvoiceDetailDialog
              showInvoiceDetail={showInvoiceDetail}
              setShowInvoiceDetail={setShowInvoiceDetail}
              selectedInvoice={selectedInvoice}
              invoiceDetail={invoiceDetail}
              isLoadingDetail={isLoadingDetail}
              downloadingPdfId={downloadingPdfId}
              setDownloadingPdfId={setDownloadingPdfId}
              isRestaurant={isRestaurant}
              canRecordPayments={canRecordPayments}
              handleOpenPaymentDialog={handleOpenPaymentDialog}
              remainingBalance={remainingBalance}
            />
          )}
          {showPaymentDialog && (
            <LazyInvoicePaymentDialog
              showPaymentDialog={showPaymentDialog}
              setShowPaymentDialog={setShowPaymentDialog}
              selectedInvoice={selectedInvoice}
              remainingBalance={remainingBalance}
              isRestaurant={isRestaurant}
              paymentMode={paymentMode}
              setPaymentMode={setPaymentMode}
              paymentAmount={paymentAmount}
              setPaymentAmount={setPaymentAmount}
              creditAmount={creditAmount}
              setCreditAmount={setCreditAmount}
              selectedCreditNoteId={selectedCreditNoteId}
              setSelectedCreditNoteId={setSelectedCreditNoteId}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              paymentReference={paymentReference}
              setPaymentReference={setPaymentReference}
              bankName={bankName}
              setBankName={setBankName}
              paymentNotes={paymentNotes}
              setPaymentNotes={setPaymentNotes}
              paidByHQ={paidByHQ}
              setPaidByHQ={setPaidByHQ}
              hqNotes={hqNotes}
              setHqNotes={setHqNotes}
              creditNotes={creditNotes}
              handleRecordPayment={handleRecordPayment}
              isProcessingAnyPayment={isProcessingAnyPayment}
            />
          )}
        </Suspense>
      </div>
    </RequirePermission>
  )
}
`.replace(
      /^import \{ useState \}/m,
      `import { Suspense, useState } from 'react'`
    ).replace(
      /from '\.\.\/components\/supplier\/SupplierReceivablesPanel'/,
      `from '../components/supplier/SupplierReceivablesPanel'
import { InvoiceCreditNotesCard } from '../components/invoices/InvoiceCreditNotesCard'
import { InvoiceStatsCards } from '../components/invoices/InvoiceStatsCards'
import { InvoiceListPanel } from '../components/invoices/InvoiceListPanel'
import {
  LazyInvoiceDetailDialog,
  LazyInvoicePaymentDialog,
} from '../components/invoices/lazyInvoiceDialogs'`
    )
  )
}

function splitQuickLists() {
  const lines = readLines('apps/web/src/pages/QuickListsPage.tsx')
  const L = (a, b) => lines.slice(a - 1, b)

  writeFile(
    'apps/web/src/components/quick-lists/QuickListStatCard.tsx',
    `${L(1, 68).join('\n')}
${L(70, 117).join('\n')}
`
  )

  writeFile(
    'apps/web/src/components/quick-lists/QuickListGrid.tsx',
    `import { Link } from 'react-router-dom'
import {
  List,
  ShoppingCart,
  Trash2,
  Edit,
  Package,
  Clock,
  Repeat,
  Calendar,
  CheckCircle,
  Pause,
  Eye,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import {
  CardActionGrid,
  CardStatusBadges,
  cardActionBtnClass,
  cardShellClass,
} from '../ui/card-layout'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/empty-state'
import { formatPrice } from '../../utils/format'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../../utils/parseDaysOfWeek'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function QuickListGrid(props: any) {
  const {
    isLoading,
    filteredLists,
    schedulingEnabled,
    scheduleGate,
    onViewDetails,
    onEditList,
    onDeleteList,
    onAddProducts,
    onSchedule,
    onUnschedule,
    onAddAllToCart,
    addingListId,
  } = props

  if (isLoading) {
    return (
${dedent(L(700, 750), '        ').join('\n') || dedent(L(650, 700), '        ').join('\n')}
    )
  }

  return (
${dedent(L(750, 1004), '        ').join('\n')}
  )
}
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
import { Search, Package, Plus, X, Clock, Calendar, CheckCircle } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../../utils/parseDaysOfWeek'
import { cn } from '../../lib/utils'`

  writeFile(
    'apps/web/src/components/quick-lists/QuickListCreateDialog.tsx',
    `${dialogImports}

export function QuickListCreateDialog(props: any) {
  const { showCreateDialog, setShowCreateDialog, newListName, setNewListName, newListDescription, setNewListDescription, handleCreateList } = props
  return (
${dedent(L(1007, 1055), '        ').join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/quick-lists/QuickListProductDialog.tsx',
    `${dialogImports}

export function QuickListProductDialog(props: any) {
  return (
${dedent(L(1058, 1112), '        ').join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/quick-lists/QuickListScheduleDialog.tsx',
    `${dialogImports}

export function QuickListScheduleDialog(props: any) {
  return (
${dedent(L(1115, 1282), '        ').join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/quick-lists/QuickListDetailsDialog.tsx',
    `${dialogImports}

export function QuickListDetailsDialog(props: any) {
  return (
${dedent(L(1285, 1462), '        ').join('\n')}
  )
}
`
  )

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

  // Find where main grid starts in QuickListsPage
  const pageStart = L(1, 118).join('\n').replace(
    /^import \{ useState, useMemo, type ReactNode \}/m,
    `import { Suspense, useState, useMemo } from 'react'`
  )

  // Remove QuickListStatCard from page - it's extracted
  const pageBody = L(119, 1004).join('\n')
    .replace(/function QuickListStatCard[\s\S]*?\n\}/, '')
    .replace(
      /\{\/\* Create List Dialog \*\/\}[\s\S]*$/,
      ''
    )

  writeFile(
    'apps/web/src/pages/QuickListsPage.tsx',
    `${pageStart.replace("import { useState, useMemo, type ReactNode } from 'react'", "import { Suspense, useState, useMemo } from 'react'")}
import { QuickListStatCard } from '../components/quick-lists/QuickListStatCard'
import { QuickListGrid } from '../components/quick-lists/QuickListGrid'
import {
  LazyQuickListCreateDialog,
  LazyQuickListProductDialog,
  LazyQuickListScheduleDialog,
  LazyQuickListDetailsDialog,
} from '../components/quick-lists/lazyQuickListDialogs'

${pageBody}

        <Suspense fallback={null}>
          {showCreateDialog && <LazyQuickListCreateDialog {...{ showCreateDialog, setShowCreateDialog, newListName, setNewListName, newListDescription, setNewListDescription, handleCreateList }} />}
          {showProductDialog && <LazyQuickListProductDialog {...arguments[0]} />}
        </Suspense>
`
  )
}

// ... dashboard, reservations, receiving continue below

function splitDashboard() {
  const lines = readLines('apps/web/src/pages/DashboardPage.tsx')
  const L = (a, b) => lines.slice(a - 1, b)

  writeFile(
    'apps/web/src/components/dashboard/dashboardShared.tsx',
    `import type { DashboardKpiKey } from '../../lib/workspaceRoleProfile'
import { formatCurrency } from '../../utils/format'

${L(45, 224).join('\n').replace(/\.\.\/\.\.\/components\/dashboard\/SpendTrendChart/g, './SpendTrendChart')}
`
  )

  writeFile(
    'apps/web/src/components/dashboard/DashboardLoading.tsx',
    `import { Skeleton } from '../ui/skeleton'
import { DASHBOARD_STACK_GAP } from './dashboardShared'

export function DashboardLoading() {
  return (
${dedent(L(329, 368), '      ').join('\n')}
  )
}
`
  )

  writeFile(
    'apps/web/src/components/dashboard/DashboardPostOnboardingBanners.tsx',
    `import { Link } from 'react-router-dom'
import { Package, ShoppingCart } from 'lucide-react'
import { Button } from '../ui/button'

type DashboardPostOnboardingBannersProps = {
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
}: DashboardPostOnboardingBannersProps) {
  return (
    <>
${dedent(L(542, 613), '      ').join('\n')}
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
import {
  SectionCard,
  SPEND_TREND_DAYS,
  DASHBOARD_GRID_GAP,
} from './dashboardShared'

const SpendTrendChart = lazy(() =>
  import('./SpendTrendChart').then((m) => ({ default: m.SpendTrendChart }))
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DashboardWidgetGrid(props: any) {
  return (
    <>
      <div className="dashboard-content-grid">
${dedent(L(637, 1199), '      ').join('\n')}
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

  const pageHeader = L(1, 44).join('\n')
  const pageLogic = L(228, 513).join('\n')
  const pageTail = L(514, 541).join('\n') + '\n' + dedent(L(615, 633), '      ').join('\n') + '\n' + dedent(L(1201, 1236), '      ').join('\n')

  writeFile(
    'apps/web/src/pages/DashboardPage.tsx',
    `${pageHeader.replace("import { lazy, Suspense } from 'react'", "import { lazy, Suspense } from 'react'")}
import {
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

export function DashboardPage() {
${pageLogic}

${pageTail.replace(
  'if (isLoading) {',
  `if (isLoading) {
    return <DashboardLoading />
  }

  if (false && isLoading) {`
).replace(
  /\/\/ ── Loading[\s\S]*?if \(error\)/,
  'if (error)'
)}

      <DashboardPostOnboardingBanners
        isRestaurant={isRestaurant}
        isSupplier={isSupplier}
        showRestaurantCta={showRestaurantSection('showPostOnboardingCta')}
        totalOrders={stats?.totalOrders ?? 0}
        totalProducts={stats?.totalProducts ?? 0}
      />

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
          {...{
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
            financeInvoicesEnabled,
          }}
        />
      </Suspense>

${dedent(L(1201, 1236), '      ').join('\n')}
    </div>
  )
}
`
  )
}

function splitReservations() {
  const lines = readLines('apps/web/src/components/reservations/ReservationTableBuilder.tsx')
  const L = (a, b) => lines.slice(a - 1, b)

  const sharedHeader = L(1, 38).join('\n').replace("'../../types'", "'../../../types'").replace("'../../lib/", "'../../../lib/").replace("'../../services/", "'../../../services/").replace("'../ui/", "'../../ui/")

  writeFile(
    'apps/web/src/components/reservations/table-builder/tableBuilderShared.tsx',
    `${sharedHeader}

${L(39, 335).join('\n')}
`
  )

  writeFile(
    'apps/web/src/components/reservations/table-builder/ChairLayer.tsx',
    `${L(1, 2).join('\n').replace("'../../types'", "'../../../types'")}
import type { ReservationTableShape } from '../../../types'
import {
  DEFAULT_CANVAS_WIDTH,
  MAX_VISIBLE_CHAIRS,
  type TableRect,
} from './tableBuilderShared'

interface ChairLayerProps {
  shape: ReservationTableShape
  capacity: number
  widthPx: number
  heightPx: number
  color: string
  isActive: boolean
}

${L(337, 505).join('\n').replace('interface ChairLayerProps {', '').replace(/^function ChairLayer/, 'export function ChairLayer')}
`
  )

  const mainImports = L(1, 37).join('\n')
    .replace("'../../types'", "'../../../types'")
    .replace("'../../lib/", "'../../../lib/")
    .replace("'../../services/", "'../../../services/")
    .replace("'../ui/", "'../../ui/")

  writeFile(
    'apps/web/src/components/reservations/table-builder/ReservationTableBuilder.tsx',
    `${mainImports}
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  GRID_PX,
  MAX_HISTORY,
  SHAPE_PRESETS,
  COLOR_PRESETS,
  ZONES,
  FEATURE_OPTIONS,
  SERVICE_STATUS_STYLES,
  shapeDefaults,
  clamp,
  createLocalId,
  snapPx as snapPxHelper,
  hydrateTables,
  findNextTablePosition,
  type EditableTable,
  type ReservationTableBuilderProps,
  type ServiceInfo,
  type TableShape,
  type TableZone,
} from './tableBuilderShared'
import { ChairLayer } from './ChairLayer'

${L(509, 1591).join('\n')}
`
  )

  writeFile(
    'apps/web/src/components/reservations/ReservationTableBuilder.tsx',
    `export { ReservationTableBuilder } from './table-builder/ReservationTableBuilder'
`
  )
}

function splitReceiving() {
  const lines = readLines('apps/web/src/pages/ReceivingPage.tsx')
  const L = (a, b) => lines.slice(a - 1, b)

  writeFile(
    'apps/web/src/components/receiving/ReceivingDialog.tsx',
    `${L(1, 58).join('\n').replace("'../", "'../../")}
${L(638, 865).join('\n').replace(/^function ReceivingDialog/, 'export function ReceivingDialog')}
`
  )

  writeFile(
    'apps/web/src/components/receiving/ReceivingPendingTab.tsx',
    `import { Link } from 'react-router-dom'
import {
  PackageCheck,
  Loader2,
  Clock,
  AlertCircle,
  Truck,
  CheckCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/skeleton'
import { formatPrice } from '../../utils/format'
import { isOrderReadyForReceiving } from '../../lib/orderReceiving'

type ReceivingPendingTabProps = {
  pendingLoading: boolean
  pendingOrders: any[]
  receivingOrderIds: Set<string>
  canReceive: boolean
  onReceive: (order: any) => void
}

export function ReceivingPendingTab({
  pendingLoading,
  pendingOrders,
  canReceive,
  onReceive,
}: ReceivingPendingTabProps) {
  if (pendingLoading) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  if (pendingOrders.length === 0) {
    return (
      <EmptyState
        title="No orders awaiting receiving"
        description="Delivered orders ready to receive will show up here."
        icon={<PackageCheck className="h-10 w-10" aria-hidden />}
      />
    )
  }

  return (
    <div className="grid gap-4">
${dedent(L(371, 518), '                      ').join('\n').replace(/handleReceive\(order\)/g, 'onReceive(order)')}
    </div>
  )
}
`
  )

  writeFile(
    'apps/web/src/components/receiving/ReceivingHistoryTab.tsx',
    `import { History, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/skeleton'
import { formatPrice } from '../../utils/format'

type ReceivingHistoryTabProps = {
  historyLoading: boolean
  historyReports: any[]
}

export function ReceivingHistoryTab({ historyLoading, historyReports }: ReceivingHistoryTabProps) {
  if (historyLoading) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  if (historyReports.length === 0) {
    return (
      <EmptyState
        title="No receiving history yet"
        description="Completed receiving reports will appear here."
        icon={<History className="h-10 w-10" aria-hidden />}
      />
    )
  }

  return (
    <div className="grid gap-4">
${dedent(L(530, 595), '                      ').join('\n')}
    </div>
  )
}
`
  )

  const pageLogic = L(1, 317).join('\n')
  writeFile(
    'apps/web/src/pages/ReceivingPage.tsx',
    `${pageLogic.replace(
      /import \{ OpenDisputeDialog \} from '\.\.\/components\/disputes\/OpenDisputeDialog'/,
      `import { OpenDisputeDialog } from '../components/disputes/OpenDisputeDialog'
import { ReceivingDialog } from '../components/receiving/ReceivingDialog'
import { ReceivingPendingTab } from '../components/receiving/ReceivingPendingTab'
import { ReceivingHistoryTab } from '../components/receiving/ReceivingHistoryTab'`
    )}

  return (
    <RequirePermission permission="RECEIVING_VIEW" title="receiving">
      {!receivingEnabled ? (
        <FeatureLockedCard
          featureKey="receiving_quality"
          featureName="Receiving & quality control"
          currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
          upgradeUrl="/app/settings?tab=subscription"
        />
      ) : (
        <div className="page-stack overflow-x-hidden" data-testid="receiving-page">
          <Card className="shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <PageHeader title={receivingTitle} description={receivingDescription} />

              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                data-testid="receiving-delivered-hint"
              >
                <strong>Delivered does not mean received.</strong> Confirm quantities on site even
                when the supplier marks an order as delivered.
              </div>

              <Tabs defaultValue="pending" className="space-y-4">
                <TabsList className="tabs-scroll h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
                  <TabsTrigger value="pending" className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4" />
                    Pending Orders
                    {pendingOrders.length > 0 && (
                      <Badge variant="destructive">{pendingOrders.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Receiving History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-4">
                  <ReceivingPendingTab
                    pendingLoading={pendingLoading}
                    pendingOrders={pendingOrders}
                    receivingOrderIds={receivingOrderIds}
                    canReceive={canReceive}
                    onReceive={handleReceive}
                  />
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                  <ReceivingHistoryTab
                    historyLoading={historyLoading}
                    historyReports={historyReports}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {selectedOrder && (
            <ReceivingDialog
              order={selectedOrder}
              open={showDialog}
              onOpenChange={setShowDialog}
              onSubmit={handleSubmitReceiving}
              isLoading={isCreating}
              canReceive={canReceive}
              canOpenDispute={canShowDispute}
              onOpenDispute={(formData) => beginDisputeFromReceiving(selectedOrder, formData)}
            />
          )}

          {openDisputeContext && (
            <OpenDisputeDialog
              open={Boolean(openDisputeContext)}
              onOpenChange={(open) => {
                if (!open) setOpenDisputeContext(null)
              }}
              orderId={openDisputeContext.orderId}
              defaultSupplierId={openDisputeContext.supplierId}
              receivingReportId={openDisputeContext.receivingReportId}
              initialLineItems={openDisputeContext.lineItems}
              onCreated={() => {
                setOpenDisputeContext(null)
                void refetchPending()
                void refetchHistory()
              }}
            />
          )}
        </div>
      )}
    </RequirePermission>
  )
}
`
  )
}

const cmd = process.argv[2] || 'all'
const runners = {
  invoices: splitInvoices,
  quicklists: splitQuickLists,
  dashboard: splitDashboard,
  reservations: splitReservations,
  receiving: splitReceiving,
}

if (cmd === 'all') {
  Object.values(runners).forEach((fn) => fn())
} else if (runners[cmd]) {
  runners[cmd]()
} else {
  console.log('Usage: node scripts/split-wave2-rest.mjs [all|invoices|quicklists|dashboard|reservations|receiving]')
}
