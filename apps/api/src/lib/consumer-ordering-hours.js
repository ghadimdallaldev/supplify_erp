/**
 * Consumer ordering windows: live (ASAP) orders during configured hours,
 * preorders only outside that window (scheduled for next live opening).
 */

import { t, resolveLocale } from '../i18n/index.js'

/** @param {string | undefined | null} timeStr */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const normalized = timeStr.trim()
  if (normalized === '24:00') return 1440
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

/** @param {number} minutes */
export function formatMinutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

/** @param {string | undefined | null} endTime */
export function endTimeIsEndOfDay(endTime) {
  if (!endTime) return true
  const trimmed = endTime.trim()
  return trimmed === '00:00' || trimmed === '24:00'
}

/** @param {Record<string, unknown> | null | undefined} config */
export function normalizeOrderingHoursConfig(config) {
  return {
    liveOrderStart: String(config?.live_order_start ?? config?.liveOrderStart ?? '12:00'),
    liveOrderEnd: String(config?.live_order_end ?? config?.liveOrderEnd ?? '00:00'),
    allowPreordersOutsideLiveHours:
      config?.allow_preorders_outside_live_hours ?? config?.allowPreordersOutsideLiveHours ?? true,
  }
}

/**
 * @param {Date} now
 * @param {string} startTime HH:mm
 * @param {string} endTime HH:mm (00:00 = until midnight when start > morning)
 */
export function isWithinLiveOrderWindow(now, startTime, endTime) {
  const startMin = parseTimeToMinutes(startTime) ?? 12 * 60
  const currentMin = now.getHours() * 60 + now.getMinutes()

  if (endTimeIsEndOfDay(endTime) && startMin > 0) {
    return currentMin >= startMin
  }

  const endMin = parseTimeToMinutes(endTime)
  if (endMin == null) {
    return currentMin >= startMin
  }

  if (endMin > startMin) {
    return currentMin >= startMin && currentMin < endMin
  }

  // Overnight window (e.g. 22:00 – 06:00)
  return currentMin >= startMin || currentMin < endMin
}

/**
 * @param {Date} now
 * @param {string} startTime
 */
export function getNextLiveOrderStart(now, startTime) {
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

/**
 * @param {Record<string, unknown> | null | undefined} config
 * @param {Date} [now]
 * @param {string} [locale]
 */
export function resolveConsumerOrderingStatus(config, now = new Date(), locale = 'en') {
  const lng = resolveLocale(locale)
  const { liveOrderStart, liveOrderEnd, allowPreordersOutsideLiveHours } =
    normalizeOrderingHoursConfig(config)

  const isLive = isWithinLiveOrderWindow(now, liveOrderStart, liveOrderEnd)
  const endLabel = endTimeIsEndOfDay(liveOrderEnd)
    ? t('consumer.ordering.midnight', lng)
    : liveOrderEnd
  const startLabel = formatMinutesToTime(parseTimeToMinutes(liveOrderStart) ?? 12 * 60)

  if (isLive) {
    return {
      mode: 'LIVE',
      allowAsap: true,
      allowPreorders: true,
      liveOrderStart,
      liveOrderEnd,
      allowPreordersOutsideLiveHours,
      nextLiveOrderAt: null,
      message: t('consumer.ordering.live', lng, { end: endLabel }),
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
      message: t('consumer.ordering.preorderOnly', lng, { start: startLabel }),
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
    message: t('consumer.ordering.closed', lng, { start: startLabel }),
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} config
 * @param {string | null | undefined} scheduledFor ISO timestamp
 * @param {Date} [now]
 * @param {string} [locale]
 */
export function validateConsumerOrderSchedule(
  config,
  scheduledFor,
  now = new Date(),
  locale = 'en'
) {
  const lng = resolveLocale(locale)
  const status = resolveConsumerOrderingStatus(config, now, lng)
  const startLabel = formatMinutesToTime(parseTimeToMinutes(status.liveOrderStart) ?? 12 * 60)

  if (status.mode === 'LIVE') {
    if (!scheduledFor) {
      return status
    }
    const scheduled = new Date(scheduledFor)
    if (Number.isNaN(scheduled.getTime()) || scheduled <= now) {
      throw Object.assign(new Error(t('consumer.ordering.scheduleInvalid', lng)), {
        name: 'SCHEDULE_INVALID',
        code: 'scheduleInvalid',
      })
    }
    return status
  }

  if (status.mode === 'PREORDER_ONLY') {
    if (!scheduledFor) {
      throw Object.assign(
        new Error(t('consumer.ordering.preorderRequired', lng, { start: startLabel })),
        {
          name: 'ORDERING_PREORDER_REQUIRED',
          code: 'preorderRequired',
        }
      )
    }
    const scheduled = new Date(scheduledFor)
    const minStart = new Date(status.nextLiveOrderAt)
    if (Number.isNaN(scheduled.getTime()) || scheduled < minStart) {
      throw Object.assign(
        new Error(t('consumer.ordering.scheduleTooEarly', lng, { start: startLabel })),
        { name: 'ORDERING_SCHEDULE_TOO_EARLY', code: 'scheduleTooEarly' }
      )
    }
    return status
  }

  throw Object.assign(new Error(status.message || t('consumer.ordering.windowClosed', lng)), {
    name: 'ORDERING_WINDOW_CLOSED',
    code: 'windowClosed',
  })
}
