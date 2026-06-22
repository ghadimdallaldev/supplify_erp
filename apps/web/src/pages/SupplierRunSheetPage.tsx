import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ensureNamespace } from '../i18n'
import {
  useGetSupplierRunSheetQuery,
  useSendInvoiceReminderMutation,
  useRemindOverdueInvoicesMutation,
} from '../services/api'
import { PageShell } from '../components/ui/page-shell'
import { PageHeader } from '../components/ui/page-header'
import { RequirePermission } from '../components/RequirePermission'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { StatusBadge } from '../components/ui/status-badge'
import { formatCurrency } from '../utils/format'
import { cn } from '../lib/utils'
import { toast } from 'sonner'
import {
  Printer,
  Truck,
  Package,
  DollarSign,
  Users,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
  CalendarDays,
  RotateCcw,
} from 'lucide-react'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatRunSheetDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShortTime(iso: string | undefined) {
  if (!iso) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function SupplierRunSheetPage() {
  const { t } = useTranslation('supplierOps')

  useEffect(() => {
    void ensureNamespace('supplierOps')
  }, [])

  const [date, setDate] = useState(todayIsoDate)
  const queryDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
  const isToday = queryDate === todayIsoDate()
  const {
    data: sheet,
    isLoading,
    isError,
    refetch,
  } = useGetSupplierRunSheetQuery(queryDate ? { date: queryDate } : undefined)
  const [sendReminder, { isLoading: sendingOne }] = useSendInvoiceReminderMutation()
  const [remindOverdue, { isLoading: sendingBulk }] = useRemindOverdueInvoicesMutation()

  const handleBulkRemind = async () => {
    try {
      const result = await remindOverdue().unwrap()
      toast.success(t('runSheet.toasts.bulkSent', { count: result?.sent ?? 0 }))
      refetch()
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('runSheet.toasts.bulkFailed'))
    }
  }

  const handleRemindInvoice = async (invoiceId: string) => {
    try {
      await sendReminder({ invoiceId }).unwrap()
      toast.success(t('runSheet.toasts.reminderSent'))
      refetch()
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('runSheet.toasts.reminderFailed'))
    }
  }

  const displayDate = sheet?.date ?? queryDate ?? todayIsoDate()
  const formattedDate = formatRunSheetDate(displayDate)

  return (
    <RequirePermission
      anyOf={['ORDERS_MANAGE', 'FULFILLMENT_VIEW', 'INVOICES_VIEW']}
      title={t('runSheet.gateTitle')}
    >
      <PageShell maxWidth="wide" className="print:max-w-none" data-testid="supplier-run-sheet-page">
        <PageHeader
          title={t('runSheet.title')}
          description={t('runSheet.description')}
          actions={
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {!isToday && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDate(todayIsoDate())}
                  className="text-[var(--text-muted)]"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
                  {t('runSheet.today')}
                </Button>
              )}
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || todayIsoDate())}
                className="h-9 w-auto"
                aria-label={t('runSheet.dateAria')}
              />
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1.5" aria-hidden />
                {t('runSheet.print')}
              </Button>
            </div>
          }
        />

        <div
          className={cn(
            'mb-6 flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3.5 py-2.5',
            'print:mb-4 print:border-0 print:bg-transparent print:px-0 print:py-0'
          )}
        >
          <CalendarDays
            className="h-4 w-4 shrink-0 text-[var(--brand-mid)] print:hidden"
            aria-hidden
          />
          <p
            className="text-sm font-semibold text-[var(--text)]"
            data-testid="run-sheet-print-date"
          >
            {formattedDate}
            {!isToday && sheet && (
              <span className="ml-2 font-normal text-[var(--text-muted)] print:hidden">
                {t('runSheet.viewingOtherDay')}
              </span>
            )}
          </p>
          <Link
            to="/app/command-center"
            className="ml-auto text-xs font-medium text-[var(--brand)] no-underline hover:underline print:hidden"
          >
            {t('runSheet.commandCenter')}
          </Link>
        </div>

        {isLoading ? (
          <RunSheetLoadingSkeleton />
        ) : isError || !sheet ? (
          <div
            className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-bg-subtle)] p-8 text-center"
            data-testid="run-sheet-error"
            role="alert"
          >
            <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-[var(--brand-mid)]" aria-hidden />
            <p className="text-sm text-[var(--text-muted)]">{t('runSheet.error')}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => refetch()}>
              {t('runSheet.retry')}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 print:space-y-4">
            {(sheet.summary.todaysPriorities?.length ?? 0) > 0 && (
              <section
                className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5 print:break-inside-avoid"
                data-testid="run-sheet-priorities"
              >
                <SectionHeading icon={ClipboardList} title={t('runSheet.priorities')} />
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {sheet.summary.todaysPriorities.map((item) => (
                    <li key={item.id}>
                      {item.href ? (
                        <Link
                          to={item.href}
                          data-testid={`run-sheet-priority-${item.id}`}
                          className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] font-semibold text-[var(--text)] no-underline transition-colors hover:border-[var(--brand-light)] hover:bg-[var(--brand-ultra)]/30 print:pointer-events-none"
                        >
                          {item.title}
                          <ArrowRight
                            size={14}
                            className="text-[var(--text-muted)] shrink-0 print:hidden"
                            aria-hidden
                          />
                        </Link>
                      ) : (
                        <div className="rounded-[10px] border border-[var(--app-border)] px-3 py-2.5 text-[13px] font-semibold text-[var(--text)]">
                          {item.title}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:break-inside-avoid">
              <KpiTile
                icon={Package}
                label={t('runSheet.kpis.ordersToPrepare')}
                value={sheet.summary.kpis.ordersToPrepareToday}
                href="/app/orders"
                testId="run-sheet-kpi-orders"
              />
              <KpiTile
                icon={Truck}
                label={t('runSheet.kpis.deliveriesPending')}
                value={sheet.summary.kpis.deliveriesPendingToday}
                href="/app/fulfillment"
                testId="run-sheet-kpi-deliveries"
              />
              <KpiTile
                icon={DollarSign}
                label={t('runSheet.kpis.overdueAr')}
                value={formatCurrency(sheet.summary.kpis.overdueBalance)}
                href="/app/invoices"
                testId="run-sheet-kpi-ar"
                highlight={sheet.summary.kpis.overdueBalance > 0}
              />
              <KpiTile
                icon={Users}
                label={t('runSheet.kpis.reorderDue')}
                value={sheet.summary.kpis.customersDueReorder}
                href="/app/command-center#reorder"
                testId="run-sheet-kpi-reorder"
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              <RunSheetPanel testId="run-sheet-pick-queue" className="print:break-inside-avoid">
                <PanelHeader
                  title={t('runSheet.pickQueue.title', { count: sheet.ordersToPick.count })}
                  action={
                    <Link
                      to="/app/fulfillment"
                      className="text-xs font-medium text-[var(--brand)] no-underline hover:underline print:hidden"
                    >
                      {t('runSheet.pickQueue.pickLists')}
                    </Link>
                  }
                />
                {sheet.ordersToPick.orders.length === 0 ? (
                  <InlineEmpty message={t('runSheet.pickQueue.empty')} icon={Package} />
                ) : (
                  <ul className="divide-y divide-[var(--app-border)]">
                    {sheet.ordersToPick.orders.slice(0, 12).map((o) => {
                      const scheduled = formatShortTime(o.scheduledAt)
                      return (
                        <li key={o.orderId}>
                          <RunSheetRow
                            primary={o.restaurantName}
                            secondary={
                              <>
                                <StatusBadge status={o.orderStatus} />
                                {o.pickListStatus ? (
                                  <StatusBadge status={o.pickListStatus} />
                                ) : null}
                                {scheduled ? (
                                  <span className="text-[var(--text-muted)]">{scheduled}</span>
                                ) : null}
                              </>
                            }
                            action={
                              <Link
                                to={`/app/orders/${o.orderId}`}
                                className="text-xs font-medium text-[var(--brand)] no-underline hover:underline print:hidden"
                              >
                                {t('runSheet.pickQueue.open')}
                              </Link>
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </RunSheetPanel>

              <RunSheetPanel testId="run-sheet-deliveries" className="print:break-inside-avoid">
                <PanelHeader
                  title={t('runSheet.deliveries.title', {
                    count: sheet.deliveries?.routeSummary?.length ?? 0,
                  })}
                  action={
                    <Link
                      to="/app/fulfillment"
                      className="text-xs font-medium text-[var(--brand)] no-underline hover:underline print:hidden"
                    >
                      {t('runSheet.deliveries.fulfillment')}
                    </Link>
                  }
                />
                {(sheet.deliveries?.routeSummary ?? []).length === 0 ? (
                  <InlineEmpty message={t('runSheet.deliveries.empty')} icon={Truck} />
                ) : (
                  <ul className="divide-y divide-[var(--app-border)]">
                    {(sheet.deliveries?.routeSummary ?? []).slice(0, 8).map((g, index) => (
                      <li key={`${g.area ?? 'unknown'}-${index}`}>
                        <RunSheetRow
                          primary={g.area || t('runSheet.deliveries.unassignedArea')}
                          secondary={
                            <>
                              <span>
                                {t('runSheet.deliveries.stops', { count: g.orderCount ?? 0 })}
                              </span>
                              {(g.pending ?? 0) > 0 && (
                                <span className="text-amber-700">
                                  {t('runSheet.deliveries.pending', { count: g.pending })}
                                </span>
                              )}
                              {(g.outForDelivery ?? 0) > 0 && (
                                <span className="text-[var(--brand)]">
                                  {t('runSheet.deliveries.enRoute', { count: g.outForDelivery })}
                                </span>
                              )}
                            </>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </RunSheetPanel>
            </section>

            <RunSheetPanel testId="run-sheet-receivables" className="print:break-inside-avoid">
              <PanelHeader
                title={
                  <>
                    {t('runSheet.receivables.title', {
                      count: sheet.receivablesDueToday.summary.count,
                    })}
                    <span className="font-normal text-[var(--text-muted)]">
                      {' '}
                      · {formatCurrency(sheet.receivablesDueToday.summary.totalBalanceDue)}
                    </span>
                  </>
                }
                icon={DollarSign}
                action={
                  <div className="flex gap-2 print:hidden">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingBulk || sheet.receivablesDueToday.summary.overdueCount === 0}
                      onClick={handleBulkRemind}
                    >
                      {t('runSheet.receivables.remindOverdue')}
                    </Button>
                    <Link to="/app/invoices">
                      <Button size="sm" variant="outline">
                        {t('runSheet.receivables.invoices')}
                      </Button>
                    </Link>
                  </div>
                }
              />
              {sheet.receivablesDueToday.invoices.length === 0 ? (
                <EmptyState
                  title={t('runSheet.receivables.emptyTitle')}
                  description={t('runSheet.receivables.emptyDescription')}
                  icon={<DollarSign className="h-5 w-5" />}
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-[var(--app-border)]">
                  {sheet.receivablesDueToday.invoices.slice(0, 10).map((inv) => (
                    <li key={inv.id}>
                      <RunSheetRow
                        primary={
                          <>
                            {inv.restaurantName}
                            <span className="font-normal text-[var(--text-muted)]">
                              · {inv.invoiceNumber || inv.id.slice(0, 8)}
                            </span>
                          </>
                        }
                        secondary={
                          <>
                            <span className="font-semibold text-[var(--text)]">
                              {formatCurrency(inv.balanceDue)}
                            </span>
                            {inv.isOverdue ? <StatusBadge status="OVERDUE" /> : null}
                          </>
                        }
                        action={
                          <div className="flex gap-1 print:hidden">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              disabled={sendingOne}
                              onClick={() => handleRemindInvoice(inv.id)}
                            >
                              {t('runSheet.receivables.remind')}
                            </Button>
                            <Link to="/app/invoices">
                              <Button size="sm" variant="ghost" className="h-8 px-2">
                                {t('runSheet.receivables.view')}
                              </Button>
                            </Link>
                          </div>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </RunSheetPanel>

            {(sheet.shortages?.preview?.length ?? 0) > 0 && (
              <section
                className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 space-y-2 print:break-inside-avoid"
                data-testid="run-sheet-shortages"
              >
                <SectionHeading
                  icon={AlertTriangle}
                  title={t('runSheet.shortages.title', { count: sheet.shortages.count })}
                  className="text-amber-950"
                  iconClassName="text-amber-700"
                />
                <ul className="divide-y divide-amber-200/60 text-sm text-amber-950">
                  {sheet.shortages.preview.slice(0, 5).map((s) => (
                    <li key={s.id} className="py-2 first:pt-0">
                      <span className="font-medium">{s.restaurantName}</span>
                      <span className="text-amber-900/80">
                        {' '}
                        — {s.productName} <span className="text-amber-800/70">({s.issueType})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(sheet.reorderLeads?.length ?? 0) > 0 && (
              <RunSheetPanel
                title={t('runSheet.reorderFollowUps')}
                testId="run-sheet-reorder-leads"
                className="print:break-inside-avoid"
              >
                <ul className="divide-y divide-[var(--app-border)]">
                  {sheet.reorderLeads.map((lead) => (
                    <li key={lead.restaurantId}>
                      <RunSheetRow
                        primary={lead.restaurantName}
                        secondary={
                          <span>
                            {t('runSheet.daysSinceLastOrder', {
                              days: lead.daysSinceLastOrder ?? '—',
                            })}
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </RunSheetPanel>
            )}
          </div>
        )}
      </PageShell>
    </RequirePermission>
  )
}

function RunSheetLoadingSkeleton() {
  return (
    <div className="space-y-6" data-testid="run-sheet-loading" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}

function SectionHeading({
  icon: Icon,
  title,
  className,
  iconClassName,
}: {
  icon: typeof ClipboardList
  title: string
  className?: string
  iconClassName?: string
}) {
  return (
    <h2
      className={cn(
        'mb-2.5 flex items-center gap-2 text-[15px] font-extrabold text-[var(--text)]',
        className
      )}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', iconClassName ?? 'text-[var(--brand-mid)]')}
        aria-hidden
      />
      {title}
    </h2>
  )
}

function PanelHeader({
  title,
  icon: Icon,
  action,
}: {
  title: ReactNode
  icon?: typeof DollarSign
  action?: ReactNode
}) {
  return (
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
      {Icon ? (
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[var(--text)]">
          <Icon className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
          {title}
        </h2>
      ) : (
        <h2 className="text-[15px] font-extrabold text-[var(--text)]">{title}</h2>
      )}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function RunSheetPanel({
  title,
  children,
  testId,
  className,
}: {
  title?: string
  children: ReactNode
  testId?: string
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5',
        className
      )}
      data-testid={testId}
    >
      {title ? <SectionHeading icon={ClipboardList} title={title} /> : null}
      {children}
    </section>
  )
}

function RunSheetRow({
  primary,
  secondary,
  action,
}: {
  primary: ReactNode
  secondary?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[var(--text)]">{primary}</div>
        {secondary ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
            {secondary}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function InlineEmpty({ message, icon: Icon }: { message: string; icon: typeof Package }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-bg-subtle)] px-3 py-4 text-sm text-[var(--text-muted)]">
      <Icon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      {message}
    </p>
  )
}

function KpiTile({
  icon: Icon,
  label,
  value,
  href,
  testId,
  highlight,
}: {
  icon: typeof Package
  label: string
  value: string | number
  href: string
  testId: string
  highlight?: boolean
}) {
  return (
    <Link
      to={href}
      data-testid={testId}
      className={cn(
        'group flex min-h-[88px] flex-col gap-2 rounded-xl border bg-[var(--surface)] p-3.5 no-underline transition-all',
        'hover:border-[var(--brand-light)] hover:shadow-sm print:pointer-events-none',
        highlight ? 'border-amber-200/80 bg-amber-50/30' : 'border-[var(--app-border)]'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
        <Icon
          size={16}
          className={cn(
            'shrink-0 transition-colors',
            highlight ? 'text-amber-700' : 'text-[var(--brand)] group-hover:text-[var(--brand-mid)]'
          )}
          aria-hidden
        />
      </div>
      <span
        className={cn(
          'text-xl font-extrabold',
          highlight ? 'text-amber-950' : 'text-[var(--text)]'
        )}
      >
        {value}
      </span>
    </Link>
  )
}
