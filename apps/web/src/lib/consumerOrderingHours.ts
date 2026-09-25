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

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    calendarDate: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function addCalendarDays(ymd: string, days: number) {
  const [year, month, day] = ymd.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day))
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function wallClockToUtc(ymd: string, hour: number, minute: number, timeZone: string) {
  const [year, month, day] = ymd.split('-').map(Number)
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  for (let pass = 0; pass < 3; pass += 1) {
    const got = zonedParts(utc, timeZone)
    let gotHour = got.hour
    let gotDate = got.calendarDate
    if (gotHour === 24) {
      gotHour = 0
      gotDate = addCalendarDays(gotDate, 1)
    }
    const [gy, gm, gd] = gotDate.split('-').map(Number)
    const gotUtc = Date.UTC(gy, gm - 1, gd, gotHour, got.minute, 0, 0)
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
    const delta = gotUtc - wanted
    if (delta === 0) break
    utc = new Date(utc.getTime() - delta)
  }
  return utc
}

function clockMinutes(now: Date, timeZone?: string | null) {
  if (!timeZone) return now.getHours() * 60 + now.getMinutes()
  const parts = zonedParts(now, timeZone)
  const hour = parts.hour === 24 ? 0 : parts.hour
  return hour * 60 + parts.minute
}

/** A datetime-local value is the restaurant's wall clock when a timezone is known. */
export function scheduledInstant(localValue: string, timeZone?: string | null): Date {
  const match = localValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (!match || !timeZone) return new Date(localValue)
  return wallClockToUtc(match[1], Number(match[2]), Number(match[3]), timeZone)
}

export function toDatetimeLocalValueInZone(date: Date, timeZone?: string | null): string {
  if (!timeZone) return toDatetimeLocalValue(date)
  const parts = zonedParts(date, timeZone)
  const hour = parts.hour === 24 ? 0 : parts.hour
  const day = parts.hour === 24 ? addCalendarDays(parts.calendarDate, 1) : parts.calendarDate
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day}T${pad(hour)}:${pad(parts.minute)}`
}

export function isWithinLiveOrderWindow(
  now: Date,
  startTime: string,
  endTime: string,
  timeZone?: string | null
): boolean {
  const startMin = parseTimeToMinutes(startTime) ?? 12 * 60
  const currentMin = clockMinutes(now, timeZone)

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
