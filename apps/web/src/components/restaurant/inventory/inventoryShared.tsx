import { Skeleton } from '../../ui/skeleton'

export function InventoryTabLoading({ className }: { className?: string }) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)] ${className ?? ''}`}
      aria-busy="true"
      aria-label="Loading tab"
    >
      <div className="divide-y divide-[var(--app-border)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
        ))}
      </div>
    </section>
  )
}

export type SortOption =
  | 'updated_desc'
  | 'name_asc'
  | 'name_desc'
  | 'quantity_asc'
  | 'quantity_desc'
  | 'status'

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'quantity_asc', label: 'Quantity (low first)' },
  { value: 'quantity_desc', label: 'Quantity (high first)' },
  { value: 'status', label: 'Stock status' },
]

export type RestaurantInventoryTabKey = 'inventory' | 'waste' | 'expiry' | 'history' | 'totals'

export function getMovementSource(movement: any) {
  return movement.reference_type === 'RECEIVING_REPORT'
    ? 'Order'
    : movement.reference_type === 'MANUAL_ADD'
      ? 'Manual'
      : movement.reference_type || '—'
}

export function getMovementTypeLabel(movement: any, source: string) {
  const t = (movement.type || '').toUpperCase()
  if (source === 'Order') return 'ADD'
  if (t === 'ORDER' || t === 'RECEIVED') return 'ADD'
  if (t === 'ADD') return 'ADD'
  if (t === 'SUBTRACT') return 'SUBTRACT'
  if (t === 'COUNT_CORRECTION') return 'ADJUST'
  if (t === 'WASTAGE') return 'WASTE'
  if (t === 'SPOILAGE') return 'SPOIL'
  return t || '—'
}

export function getMovementBadgeVariant(typeLabel: string) {
  return typeLabel === 'ADD' ? 'default' : typeLabel === 'ADJUST' ? 'secondary' : 'destructive'
}

export function getMovementTypeText(typeLabel: string) {
  return typeLabel === 'WASTE' ? 'Wastage' : typeLabel === 'SPOIL' ? 'Spoilage' : typeLabel
}

export function getStockStatus(quantity: number, threshold: number) {
  if (quantity === 0) return 'OUT_OF_STOCK'
  if (threshold && quantity <= threshold) return 'LOW_STOCK'
  return 'IN_STOCK'
}

export function getItemCategory(item: {
  product_category?: string
  product_category_legacy?: string
}) {
  return item.product_category || item.product_category_legacy || ''
}

export function getStatusSortRank(status: string) {
  if (status === 'OUT_OF_STOCK') return 0
  if (status === 'LOW_STOCK') return 1
  return 2
}

// Default coverage window (supplier lead time 7d + 14d safety buffer) used only
// as a client-side fallback. Keep in sync with SAFETY_BUFFER_DAYS + DEFAULT_LEAD_TIME_DAYS
// in apps/api/src/lib/reorder-quantity.js. The server value is always preferred.
const FALLBACK_COVERAGE_DAYS = 21

export function calculateReorderQuantity(item: any) {
  // Prefer the server-computed, canonical suggestion whenever present.
  if (item?.suggested_reorder_qty != null && Number(item.suggested_reorder_qty) > 0) {
    return Math.ceil(Number(item.suggested_reorder_qty))
  }

  const quantity = Number(item?.quantity) || 0
  const lowStockThreshold = Number(item?.low_stock_threshold) || 0
  if (!lowStockThreshold || quantity > lowStockThreshold) return 0

  // Order-up-to fallback: cover expected usage across the coverage window, minus on-hand.
  const leadTimeDays = Number(item?.lead_time_days) || 0
  const coverageDays = leadTimeDays > 0 ? leadTimeDays + 14 : FALLBACK_COVERAGE_DAYS
  const avgDailyUsage = Number(item?.avg_daily_usage) || Number(item?.avg_daily_usage_30day) || 0

  const orderUpTo = avgDailyUsage > 0 ? avgDailyUsage * coverageDays : lowStockThreshold * 2
  const suggested = Math.max(orderUpTo - quantity, Number(item?.moq) || 1)
  return Math.ceil(suggested)
}

export function summaryCardClass(active: boolean) {
  return `cursor-pointer transition-all duration-200 ease hover:shadow-md hover:-translate-y-0.5 ${active ? 'ring-2 ring-[var(--brand-mid)] ring-offset-2 shadow-md' : ''}`
}

export function formatStockShare(count: number, total: number) {
  if (!total || total <= 0) return '0%'
  return `${Math.round((count / total) * 100)}%`
}
