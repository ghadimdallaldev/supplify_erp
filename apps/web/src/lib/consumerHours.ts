export type DayHours = {
  open?: string
  close?: string
  closed?: boolean
}

export type OperatingHours = Record<string, DayHours>

const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

function pickDayHours(
  operatingHours: OperatingHours | null | undefined,
  date: Date
): DayHours | null {
  if (!operatingHours || typeof operatingHours !== 'object') return null
  const dayKey = WEEKDAY_KEYS[date.getDay()]
  const variants = [dayKey, dayKey.slice(0, 3), dayKey.charAt(0).toUpperCase() + dayKey.slice(1)]
  for (const variant of variants) {
    const day = operatingHours[variant]
    if (day && typeof day === 'object') return day
  }
  return null
}

function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export function getRestaurantOpenStatus(
  operatingHours: OperatingHours | null | undefined,
  now: Date = new Date()
): { isOpen: boolean; label: string; todayHours: string | null } {
  const day = pickDayHours(operatingHours, now)
  if (!day) {
    return { isOpen: true, label: 'Open for orders', todayHours: null }
  }
  if (day.closed) {
    return { isOpen: false, label: 'Closed today', todayHours: 'Closed' }
  }
  const openMin = parseTimeToMinutes(day.open)
  const closeMin = parseTimeToMinutes(day.close)
  const todayHours =
    openMin != null && closeMin != null
      ? `${formatMinutes(openMin)} – ${formatMinutes(closeMin)}`
      : null

  if (openMin == null || closeMin == null) {
    return { isOpen: true, label: 'Open for orders', todayHours }
  }

  const currentMin = now.getHours() * 60 + now.getMinutes()
  const isOpen =
    closeMin > openMin
      ? currentMin >= openMin && currentMin < closeMin
      : currentMin >= openMin || currentMin < closeMin

  return {
    isOpen,
    label: isOpen ? 'Open now' : 'Closed now',
    todayHours,
  }
}

export function summarizeTodayHours(
  operatingHours: OperatingHours | null | undefined
): string | null {
  return getRestaurantOpenStatus(operatingHours).todayHours
}
