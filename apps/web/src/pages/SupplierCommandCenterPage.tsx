import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  useGetSupplierCommandCenterQuery,
  useCreateReorderReminderDraftMutation,
  useGetSupplierAtRiskOrdersQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { featureEnabled } from '../lib/planLimits'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import {
  Package,
  Truck,
  AlertTriangle,
  DollarSign,
  Users,
  Warehouse,
  Scale,
  Tag,
  ClipboardList,
  ArrowRight,
  BarChart3,
  Percent,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '../utils/format'
import { formatDeliveryStatus } from '../lib/deliveryStatusLabels'
import {
  ReorderReminderReviewDialog,
  type ReminderDraft,
} from '../components/supplier/ReorderReminderReviewDialog'
import { SupplierFollowUpPanel } from '../components/supplier/SupplierFollowUpPanel'
import { usePermissions } from '../hooks/usePermissions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { getCommandCenterLayout } from '../lib/workspaceRoleProfile'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { EmptyState } from '../components/ui/empty-state'

const OPS_QUICK_ACTIONS = [
  { label: 'Deliveries', href: '/app/fulfillment', icon: Truck, testId: 'qa-deliveries' },
  { label: 'Receivables', href: '/app/invoices', icon: DollarSign, testId: 'qa-invoices' },
  { label: 'Reorder', href: '#reorder', icon: Users, testId: 'qa-reorder' },
  { label: 'Low stock', href: '/app/inventory', icon: Warehouse, testId: 'qa-inventory' },
  { label: 'Disputes', href: '/app/disputes', icon: Scale, testId: 'qa-disputes' },
  { label: 'Deals', href: '/app/promotions', icon: Tag, testId: 'qa-deals' },
]

const SALES_QUICK_ACTIONS = [
  { label: 'Deals', href: '/app/promotions', icon: Tag, testId: 'qa-deals' },
  { label: 'Restaurants', href: '/app/restaurants', icon: Users, testId: 'qa-restaurants' },
  { label: 'Reorder leads', href: '#reorder', icon: Users, testId: 'qa-reorder' },
]

const FULFILLMENT_QUICK_ACTIONS = [
  { label: 'Fulfillment board', href: '/app/fulfillment', icon: Truck, testId: 'qa-deliveries' },
  { label: 'Orders', href: '/app/orders', icon: Package, testId: 'qa-orders' },
  { label: 'Low stock', href: '/app/inventory', icon: Warehouse, testId: 'qa-inventory' },
]

const CATALOG_QUICK_ACTIONS = [
  { label: 'Products', href: '/app/products', icon: Package, testId: 'qa-products' },
  {
    label: 'Contract pricing',
    href: '/app/contract-pricing',
    icon: Percent,
    testId: 'qa-pricing',
  },
  { label: 'Low stock', href: '/app/inventory', icon: Warehouse, testId: 'qa-inventory' },
]

const FINANCE_QUICK_ACTIONS = [
  { label: 'Invoices', href: '/app/invoices', icon: FileText, testId: 'qa-invoices' },
  { label: 'Restaurants', href: '/app/restaurants', icon: Users, testId: 'qa-restaurants' },
]

const QUICK_ACTION_SETS = {
  ops: OPS_QUICK_ACTIONS,
  sales: SALES_QUICK_ACTIONS,
  fulfillment: FULFILLMENT_QUICK_ACTIONS,
  catalog: CATALOG_QUICK_ACTIONS,
  finance: FINANCE_QUICK_ACTIONS,
} as const

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  testId,
  extra,
}: {
  label: string
  value: string | number
  icon: typeof Package
  href?: string
  testId: string
  extra?: ReactNode
}) {
  const shellClass =
    'flex min-h-[88px] flex-col gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5'
  const main = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
        <Icon size={16} className="shrink-0 text-[var(--brand)]" />
      </div>
      <span className="text-xl font-extrabold text-[var(--text)]">{value}</span>
    </>
  )

  if (href && extra) {
    return (
      <div data-testid={testId} className={shellClass}>
        <Link to={href} className="no-underline hover:opacity-90 transition-opacity block">
          {main}
        </Link>
        {extra}
      </div>
    )
  }

  if (href) {
    return (
      <Link
        to={href}
        data-testid={testId}
        className="no-underline hover:opacity-90 transition-opacity"
      >
        <div className={shellClass}>{main}</div>
      </Link>
    )
  }

  return (
    <div data-testid={testId} className={shellClass}>
      {main}
      {extra}
    </div>
  )
}

