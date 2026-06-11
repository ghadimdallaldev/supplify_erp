import { query } from '../lib/db.js'

/** Operational grace — not a legal lateness policy. */
export const LATE_GRACE_MINUTES = 5
/** Simple daily hours heuristic — not legal overtime rules. */
export const OT_DAILY_THRESHOLD_HOURS = 8
export const EXPIRING_DOC_DAYS = 14

function parseDateStart(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

function parseDateEndExclusive(dateStr) {
  const d = parseDateStart(dateStr)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

export function entryHoursOnDate(entry, dateStr, now = new Date()) {
  const dayStart = parseDateStart(dateStr)
  const dayEnd = parseDateEndExclusive(dateStr)
  const clockIn = new Date(entry.clock_in_at)
  const clockOut = entry.clock_out_at ? new Date(entry.clock_out_at) : now
  const start = clockIn < dayStart ? dayStart : clockIn
  const end = clockOut > dayEnd ? dayEnd : clockOut
  if (end <= start) return 0
  const breakMin = entry.break_minutes != null ? Number(entry.break_minutes) : 0
  return Math.max(0, (end.getTime() - start.getTime()) / 3600000 - breakMin / 60)
}

export function buildLabourSummary(raw, dateStr, now = new Date()) {
  const {
    shiftsToday = [],
    openEntries = [],
    entriesToday = [],
    pendingPto = 0,
    pendingSwaps = 0,
    hourlyStaff = [],
    expiringDocs = [],
    staffMissingRate = [],
  } = raw

  const assignedShifts = shiftsToday.filter((s) => s.staff_id)
  const lateDetectionAvailable = assignedShifts.length > 0

  const clockInsByStaff = new Map()
  for (const entry of entriesToday) {
    const existing = clockInsByStaff.get(entry.staff_id)
    const clockIn = new Date(entry.clock_in_at)
    if (!existing || clockIn < new Date(existing.clock_in_at)) {
      clockInsByStaff.set(entry.staff_id, entry)
    }
  }

  const alerts = []
  let lateCount = 0
  const graceMs = LATE_GRACE_MINUTES * 60 * 1000

  for (const shift of assignedShifts) {
    const startsAt = new Date(shift.starts_at)
    const deadline = new Date(startsAt.getTime() + graceMs)
    if (now < deadline) continue

    const firstEntry = clockInsByStaff.get(shift.staff_id)
    const staffName = shift.staff_name || 'Team member'
    if (!firstEntry) {
      lateCount += 1
      alerts.push({
        id: `late-no-clock-${shift.id}`,
        severity: 'warning',
        title: 'Late for shift',
        message: `${staffName} has not clocked in for ${shift.role} shift.`,
        staffId: shift.staff_id,
        deepLinkTab: 'schedule',
      })
    } else if (new Date(firstEntry.clock_in_at).getTime() > deadline.getTime()) {
      lateCount += 1
      alerts.push({
        id: `late-clock-${shift.id}`,
        severity: 'warning',
        title: 'Late arrival',
        message: `${staffName} clocked in late for ${shift.role} shift.`,
        staffId: shift.staff_id,
        deepLinkTab: 'schedule',
      })
    }
  }

  const dayStart = parseDateStart(dateStr)
  let missedClockOuts = 0
  for (const entry of openEntries) {
    const clockIn = new Date(entry.clock_in_at)
    if (clockIn < dayStart) {
      missedClockOuts += 1
      alerts.push({
        id: `missed-out-${entry.id}`,
        severity: 'critical',
        title: 'Forgot to clock out',
        message: `${entry.staff_name || 'Team member'} has an open entry from a prior day.`,
        staffId: entry.staff_id,
        deepLinkTab: 'team',
      })
    }
  }

  const shiftStaffToday = new Set(shiftsToday.filter((s) => s.staff_id).map((s) => s.staff_id))
  for (const entry of openEntries) {
    const clockIn = new Date(entry.clock_in_at)
    if (clockIn >= dayStart && !shiftStaffToday.has(entry.staff_id)) {
      alerts.push({
        id: `no-shift-${entry.id}`,
        severity: 'info',
        title: 'Clocked in, no shift',
        message: `${entry.staff_name || 'Team member'} is clocked in without a published shift today.`,
        staffId: entry.staff_id,
        deepLinkTab: 'schedule',
      })
    }
  }

  if (pendingPto > 0) {
    alerts.push({
      id: 'pending-pto',
      severity: 'warning',
      title: 'Pending PTO',
      message: `${pendingPto} time-off request(s) awaiting decision.`,
      deepLinkTab: 'pto',
    })
  }

  if (pendingSwaps > 0) {
    alerts.push({
      id: 'pending-swaps',
      severity: 'warning',
      title: 'Pending shift swaps',
      message: `${pendingSwaps} swap request(s) awaiting decision.`,
      deepLinkTab: 'schedule',
    })
  }

  for (const staff of staffMissingRate) {
    alerts.push({
      id: `missing-rate-${staff.id}`,
      severity: 'warning',
      title: 'Missing wage rate',
      message: `${staff.display_name} is hourly but has no wage rate.`,
      staffId: staff.id,
      deepLinkTab: 'team',
    })
  }

  for (const doc of expiringDocs) {
    alerts.push({
      id: `expiring-doc-${doc.id}`,
      severity: 'info',
      title: 'Expiring document',
      message: `${doc.title || doc.doc_type} for ${doc.staff_name} expires soon.`,
      staffId: doc.staff_id,
      deepLinkTab: 'documents',
    })
  }

  const hourlyWithRate = hourlyStaff.filter(
    (s) => s.wage_type === 'HOURLY' && s.wage_rate != null && Number(s.wage_rate) > 0
  )
  const labourCostAvailable = hourlyWithRate.length > 0

  let estimatedCost = 0
  const hoursByStaff = new Map()

  for (const entry of entriesToday) {
    const hours = entryHoursOnDate(entry, dateStr, now)
    if (hours <= 0) continue
    hoursByStaff.set(entry.staff_id, (hoursByStaff.get(entry.staff_id) || 0) + hours)
  }
  for (const entry of openEntries) {
    if (entriesToday.some((e) => e.id === entry.id)) continue
    const hours = entryHoursOnDate(entry, dateStr, now)
    if (hours <= 0) continue
    hoursByStaff.set(entry.staff_id, (hoursByStaff.get(entry.staff_id) || 0) + hours)
  }

  const staffRateMap = new Map(hourlyWithRate.map((s) => [s.id, Number(s.wage_rate)]))
  for (const [staffId, hours] of hoursByStaff) {
    const rate = staffRateMap.get(staffId)
    if (rate != null) estimatedCost += hours * rate
  }

  const overtimeRisk = []
  for (const [staffId, hours] of hoursByStaff) {
    if (hours > OT_DAILY_THRESHOLD_HOURS) {
      const staff = hourlyStaff.find((s) => s.id === staffId)
      overtimeRisk.push({
        staffId,
        staffName: staff?.display_name || 'Team member',
        hoursWorked: Math.round(hours * 100) / 100,
      })
    }
  }

  const clockedInNow = openEntries.filter((e) => {
    const clockIn = new Date(e.clock_in_at)
    return clockIn >= dayStart
  }).length

  return {
    date: dateStr,
    counts: {
      scheduledToday: shiftsToday.length,
      clockedInNow,
      lateArrivals: lateDetectionAvailable ? lateCount : null,
      missedClockOuts,
      pendingPto,
      pendingSwaps,
      estimatedLabourCostToday: labourCostAvailable ? Math.round(estimatedCost * 100) / 100 : null,
      overtimeRiskCount:
        overtimeRisk.length > 0 ? overtimeRisk.length : entriesToday.length ? 0 : null,
    },
    labourCostToday: labourCostAvailable
      ? { available: true, amount: Math.round(estimatedCost * 100) / 100 }
      : { available: false },
    overtimeRisk: overtimeRisk.length ? overtimeRisk : null,
    alerts,
    meta: {
      lateDetectionAvailable,
      labourCostAvailable,
      openEntriesIncluded: true,
    },
  }
}

export async function fetchLabourSummary(restaurantId, dateStr) {
  const dayEnd = parseDateEndExclusive(dateStr)

  const [
    shiftsResult,
    openEntriesResult,
    entriesTodayResult,
    ptoResult,
    swapsResult,
    staffResult,
    docsResult,
  ] = await Promise.all([
    query(
      `
        SELECT sh.*, sm.display_name AS staff_name
        FROM staff_shift sh
        LEFT JOIN staff_member sm ON sm.id = sh.staff_id
        WHERE sh.restaurant_id = $1
          AND sh.shift_date = $2::date
          AND sh.status IN ('PUBLISHED', 'COMPLETED')
      `,
      [restaurantId, dateStr]
    ),
    query(
      `
        SELECT te.*, sm.display_name AS staff_name
        FROM staff_time_entry te
        JOIN staff_member sm ON sm.id = te.staff_id
        WHERE te.restaurant_id = $1 AND te.clock_out_at IS NULL
      `,
      [restaurantId]
    ),
    query(
      `
        SELECT te.*, sm.display_name AS staff_name, sm.wage_type, sm.wage_rate
        FROM staff_time_entry te
        JOIN staff_member sm ON sm.id = te.staff_id
        WHERE te.restaurant_id = $1
          AND te.clock_in_at >= $2::timestamptz
          AND te.clock_in_at < $3::timestamptz
      `,
      [restaurantId, `${dateStr}T00:00:00.000Z`, dayEnd.toISOString()]
    ),
    query(
      `
        SELECT COUNT(*)::int AS count
        FROM staff_pto_request
        WHERE restaurant_id = $1 AND status = 'PENDING'
      `,
      [restaurantId]
    ),
    query(
      `
        SELECT COUNT(*)::int AS count
        FROM staff_shift_swap
        WHERE restaurant_id = $1 AND status = 'REQUESTED'
      `,
      [restaurantId]
    ),
    query(
      `
        SELECT id, display_name, wage_type, wage_rate
        FROM staff_member
        WHERE restaurant_id = $1 AND status = 'ACTIVE'
      `,
      [restaurantId]
    ),
    query(
      `
        SELECT d.id, d.title, d.doc_type, d.staff_id, sm.display_name AS staff_name
        FROM staff_document d
        JOIN staff_member sm ON sm.id = d.staff_id
        WHERE d.restaurant_id = $1
          AND d.status = 'ACTIVE'
          AND d.expires_at IS NOT NULL
          AND d.expires_at <= (CURRENT_DATE + $2::int)
          AND d.expires_at >= CURRENT_DATE
      `,
      [restaurantId, EXPIRING_DOC_DAYS]
    ),
  ])

  const hourlyStaff = staffResult.rows
  const staffMissingRate = hourlyStaff.filter(
    (s) => s.wage_type === 'HOURLY' && (s.wage_rate == null || Number(s.wage_rate) <= 0)
  )

  return buildLabourSummary(
    {
      shiftsToday: shiftsResult.rows,
      openEntries: openEntriesResult.rows,
      entriesToday: entriesTodayResult.rows,
      pendingPto: ptoResult.rows[0]?.count ?? 0,
      pendingSwaps: swapsResult.rows[0]?.count ?? 0,
      hourlyStaff,
      expiringDocs: docsResult.rows,
      staffMissingRate,
    },
    dateStr
  )
}
