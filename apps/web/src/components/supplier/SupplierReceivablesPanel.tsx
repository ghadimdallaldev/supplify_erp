import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetSupplierReceivablesQuery } from '../../services/api'
import {
  useSendInvoiceReminderMutation,
  useRemindOverdueInvoicesMutation,
} from '../../services/api/endpoints/finance'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import { formatCurrency, formatPrice } from '../../utils/format'

function labeledMoney(amount: number, currency?: string | null) {
  const code = String(currency || '')
    .trim()
    .toUpperCase()
  if (/^[A-Z]{3}$/.test(code)) return formatCurrency(amount, { currency: code })
  return formatPrice(amount)
}
import { AlertTriangle, Bell } from 'lucide-react'

const AGING_BUCKET_KEYS = ['current', '0_7', '8_30', '31_60', '60_plus'] as const

function formatMoneyTotal(
  value: number | null | undefined,
  byCurrency?: Array<{ currency?: string; unpaidTotal?: number; overdueTotal?: number }>,
  field?: 'unpaidTotal' | 'overdueTotal'
) {
  if (field && byCurrency && byCurrency.length > 1) {
    return byCurrency.map((row) => labeledMoney(row[field] ?? 0, row.currency)).join(' · ')
  }
  if (value == null) return '—'
  return labeledMoney(value, byCurrency?.[0]?.currency)
}

function statusBadge(
  status: string,
  isOverdue: boolean,
  t: (key: string) => string
): { label: string; className: string } {
  if (status === 'PARTIALLY_PAID')
    return { label: t('receivables.status.partial'), className: 'bg-amber-100 text-amber-800' }
  if (isOverdue || status === 'OVERDUE')
    return { label: t('receivables.status.overdue'), className: 'bg-red-100 text-red-800' }
  return { label: t('receivables.status.unpaid'), className: 'bg-slate-100 text-slate-700' }
}

export function SupplierReceivablesPanel() {
  const { t } = useTranslation('suppliers')
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
        <p className="text-sm text-[var(--text-muted)]">{t('receivables.loadError')}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
          {t('common:actions.retry')}
        </Button>
      </div>
    )
  }

  const summary = data?.summary
  const aging = data?.aging || {}
  const invoices = data?.invoices || []
  const topDebtors = data?.topDebtors || []
  const overdueTotal = summary?.overdueTotal
  const hasOverdue =
    (overdueTotal != null && overdueTotal > 0) ||
    (summary?.byCurrency || []).some(
      (row: { overdueTotal?: number }) => Number(row.overdueTotal) > 0
    )

  if (!summary?.unpaidCount) {
    return (
      <div
        data-testid="supplier-receivables-empty"
        className="rounded-xl border border-dashed border-[var(--app-border)] px-4 py-5 mb-4 text-sm text-[var(--text-muted)]"
      >
        {t('receivables.empty')}
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
        <h3 className="text-sm font-bold text-[var(--text)]">{t('receivables.title')}</h3>
        {hasOverdue && (
          <Button
            size="sm"
            variant="outline"
            data-testid="receivables-bulk-remind"
            disabled={remindingOverdue}
            onClick={() => handleBulkRemindOverdue()}
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            {remindingOverdue ? t('receivables.sending') : t('receivables.remindOverdue')}
          </Button>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Stat
          label={t('receivables.stats.unpaidTotal')}
          value={formatMoneyTotal(summary.unpaidTotal, summary.byCurrency, 'unpaidTotal')}
          testId="receivables-unpaid"
        />
        <Stat
          label={t('receivables.stats.overdue')}
          value={formatMoneyTotal(summary.overdueTotal, summary.byCurrency, 'overdueTotal')}
          testId="receivables-overdue"
        />
        <Stat
          label={t('receivables.stats.partialPayments')}
          value={String(summary.partialCount ?? 0)}
          testId="receivables-partial"
        />
        <Stat
          label={t('receivables.stats.whoOwesMe')}
          value={formatMoneyTotal(summary.whoOwesMeTotal, summary.byCurrency, 'unpaidTotal')}
          testId="receivables-who-owes"
        />
      </div>

      <div
        data-testid="receivables-aging"
        className="rounded-lg bg-[var(--brand-pale)] border border-[var(--brand-light)] px-3 py-2 text-xs"
      >
        <span className="font-bold text-[var(--text)]">{t('receivables.aging')} </span>
        {AGING_BUCKET_KEYS.map((key, i) => (
          <span key={key}>
            {i > 0 ? ' · ' : ''}
            {t(`receivables.agingBuckets.${key}`)}{' '}
            {aging[key] == null
              ? '—'
              : labeledMoney(
                  Number(aging[key]),
                  summary.byCurrency?.length === 1 ? summary.byCurrency[0].currency : null
                )}
          </span>
        ))}
      </div>

      {topDebtors.length > 0 && (
        <div
          data-testid="receivables-top-debtors"
          className="rounded-lg border border-[var(--app-border)] px-3 py-2"
        >
          <div className="text-xs font-bold text-[var(--text-muted)] mb-2">
            {t('receivables.topDebtors')}
          </div>
          <ul className="space-y-1.5">
            {topDebtors
              .slice(0, 5)
              .map(
                (debtor: {
                  restaurantId: string
                  restaurantName: string
                  currency?: string
                  balanceDue: number
                  oldestInvoiceId?: string | null
                }) => (
                  <li
                    key={`${debtor.restaurantId}-${debtor.currency || 'USD'}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <Link
                      to={`/app/restaurants/${debtor.restaurantId}`}
                      className="font-medium text-[var(--text)] hover:text-[var(--brand)]"
                    >
                      {debtor.restaurantName}
                      <span className="text-[var(--text-muted)] ml-1">
                        {labeledMoney(debtor.balanceDue, debtor.currency)}
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
                        {t('receivables.sendReminder')}
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
                <th className="px-3 py-2 font-semibold">{t('receivables.table.invoice')}</th>
                <th className="px-3 py-2 font-semibold">{t('receivables.table.restaurant')}</th>
                <th className="px-3 py-2 font-semibold">{t('receivables.table.due')}</th>
                <th className="px-3 py-2 font-semibold">{t('receivables.table.balance')}</th>
                <th className="px-3 py-2 font-semibold">{t('receivables.table.status')}</th>
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
                    currency?: string | null
                    status: string
                    isOverdue: boolean
                  }) => {
                    const badge = statusBadge(inv.status, inv.isOverdue, t)
                    return (
                      <tr key={inv.id} className="border-t border-[var(--app-border)]">
                        <td className="px-3 py-2">
                          <Link
                            to={`/app/invoices?invoice=${inv.id}`}
                            className="text-[var(--brand)] font-medium"
                          >
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
                          {labeledMoney(inv.balanceDue, inv.currency)}
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
