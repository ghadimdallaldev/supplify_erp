import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  useGetSupplierCommandCenterQuery,
  useCreateReorderReminderDraftMutation,
} from '../services/api'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '../utils/format'
import { formatDeliveryStatus } from '../lib/deliveryStatusLabels'
import {
  ReorderReminderReviewDialog,
  type ReminderDraft,
} from '../components/supplier/ReorderReminderReviewDialog'
import { RequirePermission } from '../components/RequirePermission'

const QUICK_ACTIONS = [
  { label: 'Deliveries', href: '/app/fulfillment', icon: Truck, testId: 'qa-deliveries' },
  { label: 'Receivables', href: '/app/invoices', icon: DollarSign, testId: 'qa-invoices' },
  { label: 'Reorder', href: '#reorder', icon: Users, testId: 'qa-reorder' },
  { label: 'Low stock', href: '/app/inventory', icon: Warehouse, testId: 'qa-inventory' },
  { label: 'Disputes', href: '/app/disputes', icon: Scale, testId: 'qa-disputes' },
  { label: 'Deals', href: '/app/deals', icon: Tag, testId: 'qa-deals' },
]

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  testId,
}: {
  label: string
  value: string | number
  icon: typeof Package
  href?: string
  testId: string
}) {
  const inner = (
    <div
      data-testid={testId}
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5 flex flex-col gap-2 min-h-[88px]"
    >
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
        <Icon size={16} className="text-[var(--brand)] shrink-0" />
      </div>
      <span className="text-xl font-extrabold text-[var(--text)]">{value}</span>
    </div>
  )
  if (href) {
    return (
      <Link to={href} className="no-underline hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    )
  }
  return inner
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
  const { data, isLoading, isError, error, refetch, isFetching } =
    useGetSupplierCommandCenterQuery()
  const [createDraft, { isLoading: drafting }] = useCreateReorderReminderDraftMutation()
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null)

  const kpis = data?.kpis
  const previews = data?.previews

  const handleDraftReminder = async (restaurantId: string) => {
    try {
      const result = await createDraft(restaurantId).unwrap()
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

  const gateProps = {
    anyOf: [
      'ORDERS_MANAGE',
      'INVOICES_VIEW',
      'CATALOG_EDIT',
      'FULFILLMENT_VIEW',
      'PROMOTIONS_MANAGE',
    ] as const,
    title: 'command center',
  }

  if (isLoading) {
    return (
      <RequirePermission {...gateProps}>
        <div
          data-testid="supplier-command-center-page"
          className="flex flex-col gap-4"
          aria-busy="true"
        >
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
        </div>
      </RequirePermission>
    )
  }

  if (isError) {
    return (
      <RequirePermission {...gateProps}>
        <div
          data-testid="supplier-command-center-error"
          className="text-center pt-12 px-4"
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
      <div data-testid="supplier-command-center-page" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-black m-0 text-[var(--text)]">Command Center</h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              Today&apos;s priorities — action items, not just charts
              {isFetching && !isLoading ? (
                <span className="ml-2 text-[var(--brand)]">Refreshing…</span>
              ) : null}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild data-testid="link-analytics-dashboard">
            <Link to="/app/dashboard">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Analytics dashboard
            </Link>
          </Button>
        </div>

        <nav
          className="flex flex-wrap gap-2"
          aria-label="Quick actions"
          data-testid="command-center-quick-actions"
        >
          {QUICK_ACTIONS.map(({ label, href, icon: Icon, testId }) => (
            <Link
              key={testId}
              to={href}
              data-testid={testId}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] no-underline hover:border-[var(--brand-light)]"
            >
              <Icon size={14} className="text-[var(--brand)]" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="dashboard-kpi-grid">
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
          />
          <KpiCard
            testId="kpi-unpaid-balance"
            label="Unpaid balance"
            value={formatCurrency(kpis?.unpaidBalance ?? 0)}
            icon={DollarSign}
            href="/app/invoices"
          />
          <KpiCard
            testId="kpi-reorder-due"
            label="Due to reorder"
            value={kpis?.customersDueReorder ?? 0}
            icon={Users}
            href="#reorder"
          />
        </div>

        <section data-testid="todays-priorities">
          <h2 className="text-[15px] font-extrabold mb-2.5 flex items-center gap-2">
            <ClipboardList size={16} />
            Today&apos;s priorities
          </h2>
          {(data?.todaysPriorities || []).length === 0 ? (
            <EmptyBlock testId="priorities-empty">
              No urgent items — you&apos;re caught up for now.
            </EmptyBlock>
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

        <div className="dashboard-content-grid">
          <PreviewCard title="Deliveries" testId="preview-deliveries" href="/app/fulfillment">
            {(previews?.deliveries || []).length === 0 ? (
              <EmptyInline>No active deliveries in preview.</EmptyInline>
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
                .map((d: { restaurantId: string; restaurantName: string; balanceDue: number }) => (
                  <Link
                    key={d.restaurantId}
                    to={`/app/restaurants/${d.restaurantId}`}
                    className="block text-xs mt-1.5 text-[var(--text)] hover:text-[var(--brand)]"
                    data-testid={`debtor-link-${d.restaurantId}`}
                  >
                    {d.restaurantName}: {formatCurrency(d.balanceDue)}
                  </Link>
                ))
            )}
          </PreviewCard>

          <PreviewCard title="Low stock" testId="preview-low-stock" href="/app/inventory">
            {(previews?.lowStock || []).length === 0 ? (
              <EmptyInline>Stock levels look healthy.</EmptyInline>
            ) : (
              previews!.lowStock.map(
                (p: { productId: string; name: string; availableQty: number; sku?: string }) => (
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
        </div>

        <section id="reorder" data-testid="reorder-opportunities">
          <h2 className="text-[15px] font-extrabold mb-2.5 flex items-center gap-2">
            <Users size={16} />
            Reorder opportunities
            {(kpis?.customersDueReorder ?? 0) > 0 && (
              <span className="text-xs font-normal text-[var(--text-muted)]">
                ({kpis!.customersDueReorder} due)
              </span>
            )}
          </h2>
          {(previews?.reorderOpportunities || []).length === 0 ? (
            <EmptyBlock testId="reorder-empty">
              No restaurants are past their usual reorder window right now.
            </EmptyBlock>
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
                        Last order: {formatOrderDate(c.lastOrderAt)} ({c.daysSinceLastOrder ?? '—'}{' '}
                        days ago)
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
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        size="sm"
                        disabled={drafting}
                        data-testid={`reorder-draft-${c.restaurantId}`}
                        onClick={() => handleDraftReminder(c.restaurantId)}
                      >
                        Review reminder
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/app/restaurants/${c.restaurantId}`}>View customer</Link>
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

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
                {previews.boostedDeals.totalViews} impressions · {previews.boostedDeals.totalClicks}{' '}
                clicks
              </p>
              <Link
                to="/app/deals"
                className="text-xs text-[var(--brand)] font-semibold mt-2 inline-block"
              >
                Manage deals →
              </Link>
            </>
          ) : (
            <EmptyInline>No boosted deal activity in the last 30 days.</EmptyInline>
          )}
        </section>

        {(kpis?.openDisputes ?? 0) > 0 && (
          <Link
            to="/app/disputes"
            data-testid="preview-disputes"
            className="text-[13px] flex items-center gap-2 text-[var(--red)] font-semibold"
          >
            <Scale size={14} />
            {kpis!.openDisputes} dispute(s) need your response
          </Link>
        )}
        {(kpis?.fulfillmentAlerts ?? 0) > 0 && (
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
      </div>
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

function EmptyBlock({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p
      data-testid={testId}
      className="text-[13px] text-[var(--text-muted)] rounded-lg border border-dashed border-[var(--app-border)] px-3 py-4 m-0"
    >
      {children}
    </p>
  )
}

function EmptyInline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-[var(--text-muted)] m-0 ${className}`}>{children}</p>
}
