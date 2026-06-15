import { Filter } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { DispatchFilters } from './fulfillmentDispatchUtils'
import { DISPATCH_FILTER_ALL } from './fulfillmentDispatchUtils'

const STATUS_OPTIONS = [
  { value: DISPATCH_FILTER_ALL, label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'rescheduled', label: 'Rescheduled' },
] as const

type DriverOption = { id: string; full_name?: string; fullName?: string }

type Props = {
  filters: DispatchFilters
  onChange: (next: DispatchFilters) => void
  onClear: () => void
  drivers: DriverOption[]
}

export function FulfillmentDispatchFilters({ filters, onChange, onClear, drivers }: Props) {
  const set = (patch: Partial<DispatchFilters>) => onChange({ ...filters, ...patch })

  return (
    <div
      data-testid="fulfillment-dispatch-filters"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Filter className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
        <p className="text-sm font-semibold text-[var(--text)]">Filters</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <div className="min-w-0">
          <label
            htmlFor="dispatch-filter-date"
            className="mb-1 block text-xs font-medium text-[var(--text-mid)]"
          >
            Date
          </label>
          <Input
            id="dispatch-filter-date"
            type="date"
            data-testid="delivery-filter-date"
            value={filters.date}
            onChange={(e) => set({ date: e.target.value })}
            className="w-full"
          />
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--text-mid)]">Status</span>
          <Select value={filters.status} onValueChange={(status) => set({ status })}>
            <SelectTrigger data-testid="delivery-filter-status" className="w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--text-mid)]">Driver</span>
          <Select value={filters.driverId} onValueChange={(driverId) => set({ driverId })}>
            <SelectTrigger data-testid="delivery-filter-driver" className="w-full">
              <SelectValue placeholder="Driver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DISPATCH_FILTER_ALL}>All drivers</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name ?? d.fullName ?? 'Driver'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="dispatch-filter-area"
            className="mb-1 block text-xs font-medium text-[var(--text-mid)]"
          >
            Area
          </label>
          <Input
            id="dispatch-filter-area"
            data-testid="delivery-filter-area"
            placeholder="Delivery area"
            value={filters.area}
            onChange={(e) => set({ area: e.target.value })}
            className="w-full"
          />
        </div>

        <div className="flex items-end sm:col-span-2 lg:col-span-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto"
            data-testid="delivery-filter-clear"
            onClick={onClear}
          >
            Clear filters
          </Button>
        </div>
      </div>
    </div>
  )
}
