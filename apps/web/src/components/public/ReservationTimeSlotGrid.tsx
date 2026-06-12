import type { PublicAvailabilitySlot } from '../../types'
import { cn } from '../../lib/utils'

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatSlotLabel(slot: PublicAvailabilitySlot, totalCapacity?: number) {
  if (slot.status === 'past') return 'Past'
  if (!slot.isAvailable) return 'Full'
  const left = slot.seatsLeft ?? slot.capacityAvailable
  if (totalCapacity != null && left >= totalCapacity) return 'Available'
  if (slot.status === 'limited') return `${left} left`
  return `${left} seat${left === 1 ? '' : 's'} left`
}

type ReservationTimeSlotGridProps = {
  slots: PublicAvailabilitySlot[]
  selectedSlot: string
  onSelect: (startTime: string) => void
  totalCapacity?: number
  showCapacity?: boolean
}

export function ReservationTimeSlotGrid({
  slots,
  selectedSlot,
  onSelect,
  totalCapacity,
  showCapacity = false,
}: ReservationTimeSlotGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {slots.map((slot) => {
        const selected = slot.startTime === selectedSlot
        return (
          <button
            key={slot.startTime}
            type="button"
            disabled={!slot.isAvailable}
            onClick={() => onSelect(slot.startTime)}
            className={cn(
              'public-slot consumer-pressable flex min-h-[52px] flex-col rounded-xl border px-3 py-2.5 text-left text-xs',
              selected &&
                'border-[var(--brand-mid)] bg-[var(--brand-pale)] text-[var(--brand-mid)]',
              !selected &&
                slot.isAvailable &&
                'border-[var(--app-border)] hover:border-[var(--brand-light)] hover:bg-[var(--brand-ultra)]',
              !slot.isAvailable && 'border-[var(--app-border)] text-[var(--text-muted)] opacity-60'
            )}
          >
            <span className="font-semibold tabular-nums">{formatTime(slot.startTime)}</span>
            <span
              className={cn(
                slot.status === 'past' && 'text-[var(--text-muted)]',
                !slot.isAvailable && slot.status !== 'past' && 'font-medium text-[var(--red)]'
              )}
            >
              {showCapacity && slot.isAvailable
                ? `Up to ${slot.capacityAvailable} seats`
                : formatSlotLabel(slot, totalCapacity)}
            </span>
            {showCapacity && !slot.isAvailable ? (
              <span className="text-[10px] font-medium text-[var(--red)]">Unavailable</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export { formatTime }
