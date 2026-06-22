import { useTranslation } from 'react-i18next'
import { Filter } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { DispatchFilters } from './fulfillmentDispatchUtils'
import { DISPATCH_FILTER_ALL } from './fulfillmentDispatchUtils'

type DriverOption = { id: string; full_name?: string; fullName?: string }

type Props = {
  filters: DispatchFilters
  onChange: (next: DispatchFilters) => void
  onClear: () => void
  drivers: DriverOption[]
}

export function FulfillmentDispatchFilters({ filters, onChange, onClear, drivers }: Props) {
  const { t } = useTranslation('fulfillment')
  const set = (patch: Partial<DispatchFilters>) => onChange({ ...filters, ...patch })

  const statusOptions = [
    { value: DISPATCH_FILTER_ALL, label: t('dispatch.filters.allStatuses') },
    { value: 'pending', label: t('dispatch.filters.statusPending') },
    { value: 'out_for_delivery', label: t('dispatch.filters.statusOutForDelivery') },
    { value: 'delivered', label: t('dispatch.filters.statusDelivered') },
    { value: 'failed', label: t('dispatch.filters.statusFailed') },
    { value: 'rescheduled', label: t('dispatch.filters.statusRescheduled') },
  ] as const

  return (
    <div
      data-testid="fulfillment-dispatch-filters"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Filter className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
        <p className="text-sm font-semibold text-[var(--text)]">{t('dispatch.filters.title')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <div className="min-w-0">
          <label
            htmlFor="dispatch-filter-date"
            className="mb-1 block text-xs font-medium text-[var(--text-mid)]"
          >
            {t('dispatch.filters.date')}
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
          <span className="mb-1 block text-xs font-medium text-[var(--text-mid)]">
            {t('dispatch.filters.status')}
          </span>
          <Select value={filters.status} onValueChange={(status) => set({ status })}>
            <SelectTrigger data-testid="delivery-filter-status" className="w-full">
              <SelectValue placeholder={t('dispatch.filters.status')} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--text-mid)]">
            {t('dispatch.filters.driver')}
          </span>
          <Select value={filters.driverId} onValueChange={(driverId) => set({ driverId })}>
            <SelectTrigger data-testid="delivery-filter-driver" className="w-full">
              <SelectValue placeholder={t('dispatch.filters.driver')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DISPATCH_FILTER_ALL}>
                {t('dispatch.filters.allDrivers')}
              </SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name ?? d.fullName ?? t('dispatch.driverFallback')}
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
            {t('dispatch.filters.area')}
          </label>
          <Input
            id="dispatch-filter-area"
            data-testid="delivery-filter-area"
            placeholder={t('dispatch.filters.areaPlaceholder')}
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
            {t('dispatch.filters.clearFilters')}
          </Button>
        </div>
      </div>
    </div>
  )
}
