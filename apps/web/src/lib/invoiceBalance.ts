/** Canonical remaining balance from list/detail invoice rows. */
export function invoiceRemainingBalance(
  invoice:
    | {
        remaining_balance?: string | number | null
        balance_due?: string | number | null
        total_amount?: string | number | null
        total_paid?: string | number | null
      }
    | null
    | undefined
): number {
  if (!invoice) return 0
  if (invoice.remaining_balance != null && invoice.remaining_balance !== '') {
    return Math.max(0, parseFloat(String(invoice.remaining_balance)))
  }
  if (invoice.balance_due != null && invoice.balance_due !== '') {
    return Math.max(0, parseFloat(String(invoice.balance_due)))
  }
  const total = parseFloat(String(invoice.total_amount ?? 0))
  const paid = parseFloat(String(invoice.total_paid ?? 0))
  return Math.max(0, total - paid)
}

/** Calendar day from a DATE (`YYYY-MM-DD`) or an ISO instant, in local time. */
export function calendarDateKey(value: unknown): string | null {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return localDateKey(parsed)
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Overdue follows the server's restaurant-local day count when it is present. */
export function invoiceIsOverdue(
  invoice:
    | {
        days_overdue?: string | number | null
        due_date?: unknown
        status?: string | null
        remaining_balance?: string | number | null
        balance_due?: string | number | null
        total_amount?: string | number | null
        total_paid?: string | number | null
      }
    | null
    | undefined,
  today = new Date()
): boolean {
  if (!invoice) return false
  if (invoice.status === 'PAID' || invoice.status === 'VOID' || invoice.status === 'DRAFT') {
    return false
  }
  if (invoiceRemainingBalance(invoice) <= 0) return false
  if (invoice.days_overdue != null && invoice.days_overdue !== '') {
    return Number(invoice.days_overdue) > 0
  }
  return Boolean(invoice.due_date && isCalendarDateBeforeToday(invoice.due_date, today))
}

export function isCalendarDateBeforeToday(value: unknown, today = new Date()): boolean {
  const key = calendarDateKey(value)
  if (!key) return false
  return key < localDateKey(today)
}

export function formatCalendarDate(value: unknown): string {
  const key = calendarDateKey(value)
  if (!key) return ''
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}
