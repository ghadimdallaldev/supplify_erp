import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ensureNamespace } from '../i18n'
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

const OPS_QUICK_ACTION_KEYS = [
  {
    labelKey: 'commandCenter.quickActions.runSheet',
    href: '/app/run-sheet',
    icon: ClipboardList,
    testId: 'qa-run-sheet',
  },
  {
    labelKey: 'commandCenter.quickActions.deliveries',
    href: '/app/fulfillment',
    icon: Truck,
    testId: 'qa-deliveries',
  },
  {
    labelKey: 'commandCenter.quickActions.receivables',
    href: '/app/invoices',
    icon: DollarSign,
    testId: 'qa-invoices',
  },
  {
    labelKey: 'commandCenter.quickActions.reorder',
    href: '#reorder',
    icon: Users,
    testId: 'qa-reorder',
  },
  {
    labelKey: 'commandCenter.quickActions.lowStock',
    href: '/app/inventory',
    icon: Warehouse,
    testId: 'qa-inventory',
  },
  {
    labelKey: 'commandCenter.quickActions.disputes',
    href: '/app/disputes',
    icon: Scale,
    testId: 'qa-disputes',
  },
  {
    labelKey: 'commandCenter.quickActions.deals',
    href: '/app/promotions',
    icon: Tag,
    testId: 'qa-deals',
  },
] as const

const SALES_QUICK_ACTION_KEYS = [
  {
    labelKey: 'commandCenter.quickActions.deals',
    href: '/app/promotions',
    icon: Tag,
    testId: 'qa-deals',
  },
  {
    labelKey: 'commandCenter.quickActions.restaurants',
    href: '/app/restaurants',
    icon: Users,
    testId: 'qa-restaurants',
  },
  {
    labelKey: 'commandCenter.quickActions.reorderLeads',
    href: '#reorder',
    icon: Users,
    testId: 'qa-reorder',
  },
] as const

const FULFILLMENT_QUICK_ACTION_KEYS = [
  {
    labelKey: 'commandCenter.quickActions.fulfillmentBoard',
    href: '/app/fulfillment',
    icon: Truck,
    testId: 'qa-deliveries',
  },
  {
    labelKey: 'commandCenter.quickActions.orders',
    href: '/app/orders',
    icon: Package,
    testId: 'qa-orders',
  },
  {
    labelKey: 'commandCenter.quickActions.lowStock',
    href: '/app/inventory',
    icon: Warehouse,
    testId: 'qa-inventory',
  },
] as const

const CATALOG_QUICK_ACTION_KEYS = [
  {
    labelKey: 'commandCenter.quickActions.products',
    href: '/app/products',
    icon: Package,
    testId: 'qa-products',
  },
  {
    labelKey: 'commandCenter.quickActions.contractPricing',
    href: '/app/contract-pricing',
    icon: Percent,
    testId: 'qa-pricing',
  },
  {
    labelKey: 'commandCenter.quickActions.lowStock',
    href: '/app/inventory',
    icon: Warehouse,
    testId: 'qa-inventory',
  },
] as const

const FINANCE_QUICK_ACTION_KEYS = [
  {
    labelKey: 'commandCenter.quickActions.invoices',
    href: '/app/invoices',
    icon: FileText,
    testId: 'qa-invoices',
  },
  {
    labelKey: 'commandCenter.quickActions.restaurants',
    href: '/app/restaurants',
    icon: Users,
    testId: 'qa-restaurants',
  },
] as const

