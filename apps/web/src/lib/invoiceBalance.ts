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
