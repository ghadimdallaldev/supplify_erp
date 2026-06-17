import { Link } from 'react-router-dom'
import { useGetSupplierReceivablesQuery } from '../../services/api'
import {
  useSendInvoiceReminderMutation,
  useRemindOverdueInvoicesMutation,
} from '../../services/api/endpoints/finance'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import { formatCurrency } from '../../utils/format'
import { AlertTriangle, Bell } from 'lucide-react'

const AGING_LABELS: Record<string, string> = {
  current: 'Current',
  '0_7': '1–7 days overdue',
  '8_30': '8–30 days',
  '31_60': '31–60 days',
  '60_plus': '60+ days',
}

function statusBadge(status: string, isOverdue: boolean) {
  if (status === 'PARTIALLY_PAID')
    return { label: 'Partial', className: 'bg-amber-100 text-amber-800' }
  if (isOverdue || status === 'OVERDUE')
    return { label: 'Overdue', className: 'bg-red-100 text-red-800' }
  return { label: 'Unpaid', className: 'bg-slate-100 text-slate-700' }
}

export function SupplierReceivablesPanel() {
  const { data, isLoading, isError, refetch } = useGetSupplierReceivablesQuery()
  const [sendReminder, { isLoading: sendingReminder }] = useSendInvoiceReminderMutation()
  const [remindOverdue, { isLoading: remindingOverdue }] = useRemindOverdueInvoicesMutation()

  if (isLoading) {
    return (
      <div data-testid="supplier-receivables-loading" className="space-y-2 mb-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        data-testid="supplier-receivables-error"
        className="rounded-xl border border-[var(--app-border)] p-4 mb-4 text-center"
        role="alert"
      >
        <AlertTriangle className="h-5 w-5 mx-auto text-[var(--brand)] mb-2" />
        <p className="text-sm text-[var(--text-muted)]">Could not load receivables.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const summary = data?.summary
  const aging = data?.aging || {}
  const invoices = data?.invoices || []
  const topDebtors = data?.topDebtors || []
  const overdueTotal = summary?.overdueTotal ?? 0

  if (!summary?.unpaidCount) {
    return (
      <div
        data-testid="supplier-receivables-empty"
        className="rounded-xl border border-dashed border-[var(--app-border)] px-4 py-5 mb-4 text-sm text-[var(--text-muted)]"
      >
        No open receivables — all caught up on invoices.
      </div>
    )
  }

  const handleDebtorReminder = async (invoiceId: string | null | undefined) => {
    if (!invoiceId) return
    try {
      await sendReminder({ invoiceId }).unwrap()
    } catch {
      // mutation error surfaced by RTK; no extra handling needed
    }
  }

  const handleBulkRemindOverdue = async () => {
    try {
      await remindOverdue().unwrap()
    } catch {
      // mutation error surfaced by RTK
    }
  }

  return (
    <div data-testid="supplier-receivables-panel" className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text)]">Open receivables</h3>
        {overdueTotal > 0 && (
          <Button
            size="sm"
            variant="outline"
            data-testid="receivables-bulk-remind"
            disabled={remindingOverdue}
            onClick={() => handleBulkRemindOverdue()}
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            {remindingOverdue ? 'Sending…' : 'Remind overdue'}
          </Button>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Stat
          label="Unpaid total"
          value={formatCurrency(summary.unpaidTotal ?? 0)}
          testId="receivables-unpaid"
        />
        <Stat
          label="Overdue"
          value={formatCurrency(summary.overdueTotal ?? 0)}
          testId="receivables-overdue"
        />
        <Stat
          label="Partial payments"
          value={String(summary.partialCount ?? 0)}
          testId="receivables-partial"
        />
        <Stat
          label="Who owes me"
          value={formatCurrency(summary.whoOwesMeTotal ?? 0)}
          testId="receivables-who-owes"
        />
      </div>

      <div
        data-testid="receivables-aging"
        className="rounded-lg bg-[var(--brand-pale)] border border-[var(--brand-light)] px-3 py-2 text-xs"
      >
        <span className="font-bold text-[var(--text)]">Aging: </span>
        {Object.entries(AGING_LABELS).map(([key, label], i) => (
          <span key={key}>
            {i > 0 ? ' · ' : ''}
            {label} {formatCurrency(aging[key] ?? 0)}
          </span>
        ))}
      </div>

      {topDebtors.length > 0 && (
        <div
          data-testid="receivables-top-debtors"
          className="rounded-lg border border-[var(--app-border)] px-3 py-2"
        >
          <div className="text-xs font-bold text-[var(--text-muted)] mb-2">Top debtors</div>
          <ul className="space-y-1.5">
            {topDebtors
              .slice(0, 5)
              .map(
                (debtor: {
                  restaurantId: string
                  restaurantName: string
                  balanceDue: number
                  oldestInvoiceId?: string | null
                }) => (
                  <li
                    key={debtor.restaurantId}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <Link
                      to={`/app/restaurants/${debtor.restaurantId}`}
                      className="font-medium text-[var(--text)] hover:text-[var(--brand)]"
                    >
                      {debtor.restaurantName}
                      <span className="text-[var(--text-muted)] ml-1">
                        {formatCurrency(debtor.balanceDue)}
                      </span>
                    </Link>
                    {debtor.oldestInvoiceId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2"
                        data-testid={`debtor-remind-${debtor.restaurantId}`}
                        disabled={sendingReminder}
                        onClick={() => handleDebtorReminder(debtor.oldestInvoiceId)}
                      >
                        Send reminder
                      </Button>
                    )}
                  </li>
                )
              )}
          </ul>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--brand-ultra)] text-left text-[var(--text-muted)]">
                <th className="px-3 py-2 font-semibold">Invoice</th>
                <th className="px-3 py-2 font-semibold">Restaurant</th>
                <th className="px-3 py-2 font-semibold">Due</th>
                <th className="px-3 py-2 font-semibold">Balance</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices
                .slice(0, 8)
                .map(
                  (inv: {
                    id: string
                    invoiceNumber: string
                    restaurantId: string
                    restaurantName: string
                    dueDate: string
                    balanceDue: number
                    status: string
                    isOverdue: boolean
                  }) => {
                    const badge = statusBadge(inv.status, inv.isOverdue)
                    return (
                      <tr key={inv.id} className="border-t border-[var(--app-border)]">
                        <td className="px-3 py-2">
                          <Link to="/app/invoices" className="text-[var(--brand)] font-medium">
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/app/restaurants/${inv.restaurantId}`}
                            className="hover:text-[var(--brand)]"
                          >
                            {inv.restaurantName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-[var(--text-muted)]">{inv.dueDate}</td>
                        <td className="px-3 py-2 font-semibold">
                          {formatCurrency(inv.balanceDue)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  }
                )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg bg-[var(--brand-pale)] border border-[var(--brand-light)] p-3"
    >
      <div className="text-[11px] text-[var(--text-muted)] font-semibold">{label}</div>
      <div className="text-lg font-extrabold mt-1">{value}</div>
    </div>
  )
}
