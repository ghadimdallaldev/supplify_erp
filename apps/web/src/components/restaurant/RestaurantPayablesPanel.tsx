import { Link } from 'react-router-dom'
import { useGetRestaurantPayablesQuery } from '../../services/api'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import { formatCurrency } from '../../utils/format'
import { AlertTriangle } from 'lucide-react'

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

export function RestaurantPayablesPanel() {
  const { data, isLoading, isError, refetch } = useGetRestaurantPayablesQuery()

  if (isLoading) {
    return (
      <div data-testid="restaurant-payables-loading" className="space-y-2 mb-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        data-testid="restaurant-payables-error"
        className="rounded-xl border border-[var(--app-border)] p-4 mb-4 text-center"
        role="alert"
      >
        <AlertTriangle className="h-5 w-5 mx-auto text-[var(--brand)] mb-2" />
        <p className="text-sm text-[var(--text-muted)]">Could not load payables.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const summary = data?.summary
  const aging = data?.aging || {}
  const invoices = data?.invoices || []
  const topCreditors = data?.topCreditors || []

  if (!summary?.unpaidCount) {
    return (
      <div
        data-testid="restaurant-payables-empty"
        className="rounded-xl border border-dashed border-[var(--app-border)] px-4 py-5 mb-4 text-sm text-[var(--text-muted)]"
      >
        No open payables — you&apos;re caught up with supplier invoices.
      </div>
    )
  }

  return (
    <div data-testid="restaurant-payables-panel" className="mb-4 space-y-3">
      <h3 className="text-sm font-bold text-[var(--text)]">Open payables</h3>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Stat
          label="Unpaid total"
          value={formatCurrency(summary.unpaidTotal ?? 0)}
          testId="payables-unpaid"
        />
        <Stat
          label="Due this week"
          value={formatCurrency(summary.dueThisWeekTotal ?? 0)}
          testId="payables-due-week"
        />
        <Stat
          label="Overdue"
          value={formatCurrency(summary.overdueTotal ?? 0)}
          testId="payables-overdue"
        />
        <Stat
          label="Partial payments"
          value={String(summary.partialCount ?? 0)}
          testId="payables-partial"
        />
      </div>

      <div
        data-testid="payables-aging"
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

      {topCreditors.length > 0 && (
        <div
          data-testid="payables-top-creditors"
          className="rounded-lg border border-[var(--app-border)] px-3 py-2"
        >
          <div className="text-xs font-bold text-[var(--text-muted)] mb-2">Top suppliers owed</div>
          <ul className="space-y-1.5">
            {topCreditors
              .slice(0, 5)
              .map(
                (creditor: {
                  supplierId: string
                  supplierName: string
                  balanceDue: number
                  invoiceCount: number
                }) => (
                  <li
                    key={creditor.supplierId}
                    className="flex flex-wrap items-center gap-2 text-xs"
                  >
                    <Link
                      to={`/app/suppliers/${creditor.supplierId}`}
                      className="font-medium text-[var(--text)] hover:text-[var(--brand)]"
                    >
                      {creditor.supplierName}
                    </Link>
                    <span className="text-[var(--text-muted)]">
                      {formatCurrency(creditor.balanceDue)} · {creditor.invoiceCount} invoice
                      {creditor.invoiceCount !== 1 ? 's' : ''}
                    </span>
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
                <th className="px-3 py-2 font-semibold">Supplier</th>
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
                    supplierId: string
                    supplierName: string
                    dueDate: string
                    balanceDue: number
                    status: string
                    isOverdue: boolean
                  }) => {
                    const badge = statusBadge(inv.status, inv.isOverdue)
                    return (
                      <tr key={inv.id} className="border-t border-[var(--app-border)]">
                        <td className="px-3 py-2 font-medium">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/app/suppliers/${inv.supplierId}`}
                            className="hover:text-[var(--brand)]"
                          >
                            {inv.supplierName}
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
