export type ConsumerOrderingMode = 'LIVE' | 'PREORDER_ONLY' | 'CLOSED'

export type ConsumerOrderingHoursConfig = {
  liveOrderStart?: string
  liveOrderEnd?: string
  allowPreordersOutsideLiveHours?: boolean
}

export type ConsumerOrderingStatus = {
  mode: ConsumerOrderingMode
  allowAsap: boolean
  allowPreorders: boolean
  liveOrderStart: string
  liveOrderEnd: string
  allowPreordersOutsideLiveHours: boolean
  nextLiveOrderAt: string | null
  message: string
}

function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null
  const normalized = timeStr.trim()
  if (normalized === '24:00') return 1440
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

function endTimeIsEndOfDay(endTime?: string | null): boolean {
  if (!endTime) return true
  const trimmed = endTime.trim()
  return trimmed === '00:00' || trimmed === '24:00'
}

export function normalizeOrderingHoursConfig(
  config?: ConsumerOrderingHoursConfig | null
): Required<ConsumerOrderingHoursConfig> {
  return {
    liveOrderStart: config?.liveOrderStart ?? '12:00',
    liveOrderEnd: config?.liveOrderEnd ?? '00:00',
    allowPreordersOutsideLiveHours: config?.allowPreordersOutsideLiveHours ?? true,
  }
}

export function isWithinLiveOrderWindow(now: Date, startTime: string, endTime: string): boolean {
  const startMin = parseTimeToMinutes(startTime) ?? 12 * 60
  const currentMin = now.getHours() * 60 + now.getMinutes()

  if (endTimeIsEndOfDay(endTime) && startMin > 0) {
    return currentMin >= startMin
  }

  const endMin = parseTimeToMinutes(endTime)
  if (endMin == null) return currentMin >= startMin
  if (endMin > startMin) return currentMin >= startMin && currentMin < endMin
  return currentMin >= startMin || currentMin < endMin
}

export function getNextLiveOrderStart(now: Date, startTime: string): Date {
  const startMin = parseTimeToMinutes(startTime) ?? 12 * 60
  const next = new Date(now)
  next.setSeconds(0, 0)
  next.setMilliseconds(0)

  const currentMin = now.getHours() * 60 + now.getMinutes()
  if (currentMin < startMin) {
    next.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
    return next
  }

  next.setDate(next.getDate() + 1)
  next.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
  return next
}

export function resolveConsumerOrderingStatus(
  config?: ConsumerOrderingHoursConfig | null,
  now: Date = new Date()
): ConsumerOrderingStatus {
  const { liveOrderStart, liveOrderEnd, allowPreordersOutsideLiveHours } =
    normalizeOrderingHoursConfig(config)

  const isLive = isWithinLiveOrderWindow(now, liveOrderStart, liveOrderEnd)
  const startLabel = formatMinutesToTime(parseTimeToMinutes(liveOrderStart) ?? 12 * 60)
  const endLabel = endTimeIsEndOfDay(liveOrderEnd) ? 'midnight' : liveOrderEnd

  if (isLive) {
    return {
      mode: 'LIVE',
      allowAsap: true,
      allowPreorders: true,
      liveOrderStart,
      liveOrderEnd,
      allowPreordersOutsideLiveHours,
      nextLiveOrderAt: null,
      message: `Open for orders until ${endLabel}.`,
    }
  }

  const nextLiveOrderAt = getNextLiveOrderStart(now, liveOrderStart)

  if (allowPreordersOutsideLiveHours) {
    return {
      mode: 'PREORDER_ONLY',
      allowAsap: false,
      allowPreorders: true,
      liveOrderStart,
      liveOrderEnd,
      allowPreordersOutsideLiveHours,
      nextLiveOrderAt: nextLiveOrderAt.toISOString(),
      message: `Preorders only until ${startLabel}. Schedule for ${startLabel} or later.`,
    }
  }

  return {
    mode: 'CLOSED',
    allowAsap: false,
    allowPreorders: false,
    liveOrderStart,
    liveOrderEnd,
    allowPreordersOutsideLiveHours,
    nextLiveOrderAt: nextLiveOrderAt.toISOString(),
    message: `Ordering closed. Live orders resume at ${startLabel}.`,
  }
}

/** Format for datetime-local input (local timezone). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function orderingStatusFromBranch(
  branch?: {
    liveOrderStart?: string
    liveOrderEnd?: string
    allowPreordersOutsideLiveHours?: boolean
    ordering?: ConsumerOrderingStatus
  } | null
): ConsumerOrderingStatus {
  if (branch?.ordering) return branch.ordering
  return resolveConsumerOrderingStatus(branch ?? undefined)
}
