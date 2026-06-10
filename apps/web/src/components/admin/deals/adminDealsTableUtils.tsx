import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { formatDealTypeLabel } from '../../../lib/dealDisplayLabels'
import { cn } from '../../../lib/utils'

export type DealSortKey =
  | 'name'
  | 'supplier'
  | 'type'
  | 'status'
  | 'starts_at'
  | 'ends_at'
  | 'created_at'

export type DealRow = Record<string, unknown>

export function formatDealType(type: unknown): string {
  return formatDealTypeLabel(type)
}

export function formatDealValue(deal: DealRow): string | null {
  const type = String(deal.type || '')
  const raw = deal.discount_value ?? deal.discount_amount ?? deal.value
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return String(raw)
  if (type === 'percentage_off') return `${n}% off`
  if (type === 'free_shipping') return 'Free shipping'
  if (type === 'fixed_off') return `$${n.toFixed(2)} off`
  return String(raw)
}

export function compareDeals(
  a: DealRow,
  b: DealRow,
  key: DealSortKey,
  dir: 'asc' | 'desc'
): number {
  const mul = dir === 'asc' ? 1 : -1
  const str = (v: unknown) => String(v ?? '').toLowerCase()
  const date = (v: unknown) => {
    const t = new Date(String(v || '')).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  switch (key) {
    case 'name':
      return mul * str(a.name).localeCompare(str(b.name))
    case 'supplier':
      return mul * str(a.supplier_name).localeCompare(str(b.supplier_name))
    case 'type':
      return mul * str(a.type).localeCompare(str(b.type))
    case 'status':
      return mul * str(a.status).localeCompare(str(b.status))
    case 'starts_at':
      return mul * (date(a.starts_at) - date(b.starts_at))
    case 'ends_at':
      return mul * (date(a.ends_at) - date(b.ends_at))
    case 'created_at':
      return mul * (date(a.created_at) - date(b.created_at))
    default:
      return 0
  }
}

export function DealSortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string
  sortKey: DealSortKey
  activeKey: DealSortKey
  direction: 'asc' | 'desc'
  onSort: (key: DealSortKey) => void
  className?: string
}) {
  const active = activeKey === sortKey
  const Icon = active ? (direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <th className={cn('px-3 py-2.5 font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded-md px-1 transition-colors hover:bg-[var(--app-bg-subtle)] hover:text-[var(--text)]',
          active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  )
}