function formatOrderDate(iso: string | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function SupplierCommandCenterPage() {
  const { can } = usePermissions()
  const { persona } = useWorkspaceRole()
  const hubMode = persona.commandCenterMode ?? 'full'
  const layout = getCommandCenterLayout(hubMode, can)
  const hubTitle = persona.overviewNav?.label ?? 'Command Center'
  const hubDescription =
    hubMode === 'sales'
      ? 'Deals, reorder leads, and restaurant follow-ups'
      : hubMode === 'fulfillment'
        ? 'Orders to pick, deliveries in progress, and stock alerts'
        : hubMode === 'catalog'
          ? 'Catalog health, pricing, and low-stock items'
          : hubMode === 'finance'
            ? 'Receivables, overdue accounts, and collections'
            : persona.readOnly
              ? 'Read-only snapshot of supplier priorities'
              : "Today's priorities — action items, not just charts"
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const smartReorderEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.smart_reorder
  )
  const { data, isLoading, isError, error, refetch, isFetching } =
    useGetSupplierCommandCenterQuery()
  const { data: atRiskData } = useGetSupplierAtRiskOrdersQuery(undefined, {
    skip: !smartReorderEnabled || !layout.showAtRisk,
  })
  const [createDraft, { isLoading: drafting }] = useCreateReorderReminderDraftMutation()
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null)

  const kpis = data?.kpis
  const previews = data?.previews

  const handleDraftReminder = async (restaurantId: string) => {
    try {
      const result = await createDraft({ restaurantId, openChat: false }).unwrap()
      const draft = result.draft ?? result
      if (draft?.autoSent) {
        toast.error('Unexpected: reminder was marked as sent')
        return
      }
      setReminderDraft({
        id: draft.id,
        subject: draft.subject,
        body: draft.body,
        status: draft.status,
        autoSent: false,
      })
      toast.success('Draft saved — review before sending')
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Could not create reminder draft')
    }
  }

  const gateProps =
    hubMode === 'sales'
      ? { anyOf: ['PROMOTIONS_VIEW'] as const, title: 'sales hub' }
      : {
          anyOf: [
            'ORDERS_MANAGE',
            'INVOICES_VIEW',
            'CATALOG_EDIT',
            'FULFILLMENT_VIEW',
            'PROMOTIONS_MANAGE',
            'PROMOTIONS_VIEW',
          ] as const,
          title: 'command center',
        }
  const quickActions = QUICK_ACTION_SETS[layout.quickActions]

  if (isLoading) {
    return (
      <RequirePermission {...gateProps}>
        <PageShell data-testid="supplier-command-center-page" aria-busy="true">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <div className="dashboard-kpi-grid">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <div className="dashboard-content-grid">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        </PageShell>
      </RequirePermission>
    )
  }

  if (isError) {
    return (
      <RequirePermission {...gateProps}>
        <div
          data-testid="supplier-command-center-error"
          className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-6 text-center"
          role="alert"
        >
          <AlertTriangle size={32} className="text-[var(--brand)] mx-auto mb-3" />
          <p className="font-bold text-[var(--text)]">Failed to load command center</p>
          <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
            {(error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
              'Check your connection and try again.'}
          </p>
          <Button onClick={() => refetch()} className="mt-4" data-testid="command-center-retry">
            Retry
          </Button>
        </div>
      </RequirePermission>
    )
  }

  return (
    <RequirePermission {...gateProps}>
      <PageShell data-testid="supplier-command-center-page">
        {persona.readOnly && (
          <p
            className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2 text-xs text-[var(--text-muted)]"
            role="status"
          >
            Read-only workspace · {persona.roleLabel} — you can view priorities but cannot take
            actions.
          </p>
        )}
        <PageHeader
          title={hubTitle}
          description={
            isFetching && !isLoading ? `${hubDescription} (Refreshing...)` : hubDescription
          }
          actions={
            layout.showAnalyticsLink ? (
              <Button
                variant="outline"
                size="sm"
                asChild
                data-testid="link-analytics-dashboard"
                className="w-full sm:w-auto"
              >
                <Link to="/app/dashboard">
                  <BarChart3 className="h-4 w-4 mr-1.5" />
                  Analytics dashboard
                </Link>
              </Button>
            ) : undefined
          }
        />

        <nav
          className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-2.5 sm:mx-0 sm:flex-wrap"
          aria-label="Quick actions"
          data-testid="command-center-quick-actions"
        >
          {quickActions.map(({ label, href, icon: Icon, testId }) => (
            <Link
              key={testId}
              to={href}
              data-testid={testId}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text)] no-underline transition-colors hover:border-[var(--brand-light)] hover:bg-[var(--brand-ultra)] sm:shrink"
            >
              <Icon size={14} className="text-[var(--brand)]" />
              {label}
            </Link>
          ))}
        </nav>

        {(layout.showOpsKpis || layout.showSalesKpi || layout.showFinanceKpi) && (
          <div
            className={
              hubMode === 'sales' || hubMode === 'finance' ? 'max-w-sm' : 'dashboard-kpi-grid'
            }
          >
            {layout.showOpsKpis && (
              <>
                <KpiCard
                  testId="kpi-orders-prepare"
                  label="Orders to prepare today"
                  value={kpis?.ordersToPrepareToday ?? 0}
                  icon={Package}
                  href="/app/orders"
                />
                <KpiCard
                  testId="kpi-deliveries-pending"
                  label="Deliveries pending"
                  value={kpis?.deliveriesPendingToday ?? 0}
                  icon={Truck}
                  href="/app/fulfillment"
                  extra={
                    previews?.deliveryGpsSummary ? (
                      <div
                        data-testid="delivery-gps-summary"
                        className="mt-1 border-t border-[var(--app-border)] pt-2 text-xs"
                      >
                        <p className="mb-1.5 font-semibold text-[var(--text-muted)]">GPS today</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--text)]">
                          <span>
                            <span className="font-bold text-[var(--mint)]">
                              {previews.deliveryGpsSummary.live ?? 0}
                            </span>{' '}
                            Live
                          </span>
                          <span>
                            <span className="font-bold text-amber-600">
                              {previews.deliveryGpsSummary.stale ?? 0}
                            </span>{' '}
                            Stale
                          </span>
                          <span>
                            <span className="font-bold">
                              {previews.deliveryGpsSummary.noGps ?? 0}
                            </span>{' '}
                            No GPS
                          </span>
                          <span>
                            <span className="font-bold text-[var(--red)]">
                              {previews.deliveryGpsSummary.failed ?? 0}
                            </span>{' '}
                            Failed
                          </span>
                        </div>
                        <Link
                          to="/app/fulfillment?tab=tracking"
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-[var(--brand-mid)] hover:underline"
                        >
                          Open tracking
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </div>
                    ) : undefined
                  }
                />
              </>
            )}
            {layout.showFinanceKpi && (
              <KpiCard
                testId="kpi-unpaid-balance"
                label="Unpaid balance"
                value={formatCurrency(kpis?.unpaidBalance ?? 0)}
                icon={DollarSign}
                href="/app/invoices"
              />
            )}
            {layout.showSalesKpi && (
              <KpiCard
                testId="kpi-reorder-due"
                label="Restaurants due to reorder"
                value={kpis?.customersDueReorder ?? 0}
                icon={Users}
                href="#reorder"
              />
            )}
          </div>
        )}

        {layout.showPriorities && (
          <section
            data-testid="todays-priorities"
            className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
          >
            <h2 className="text-[15px] font-extrabold mb-2.5 flex items-center gap-2 text-[var(--text)]">
              <ClipboardList size={16} />
              Today&apos;s priorities
            </h2>
            {(data?.todaysPriorities || []).length === 0 ? (
              <div data-testid="priorities-empty">
                <EmptyState
                  title="No urgent items"
                  description="You're caught up for now."
                  icon={<ClipboardList className="h-5 w-5" />}
                />
              </div>
            ) : (
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {data!.todaysPriorities.map((item: { id: string; title: string; href: string }) => (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      data-testid={`priority-${item.id}`}
                      className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] font-semibold text-[var(--text)] no-underline hover:border-[var(--brand-light)]"
                    >
                      {item.title}
                      <ArrowRight size={14} className="text-[var(--text-muted)] shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {(layout.showDeliveryPreview ||
          layout.showReceivablesPreview ||
          layout.showLowStockPreview) && (
          <div className="dashboard-content-grid">
            {layout.showDeliveryPreview && (
              <PreviewCard title="Deliveries" testId="preview-deliveries" href="/app/fulfillment">
                {(previews?.deliveries || []).length === 0 ? (
                  <EmptyInline>No active deliveries right now.</EmptyInline>
                ) : (
                  previews!.deliveries.map(
                    (d: {
                      orderId: string
                      restaurantName: string
                      deliveryStatus: string
                      driverName?: string
                    }) => (
                      <div
                        key={d.orderId}
                        className="text-xs py-1 border-b border-[var(--app-border)] last:border-0"
                      >
                        <Link
                          to={`/app/orders/${d.orderId}`}
                          className="font-medium text-[var(--brand)] hover:underline"
                        >
                          {d.restaurantName}
                        </Link>
                        <span className="text-[var(--text-muted)]">
                          {' '}
                          — {formatDeliveryStatus(d.deliveryStatus)}
                          {d.driverName ? ` · ${d.driverName}` : ''}
                        </span>
                      </div>
                    )
                  )
                )}
              </PreviewCard>
            )}

            {layout.showReceivablesPreview && (
              <PreviewCard title="Who owes me" testId="preview-receivables" href="/app/invoices">
                <div className="text-[13px] font-bold">
                  {formatCurrency(previews?.receivables?.unpaidTotal ?? 0)} unpaid
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  Overdue: {formatCurrency(previews?.receivables?.overdueTotal ?? 0)}
                </div>
                {(previews?.receivables?.topDebtors || []).length === 0 ? (
                  <EmptyInline className="mt-2">No open balances.</EmptyInline>
                ) : (
                  (previews?.receivables?.topDebtors || [])
                    .slice(0, 3)
                    .map(
                      (d: { restaurantId: string; restaurantName: string; balanceDue: number }) => (
                        <Link
                          key={d.restaurantId}
                          to={`/app/restaurants/${d.restaurantId}`}
                          className="block text-xs mt-1.5 text-[var(--text)] hover:text-[var(--brand)]"
                          data-testid={`debtor-link-${d.restaurantId}`}
                        >
                          {d.restaurantName}: {formatCurrency(d.balanceDue)}
                        </Link>
                      )
                    )
                )}
              </PreviewCard>
            )}

            {layout.showLowStockPreview && (
              <PreviewCard title="Low stock" testId="preview-low-stock" href="/app/inventory">
                {(previews?.lowStock || []).length === 0 ? (
                  <EmptyInline>Stock levels look healthy.</EmptyInline>
                ) : (
                  previews!.lowStock.map(
                    (p: {
                      productId: string
                      name: string
                      availableQty: number
                      sku?: string
                    }) => (
                      <Link
                        key={p.productId}
                        to={`/app/products/${p.productId}`}
                        className="block text-xs py-1 text-[var(--text)] hover:text-[var(--brand)]"
                      >
                        {p.name} — {p.availableQty} left
                      </Link>
                    )
                  )
                )}
              </PreviewCard>
            )}
          </div>
        )}

        {layout.showReorder && <SupplierFollowUpPanel className="mb-4" />}

        {layout.showReorder && (
          <section
            id="reorder"
            data-testid="reorder-opportunities"
            className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
          >
            <h2 className="text-[15px] font-extrabold mb-2.5 flex items-center gap-2 text-[var(--text)]">
              <Users size={16} />
              Reorder opportunities
              {(kpis?.customersDueReorder ?? 0) > 0 && (
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  ({kpis!.customersDueReorder} due)
                </span>
              )}
            </h2>
            {(previews?.reorderOpportunities || []).length === 0 ? (
              <div data-testid="reorder-empty">
                <EmptyState
                  title="No reorder opportunities"
                  description="No restaurants are past their usual reorder window right now."
                  icon={<Users className="h-5 w-5" />}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {previews!.reorderOpportunities.map(
                  (c: {
                    restaurantId: string
                    restaurantName: string
                    suggestedFollowUp?: string
                    avgDaysBetween?: number
                    lastOrderAt?: string
                    daysSinceLastOrder?: number
                    suggestedProducts?: Array<{ productName: string; sku: string }>
                  }) => (
                    <div
                      key={c.restaurantId}
                      data-testid={`reorder-customer-${c.restaurantId}`}
                      className="rounded-[10px] border border-[var(--app-border)] bg-[var(--surface)] p-3"
                    >
                      <div className="font-bold text-[13px]">{c.restaurantName}</div>
                      <ul className="mt-2 text-xs text-[var(--text-muted)] space-y-1 list-disc pl-4">
                        <li>Usually orders every ~{c.avgDaysBetween ?? '—'} days</li>
                        <li>
                          Last order: {formatOrderDate(c.lastOrderAt)} (
                          {c.daysSinceLastOrder ?? '—'} days ago)
                        </li>
                        {c.suggestedProducts && c.suggestedProducts.length > 0 && (
                          <li>
                            Often orders:{' '}
                            {c.suggestedProducts
                              .slice(0, 3)
                              .map((p) => p.productName)
                              .join(', ')}
                          </li>
                        )}
                      </ul>
                      <div className="action-bar mt-3">
                        {layout.allowReorderActions && (
                          <Button
                            size="sm"
                            disabled={drafting}
                            data-testid={`reorder-draft-${c.restaurantId}`}
                            className="w-full sm:w-auto"
                            onClick={() => handleDraftReminder(c.restaurantId)}
                          >
                            Review reminder
                          </Button>
                        )}
                        <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                          <Link to={`/app/restaurants/${c.restaurantId}`}>View customer</Link>
                        </Button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {layout.showAtRisk && (atRiskData?.atRisk?.length ?? 0) > 0 && (
          <section
            data-testid="at-risk-expected-orders"
            className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
          >
            <h2 className="text-[15px] font-extrabold mb-2.5 flex items-center gap-2 text-[var(--text)]">
              <AlertTriangle size={16} className="text-amber-600" />
              At-risk expected orders today
            </h2>
            <ul className="text-sm space-y-2">
              {atRiskData.atRisk.map(
                (r: {
                  cadenceId: string
                  restaurantName: string
                  label: string
                  dayName: string
                }) => (
                  <li key={r.cadenceId} className="border-b border-[var(--app-border)] pb-2">
                    <span className="font-semibold">{r.restaurantName}</span> — usually orders{' '}
                    {r.label} on {r.dayName}s but has not ordered yet.
                  </li>
                )
              )}
            </ul>
          </section>
        )}

        {layout.showBoostedDeals && (
          <section
            data-testid="preview-boosted-deals"
            className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
          >
            <h2 className="text-[15px] font-extrabold mb-2 flex items-center gap-2">
              <Tag size={16} />
              Boosted deals (30 days)
            </h2>
            {previews?.boostedDeals ? (
              <>
                <p className="text-[13px] m-0">
                  {previews.boostedDeals.activeBoostedDeals} active ·{' '}
                  {previews.boostedDeals.totalViews} impressions ·{' '}
                  {previews.boostedDeals.totalClicks} clicks
                </p>
                <Link
                  to="/app/promotions"
                  className="text-xs text-[var(--brand)] font-semibold mt-2 inline-block"
                >
                  Manage deals →
                </Link>
              </>
            ) : (
              <EmptyInline>No boosted deal activity in the last 30 days.</EmptyInline>
            )}
          </section>
        )}

        {layout.showDisputeAlerts && (kpis?.openDisputes ?? 0) > 0 && (
          <Link
            to="/app/disputes"
            data-testid="preview-disputes"
            className="text-[13px] flex items-center gap-2 text-[var(--red)] font-semibold"
          >
            <Scale size={14} />
            {kpis!.openDisputes} dispute(s) need your response
          </Link>
        )}
        {layout.showFulfillmentAlerts && (kpis?.fulfillmentAlerts ?? 0) > 0 && (
          <Link
            to="/app/fulfillment"
            data-testid="preview-fulfillment-alerts"
            className="text-[13px] flex items-center gap-2 text-amber-700 font-semibold"
          >
            <Warehouse size={14} />
            {kpis!.fulfillmentAlerts} fulfillment alert(s)
          </Link>
        )}

        <ReorderReminderReviewDialog
          draft={reminderDraft}
          open={!!reminderDraft}
          onClose={() => setReminderDraft(null)}
        />
      </PageShell>
    </RequirePermission>
  )
}

function PreviewCard({
  title,
  children,
  href,
  testId,
}: {
  title: string
  children: ReactNode
  href: string
  testId: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[13px] font-extrabold">{title}</span>
        <Link to={href} className="text-[11px] text-[var(--brand)] font-semibold no-underline">
          View all
        </Link>
      </div>
      {children}
    </div>
  )
}

function EmptyInline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-[var(--text-muted)] m-0 ${className}`}>{children}</p>
}
