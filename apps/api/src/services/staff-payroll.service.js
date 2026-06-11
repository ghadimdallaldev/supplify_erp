import { query } from '../lib/db.js'

function entryHours(entry, periodEnd) {
  const clockIn = new Date(entry.clock_in_at)
  const clockOut = entry.clock_out_at ? new Date(entry.clock_out_at) : new Date(periodEnd)
  const breakMin = entry.break_minutes != null ? Number(entry.break_minutes) : 0
  const ms = clockOut.getTime() - clockIn.getTime()
  return Math.max(0, ms / 3600000 - breakMin / 60)
}

export function buildPayrollPreview(rows, periodStart, periodEnd) {
  const byStaff = new Map()
  const byRole = new Map()
  let totalHours = 0
  let totalBreakMinutes = 0
  let estimatedCost = 0
  let hasOpenEntries = false
  const staffMissingRate = []

  for (const row of rows) {
    if (!row.clock_out_at) hasOpenEntries = true
    const hours = entryHours(row, `${periodEnd}T23:59:59.999Z`)
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
      if (row.wage_rate != null && Number(row.wage_rate) > 0) {
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
    estimatedLabourCost: estimatedCost > 0 ? Math.round(estimatedCost * 100) / 100 : null,
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
  const { rows } = await query(
    `
      SELECT te.*, sm.display_name, sm.role, sm.wage_type, sm.wage_rate
      FROM staff_time_entry te
      JOIN staff_member sm ON sm.id = te.staff_id
      WHERE te.restaurant_id = $1
        AND te.clock_in_at >= $2::date
        AND te.clock_in_at < ($3::date + interval '1 day')
        AND te.status IN ('OPEN', 'APPROVED', 'LOCKED')
    `,
    [restaurantId, periodStart, periodEnd]
  )
  return buildPayrollPreview(rows, periodStart, periodEnd)
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
