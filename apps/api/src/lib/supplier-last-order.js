/**
 * Resolve next eligible delivery date from supplier last-order rules.
 *
 * Modes:
 * - none: no cutoff; requested date kept (or tomorrow if missing/past)
 * - cutoff + absolute_time: after HH:mm local, roll forward rolloverDays
 * - cutoff + minutes_before_window: within N minutes of delivery day start (00:00), roll forward
 */
export function parseClockToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

function startOfLocalDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {object} settings
 * @param {string} [settings.lastOrderMode]
 * @param {string|null} [settings.lastOrderCutoffType]
 * @param {string|null} [settings.lastOrderCutoffTime]
 * @param {number|null} [settings.lastOrderCutoffMinutes]
 * @param {number} [settings.lastOrderRolloverDays]
 * @param {Date|string|null} [requestedDeliveryDate]
 * @param {Date} [now]
 */
export function resolveSupplierDeliveryDate(
  settings,
  requestedDeliveryDate = null,
  now = new Date()
) {
  const mode = settings?.lastOrderMode || settings?.last_order_mode || 'none'
  const rolloverDays = Math.max(
    1,
    Number(settings?.lastOrderRolloverDays ?? settings?.last_order_rollover_days ?? 1) || 1
  )

  const today = startOfLocalDay(now)
  let requested = requestedDeliveryDate ? startOfLocalDay(new Date(requestedDeliveryDate)) : null
  if (!requested || Number.isNaN(requested.getTime()) || requested < today) {
    requested = addDays(today, 1)
  }

  if (mode !== 'cutoff') {
    return {
      deliveryDate: toYmd(requested),
      rolled: false,
      reason: 'no_cutoff',
      mode: 'none',
    }
  }

  const cutoffType =
    settings?.lastOrderCutoffType || settings?.last_order_cutoff_type || 'absolute_time'
  let pastCutoff = false

  if (cutoffType === 'minutes_before_window') {
    const minutes = Number(
      settings?.lastOrderCutoffMinutes ?? settings?.last_order_cutoff_minutes ?? 30
    )
    const windowStart = startOfLocalDay(requested)
    const cutoffAt = new Date(windowStart.getTime() - minutes * 60 * 1000)
    pastCutoff = now > cutoffAt
  } else {
    const cutoffMinutes = parseClockToMinutes(
      settings?.lastOrderCutoffTime || settings?.last_order_cutoff_time || '15:00'
    )
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    // If ordering for tomorrow (or later) and still before today's cutoff, OK.
    // If ordering for tomorrow and past today's cutoff, roll.
    // If ordering for day after tomorrow+, allow unless somehow past a same-day rule.
    const daysUntil = Math.round((requested.getTime() - today.getTime()) / 86400000)
    if (daysUntil <= 1) {
      pastCutoff = cutoffMinutes != null ? nowMinutes > cutoffMinutes : false
    } else {
      pastCutoff = false
    }
  }

  if (!pastCutoff) {
    return {
      deliveryDate: toYmd(requested),
      rolled: false,
      reason: 'before_cutoff',
      mode: 'cutoff',
    }
  }

  const rolledDate = addDays(requested, rolloverDays)
  return {
    deliveryDate: toYmd(rolledDate),
    rolled: true,
    reason: 'past_cutoff',
    mode: 'cutoff',
    rolloverDays,
  }
}