const QUICK_ACTION_KEY_SETS = {
  ops: OPS_QUICK_ACTION_KEYS,
  sales: SALES_QUICK_ACTION_KEYS,
  fulfillment: FULFILLMENT_QUICK_ACTION_KEYS,
  catalog: CATALOG_QUICK_ACTION_KEYS,
  finance: FINANCE_QUICK_ACTION_KEYS,
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
  const { t } = useTranslation('supplierOps')

  useEffect(() => {
    void ensureNamespace('supplierOps')
  }, [])

  const { can } = usePermissions()
  const { persona } = useWorkspaceRole()
  const hubMode = persona.commandCenterMode ?? 'full'
  const layout = getCommandCenterLayout(hubMode, can)
  const hubTitle = persona.overviewNav?.label ?? t('commandCenter.title')
  const hubDescription = useMemo(() => {
    if (hubMode === 'sales') return t('commandCenter.descriptions.sales')
    if (hubMode === 'fulfillment') return t('commandCenter.descriptions.fulfillment')
    if (hubMode === 'catalog') return t('commandCenter.descriptions.catalog')
    if (hubMode === 'finance') return t('commandCenter.descriptions.finance')
    if (persona.readOnly) return t('commandCenter.descriptions.readOnly')
    return t('commandCenter.descriptions.full')
  }, [hubMode, persona.readOnly, t])
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
        toast.error(t('commandCenter.toasts.unexpectedSent'))
        return
      }
      setReminderDraft({
        id: draft.id,
        subject: draft.subject,
        body: draft.body,
        status: draft.status,
        autoSent: false,
      })
      toast.success(t('commandCenter.toasts.draftSaved'))
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('commandCenter.toasts.draftFailed'))
    }
  }

  const gateProps =
    hubMode === 'sales'
      ? { anyOf: ['PROMOTIONS_VIEW'] as const, title: t('commandCenter.gateTitle.sales') }
      : {
          anyOf: [
            'ORDERS_MANAGE',
            'INVOICES_VIEW',
            'CATALOG_EDIT',
            'FULFILLMENT_VIEW',
            'PROMOTIONS_MANAGE',
            'PROMOTIONS_VIEW',
          ] as const,
          title: t('commandCenter.gateTitle.default'),
        }
  const quickActions = useMemo(
    () =>
      QUICK_ACTION_KEY_SETS[layout.quickActions].map((action) => ({
        ...action,
        label: t(action.labelKey),
      })),
    [layout.quickActions, t]
  )

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
          <p className="font-bold text-[var(--text)]">{t('commandCenter.error.title')}</p>
          <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
            {(error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
              t('commandCenter.error.description')}
          </p>
          <Button onClick={() => refetch()} className="mt-4" data-testid="command-center-retry">
            {t('commandCenter.error.retry')}
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
            {t('commandCenter.readOnlyBanner', { role: persona.roleLabel })}
          </p>
        )}
        <PageHeader
          title={hubTitle}
          description={
            isFetching && !isLoading
              ? `${hubDescription} ${t('commandCenter.refreshing')}`
              : hubDescription
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
                  {t('commandCenter.analyticsDashboard')}
                </Link>
              </Button>
            ) : undefined
          }
        />

        <nav
          className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-2.5 sm:mx-0 sm:flex-wrap"
          aria-label={t('commandCenter.quickActionsAria')}
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
                  label={t('commandCenter.kpis.ordersToPrepare')}
                  value={kpis?.ordersToPrepareToday ?? 0}
                  icon={Package}
                  href="/app/orders"
                />
                <KpiCard
                  testId="kpi-deliveries-pending"
                  label={t('commandCenter.kpis.deliveriesPending')}
                  value={kpis?.deliveriesPendingToday ?? 0}
                  icon={Truck}
                  href="/app/fulfillment"
                  extra={
                    previews?.deliveryGpsSummary ? (
                      <div
                        data-testid="delivery-gps-summary"
                        className="mt-1 border-t border-[var(--app-border)] pt-2 text-xs"
                      >
                        <p className="mb-1.5 font-semibold text-[var(--text-muted)]">
                          {t('commandCenter.kpis.gpsToday')}
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--text)]">
                          <span>
                            <span className="font-bold text-[var(--mint)]">
                              {previews.deliveryGpsSummary.live ?? 0}
                            </span>{' '}
                            {t('commandCenter.kpis.live')}
                          </span>
                          <span>
                            <span className="font-bold text-amber-600">
                              {previews.deliveryGpsSummary.stale ?? 0}
                            </span>{' '}
                            {t('commandCenter.kpis.stale')}
                          </span>
                          <span>
                            <span className="font-bold">
                              {previews.deliveryGpsSummary.noGps ?? 0}
                            </span>{' '}
                            {t('commandCenter.kpis.noGps')}
                          </span>
                          <span>
                            <span className="font-bold text-[var(--red)]">
                              {previews.deliveryGpsSummary.failed ?? 0}
                            </span>{' '}
                            {t('commandCenter.kpis.failed')}
                          </span>
                        </div>
                        <Link
                          to="/app/fulfillment?tab=tracking"
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-[var(--brand-mid)] hover:underline"
                        >
                          {t('commandCenter.kpis.openTracking')}
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
                label={t('commandCenter.kpis.unpaidBalance')}
                value={formatCurrency(kpis?.unpaidBalance ?? 0)}
                icon={DollarSign}
                href="/app/invoices"
              />
            )}
            {layout.showSalesKpi && (
              <KpiCard
                testId="kpi-reorder-due"
                label={t('commandCenter.kpis.reorderDue')}
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
              {t('commandCenter.priorities.title')}
            </h2>
            {(data?.todaysPriorities || []).length === 0 ? (
              <div data-testid="priorities-empty">
                <EmptyState
                  title={t('commandCenter.priorities.emptyTitle')}
                  description={t('commandCenter.priorities.emptyDescription')}
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
              <PreviewCard
                title={t('commandCenter.previews.deliveries')}
                testId="preview-deliveries"
                href="/app/fulfillment"
                viewAllLabel={t('commandCenter.previews.viewAll')}
              >
                {(previews?.deliveries || []).length === 0 ? (
                  <EmptyInline>{t('commandCenter.previews.noActiveDeliveries')}</EmptyInline>
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
              <PreviewCard
                title={t('commandCenter.previews.receivables')}
                testId="preview-receivables"
                href="/app/invoices"
                viewAllLabel={t('commandCenter.previews.viewAll')}
              >
                <div className="text-[13px] font-bold">
                  {t('commandCenter.previews.unpaid', {
                    amount: formatCurrency(previews?.receivables?.unpaidTotal ?? 0),
                  })}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {t('commandCenter.previews.overdue', {
                    amount: formatCurrency(previews?.receivables?.overdueTotal ?? 0),
                  })}
                </div>
                {(previews?.receivables?.topDebtors || []).length === 0 ? (
                  <EmptyInline className="mt-2">
                    {t('commandCenter.previews.noOpenBalances')}
                  </EmptyInline>
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
              <PreviewCard
                title={t('commandCenter.previews.lowStock')}
                testId="preview-low-stock"
                href="/app/inventory"
                viewAllLabel={t('commandCenter.previews.viewAll')}
              >
                {(previews?.lowStock || []).length === 0 ? (
                  <EmptyInline>{t('commandCenter.previews.stockHealthy')}</EmptyInline>
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
                        {t('commandCenter.previews.left', { name: p.name, qty: p.availableQty })}
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
              {t('commandCenter.reorder.title')}
              {(kpis?.customersDueReorder ?? 0) > 0 && (
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  {t('commandCenter.reorder.due', { count: kpis!.customersDueReorder })}
                </span>
              )}
            </h2>
            {(previews?.reorderOpportunities || []).length === 0 ? (
              <div data-testid="reorder-empty">
                <EmptyState
                  title={t('commandCenter.reorder.emptyTitle')}
                  description={t('commandCenter.reorder.emptyDescription')}
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
                        <li>
                          {t('commandCenter.reorder.usuallyOrdersEvery', {
                            days: c.avgDaysBetween ?? '—',
                          })}
                        </li>
                        <li>
                          {t('commandCenter.reorder.lastOrder', {
                            date: formatOrderDate(c.lastOrderAt),
                            days: c.daysSinceLastOrder ?? '—',
                          })}
                        </li>
                        {c.suggestedProducts && c.suggestedProducts.length > 0 && (
                          <li>
                            {t('commandCenter.reorder.oftenOrders', {
                              products: c.suggestedProducts
                                .slice(0, 3)
                                .map((p) => p.productName)
                                .join(', '),
                            })}
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
                            {t('commandCenter.reorder.reviewReminder')}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                          <Link to={`/app/restaurants/${c.restaurantId}`}>
                            {t('commandCenter.reorder.viewCustomer')}
                          </Link>
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
              {t('commandCenter.atRisk.title')}
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
                    {t('commandCenter.atRisk.item', {
                      restaurant: r.restaurantName,
                      label: r.label,
                      day: r.dayName,
                    })}
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
              {t('commandCenter.boostedDeals.title')}
            </h2>
            {previews?.boostedDeals ? (
              <>
                <p className="text-[13px] m-0">
                  {t('commandCenter.boostedDeals.summary', {
                    active: previews.boostedDeals.activeBoostedDeals,
                    views: previews.boostedDeals.totalViews,
                    clicks: previews.boostedDeals.totalClicks,
                  })}
                </p>
                <Link
                  to="/app/promotions"
                  className="text-xs text-[var(--brand)] font-semibold mt-2 inline-block"
                >
                  {t('commandCenter.boostedDeals.manageDeals')}
                </Link>
              </>
            ) : (
              <EmptyInline>{t('commandCenter.boostedDeals.empty')}</EmptyInline>
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
            {t('commandCenter.alerts.disputes', { count: kpis!.openDisputes })}
          </Link>
        )}
        {layout.showFulfillmentAlerts && (kpis?.fulfillmentAlerts ?? 0) > 0 && (
          <Link
            to="/app/fulfillment"
            data-testid="preview-fulfillment-alerts"
            className="text-[13px] flex items-center gap-2 text-amber-700 font-semibold"
          >
            <Warehouse size={14} />
            {t('commandCenter.alerts.fulfillment', { count: kpis!.fulfillmentAlerts })}
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
  viewAllLabel,
}: {
  title: string
  children: ReactNode
  href: string
  testId: string
  viewAllLabel: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[13px] font-extrabold">{title}</span>
        <Link to={href} className="text-[11px] text-[var(--brand)] font-semibold no-underline">
          {viewAllLabel}
        </Link>
      </div>
      {children}
    </div>
  )
}

function EmptyInline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-[var(--text-muted)] m-0 ${className}`}>{children}</p>
}
