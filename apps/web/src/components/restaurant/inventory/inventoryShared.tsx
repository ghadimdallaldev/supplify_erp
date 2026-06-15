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

export function calculateReorderQuantity(item: any) {
  if (item.suggested_reorder_qty != null && item.suggested_reorder_qty > 0) {
    return Math.ceil(Number(item.suggested_reorder_qty))
  }
  const { quantity, low_stock_threshold } = item
  if (!low_stock_threshold || quantity > low_stock_threshold) return 0
  const suggested = low_stock_threshold * 3 - quantity
  return Math.ceil(suggested)
}

export function summaryCardClass(active: boolean) {
  return `cursor-pointer transition-shadow duration-200 ease hover:shadow-md ${active ? 'ring-2 ring-[var(--brand-mid)] ring-offset-2' : ''}`
}
