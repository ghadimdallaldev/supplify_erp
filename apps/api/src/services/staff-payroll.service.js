import { query } from '../lib/db.js'
import { getZonedDayBounds } from '../lib/reservation-board-date.js'
import { getRestaurantTimezone } from '../lib/tenant-timezone.js'

export function payrollQueryWindow(periodStart, periodEnd, timeZone) {
  if (!timeZone) {
    return {
      start: new Date(`${periodStart}T00:00:00.000Z`),
      end: new Date(`${periodEnd}T23:59:59.999Z`),
    }
  }
  return {
    start: getZonedDayBounds(periodStart, timeZone).start,
    end: getZonedDayBounds(periodEnd, timeZone).end,
  }
}

function entryHours(entry, periodEnd, now = new Date(), timeZone) {
  const clockIn = new Date(entry.clock_in_at)
  const periodCap = timeZone
    ? getZonedDayBounds(periodEnd, timeZone).end
    : new Date(`${periodEnd}T23:59:59.999Z`)
  const rawEnd = entry.clock_out_at ? new Date(entry.clock_out_at) : now
  const clockOutMs = Math.min(rawEnd.getTime(), periodCap.getTime())
  const breakMin = entry.break_minutes != null ? Number(entry.break_minutes) : 0
  const ms = clockOutMs - clockIn.getTime()
  return Math.max(0, ms / 3600000 - breakMin / 60)
}

export function buildPayrollPreview(rows, periodStart, periodEnd, now = new Date(), timeZone) {
  const byStaff = new Map()
  const byRole = new Map()
  let totalHours = 0
  let totalBreakMinutes = 0
  let estimatedCost = 0
  let hasOpenEntries = false
  let sawHourlyRate = false
  const staffMissingRate = []

  for (const row of rows) {
    if (!row.clock_out_at) hasOpenEntries = true
    const hours = entryHours(row, periodEnd, now, timeZone)
    if (hours <= 0) continue

    totalHours += hours
    totalBreakMinutes += row.break_minutes != null ? Number(row.break_minutes) : 0

    const staffId = row.staff_id
    let staffLine = byStaff.get(staffId)
    if (!staffLine) {
      staffLine = {
        staffId,
        staffName: row.display_name,
        role: row.role,
        wageType: row.wage_type,
        wageRate: row.wage_rate != null ? Number(row.wage_rate) : null,
        hours: 0,
        breakMinutes: 0,
        estimatedCost: null,
      }
      byStaff.set(staffId, staffLine)
    }
    staffLine.hours += hours
    staffLine.breakMinutes += row.break_minutes != null ? Number(row.break_minutes) : 0

    const roleKey = row.role || 'Unassigned'
    byRole.set(roleKey, (byRole.get(roleKey) || 0) + hours)

    if (row.wage_type === 'HOURLY') {
      if (row.wage_rate != null && row.wage_rate !== '') {
        sawHourlyRate = true
        const cost = hours * Number(row.wage_rate)
        staffLine.estimatedCost = (staffLine.estimatedCost || 0) + cost
        estimatedCost += cost
      } else if (!staffMissingRate.some((s) => s.staffId === staffId)) {
        staffMissingRate.push({ staffId, staffName: row.display_name })
      }
    }
  }

  const staffLines = [...byStaff.values()].map((line) => ({
    ...line,
    hours: Math.round(line.hours * 100) / 100,
    breakMinutes: Math.round(line.breakMinutes),
    estimatedCost: line.estimatedCost != null ? Math.round(line.estimatedCost * 100) / 100 : null,
  }))

  const byRoleLines = [...byRole.entries()].map(([role, hours]) => ({
    role,
    hours: Math.round(hours * 100) / 100,
  }))

  return {
    periodStart,
    periodEnd,
    totalHours: Math.round(totalHours * 100) / 100,
    totalBreakMinutes: Math.round(totalBreakMinutes),
    estimatedLabourCost: sawHourlyRate ? Math.round(estimatedCost * 100) / 100 : null,
    staffLines,
    byRole: byRoleLines,
    staffMissingRate,
    hasOpenEntries,
    note: hasOpenEntries
      ? 'Open time entries are included with caution — close entries before payroll-final export.'
      : null,
  }
}

export async function computePayrollPreview(restaurantId, periodStart, periodEnd) {
  const timeZone = await getRestaurantTimezone(restaurantId)
  const window = payrollQueryWindow(periodStart, periodEnd, timeZone)
  const { rows } = await query(
    `
      SELECT te.*, sm.display_name, sm.role, sm.wage_type, sm.wage_rate
      FROM staff_time_entry te
      JOIN staff_member sm ON sm.id = te.staff_id
      WHERE te.restaurant_id = $1
        AND te.clock_in_at >= $2
        AND te.clock_in_at <= $3
        AND te.status IN ('OPEN', 'APPROVED', 'LOCKED')
    `,
    [restaurantId, window.start.toISOString(), window.end.toISOString()]
  )
  return buildPayrollPreview(rows, periodStart, periodEnd, new Date(), timeZone)
}

export function previewToPayrollTotals(preview) {
  return {
    totalHours: preview.totalHours,
    totalBreakMinutes: preview.totalBreakMinutes,
    estimatedLabourCost: preview.estimatedLabourCost,
    staffLines: preview.staffLines,
    byRole: preview.byRole,
    staffMissingRate: preview.staffMissingRate,
    hasOpenEntries: preview.hasOpenEntries,
    note: preview.note,
  }
}
