import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useGetSupplierRunSheetQuery,
  useSendInvoiceReminderMutation,
  useRemindOverdueInvoicesMutation,
} from '../services/api'
import { PageShell } from '../components/ui/page-shell'
import { PageHeader } from '../components/ui/page-header'
import { RequirePermission } from '../components/RequirePermission'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { formatCurrency } from '../utils/format'
import { toast } from 'sonner'
import { Printer, Truck, Package, DollarSign, Users, AlertTriangle } from 'lucide-react'

export function SupplierRunSheetPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { data, isLoading, isError, refetch } = useGetSupplierRunSheetQuery({ date })
  const [sendReminder, { isLoading: sendingOne }] = useSendInvoiceReminderMutation()
  const [remindOverdue, { isLoading: sendingBulk }] = useRemindOverdueInvoicesMutation()

  const sheet = data

  const handleBulkRemind = async () => {
    try {
      const result = await remindOverdue().unwrap()
      toast.success(`Sent ${result?.sent ?? 0} reminder(s)`)
      refetch()
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Could not send reminders')
    }
  }

  const handleRemindInvoice = async (invoiceId: string) => {
    try {
      await sendReminder({ invoiceId }).unwrap()
      toast.success('Reminder sent')
      refetch()
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Could not send reminder')
    }
  }

  return (
    <RequirePermission
      anyOf={['ORDERS_MANAGE', 'FULFILLMENT_VIEW', 'INVOICES_VIEW']}
      title="run sheet"
    >
      <PageShell maxWidth="wide" className="print:max-w-none" data-testid="supplier-run-sheet-page">
        <PageHeader
          title="Today's run sheet"
          description="One view for picking, deliveries, collections, and follow-ups."
          actions={
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-auto"
                aria-label="Run sheet date"
              />
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" aria-hidden />
                Print
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : isError || !sheet ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">Could not load run sheet.</p>
            <Button className="mt-3" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                icon={Package}
                label="Orders to prepare"
                value={sheet.summary.kpis.ordersToPrepareToday}
                href="/app/orders"
              />
              <KpiTile
                icon={Truck}
                label="Deliveries pending"
                value={sheet.summary.kpis.deliveriesPendingToday}
                href="/app/fulfillment"
              />
              <KpiTile
                icon={DollarSign}
                label="Overdue AR"
                value={formatCurrency(sheet.summary.kpis.overdueBalance)}
                href="/app/invoices"
              />
              <KpiTile
                icon={Users}
                label="Reorder due"
                value={sheet.summary.kpis.customersDueReorder}
                href="/app/command-center#reorder"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--app-border)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm">
                    Orders to pick ({sheet.ordersToPick.count})
                  </h2>
                  <Link
                    to="/app/fulfillment"
                    className="text-xs text-[var(--brand)] font-medium print:hidden"
                  >
                    Pick lists →
                  </Link>
                </div>
                {sheet.ordersToPick.orders.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Nothing queued for picking.</p>
                ) : (
                  <ul className="divide-y divide-[var(--app-border)] text-sm">
                    {sheet.ordersToPick.orders.slice(0, 12).map((o) => (
                      <li key={o.orderId} className="py-2 flex justify-between gap-2">
                        <span>
                          {o.restaurantName} · {o.orderStatus}
                        </span>
                        <Link
                          to={`/app/orders/${o.orderId}`}
                          className="text-[var(--brand)] text-xs shrink-0 print:hidden"
                        >
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-[var(--app-border)] p-4 space-y-3">
                <h2 className="font-semibold text-sm">
                  Deliveries ({sheet.deliveries?.routeSummary?.length ?? 0} areas)
                </h2>
                {(sheet.deliveries?.routeSummary ?? []).length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No deliveries scheduled.</p>
                ) : (
                  <ul className="divide-y divide-[var(--app-border)] text-sm">
                    {(sheet.deliveries?.routeSummary ?? []).slice(0, 8).map((g) => (
                      <li key={g.area ?? 'unknown'} className="py-2 flex justify-between">
                        <span>{g.area || 'Unassigned area'}</span>
                        <span className="text-[var(--text-muted)]">{g.orderCount ?? 0} stops</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--app-border)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" aria-hidden />
                  Receivables due ({sheet.receivablesDueToday.summary.count}) ·{' '}
                  {formatCurrency(sheet.receivablesDueToday.summary.totalBalanceDue)}
                </h2>
                <div className="flex gap-2 print:hidden">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sendingBulk || sheet.receivablesDueToday.summary.overdueCount === 0}
                    onClick={handleBulkRemind}
                  >
                    Remind overdue
                  </Button>
                  <Link to="/app/invoices">
                    <Button size="sm" variant="outline">
                      Invoices
                    </Button>
                  </Link>
                </div>
              </div>
              {sheet.receivablesDueToday.invoices.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No invoices due today.</p>
              ) : (
                <ul className="divide-y divide-[var(--app-border)] text-sm">
                  {sheet.receivablesDueToday.invoices.slice(0, 10).map((inv) => (
                    <li
                      key={inv.id}
                      className="py-2 flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {inv.restaurantName} · {inv.invoiceNumber || inv.id.slice(0, 8)} ·{' '}
                        {formatCurrency(inv.balanceDue)}
                        {inv.isOverdue ? ' (overdue)' : ''}
                      </span>
                      <div className="flex gap-2 print:hidden">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={sendingOne}
                          onClick={() => handleRemindInvoice(inv.id)}
                        >
                          Remind
                        </Button>
                        <Link to="/app/invoices">
                          <Button size="sm" variant="ghost">
                            Pay
                          </Button>
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(sheet.shortages?.preview?.length ?? 0) > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2">
                <h2 className="font-semibold text-sm flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  Shortages & substitutions ({sheet.shortages.count})
                </h2>
                <ul className="text-sm text-amber-950 divide-y divide-amber-200/60">
                  {sheet.shortages.preview.slice(0, 5).map((s) => (
                    <li key={s.id} className="py-1.5">
                      {s.restaurantName} — {s.productName} ({s.issueType})
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sheet.reorderLeads.length > 0 && (
              <section className="rounded-xl border border-[var(--app-border)] p-4 space-y-2">
                <h2 className="font-semibold text-sm">Reorder follow-ups</h2>
                <ul className="text-sm divide-y divide-[var(--app-border)]">
                  {sheet.reorderLeads.map((lead) => (
                    <li key={lead.restaurantId} className="py-2 flex justify-between">
                      <span>{lead.restaurantName}</span>
                      <span className="text-[var(--text-muted)]">
                        {lead.daysSinceLastOrder ?? '—'}d since last order
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </PageShell>
    </RequirePermission>
  )
}

function KpiTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Package
  label: string
  value: string | number
  href: string
}) {
  return (
    <Link
      to={href}
      className="rounded-xl border border-[var(--app-border)] p-4 hover:border-[var(--brand)]/40 transition-colors print:pointer-events-none"
    >
      <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-[var(--text)]">{value}</div>
    </Link>
  )
}
