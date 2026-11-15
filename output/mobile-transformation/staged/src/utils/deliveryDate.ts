export function formatIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export const DELIVERY_DATE_CHIP_OPTIONS = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: '+2 days', offset: 2 },
] as const

export const DELIVERY_DATE_CUTOFF_HINT =
  'Suppliers may enforce a last-order cutoff. If you order past their cutoff, delivery rolls to the next eligible day.'

export function deliveryDateForOffset(offset: number): string {
  return formatIsoDate(addDays(new Date(), offset))
}
