import { describe, it, expect } from 'vitest'
import {
  buildLabourSummary,
  entryHoursOnDate,
  LATE_GRACE_MINUTES,
  OT_DAILY_THRESHOLD_HOURS,
} from './staff-labour-summary.service.js'

describe('staff-labour-summary.service', () => {
  const dateStr = '2026-06-11'
  const now = new Date('2026-06-11T10:00:00.000Z')

  it('returns zero counts for empty restaurant', () => {
    const summary = buildLabourSummary(
      {
        shiftsToday: [],
        openEntries: [],
        entriesToday: [],
        pendingPto: 0,
        pendingSwaps: 0,
        hourlyStaff: [],
        expiringDocs: [],
        staffMissingRate: [],
      },
      dateStr,
      now
    )
    expect(summary.counts.scheduledToday).toBe(0)
    expect(summary.counts.lateArrivals).toBeNull()
    expect(summary.alerts).toHaveLength(0)
    expect(summary.labourCostToday.available).toBe(false)
  })

  it('detects late arrival after grace period', () => {
    const summary = buildLabourSummary(
      {
        shiftsToday: [
          {
            id: 'shift-1',
            staff_id: 'staff-1',
            staff_name: 'Alex',
            role: 'Server',
            starts_at: new Date(
              now.getTime() - (LATE_GRACE_MINUTES + 10) * 60 * 1000
            ).toISOString(),
          },
        ],
        openEntries: [],
        entriesToday: [],
        pendingPto: 0,
        pendingSwaps: 0,
        hourlyStaff: [],
        expiringDocs: [],
        staffMissingRate: [],
      },
      dateStr,
      now
    )
    expect(summary.counts.lateArrivals).toBe(1)
    expect(summary.alerts.some((a) => a.id.startsWith('late-no-clock'))).toBe(true)
  })

  it('detects missed clock-out from prior day', () => {
    const summary = buildLabourSummary(
      {
        shiftsToday: [],
        openEntries: [
          {
            id: 'entry-1',
            staff_id: 'staff-1',
            staff_name: 'Alex',
            clock_in_at: '2026-06-10T15:00:00.000Z',
          },
        ],
        entriesToday: [],
        pendingPto: 0,
        pendingSwaps: 0,
        hourlyStaff: [],
        expiringDocs: [],
        staffMissingRate: [],
      },
      dateStr,
      now
    )
    expect(summary.counts.missedClockOuts).toBe(1)
    expect(summary.alerts.some((a) => a.severity === 'critical')).toBe(true)
  })

  it('computes hourly labour cost when rates exist', () => {
    const summary = buildLabourSummary(
      {
        shiftsToday: [],
        openEntries: [],
        entriesToday: [
          {
            id: 'entry-1',
            staff_id: 'staff-1',
            staff_name: 'Alex',
            clock_in_at: '2026-06-11T08:00:00.000Z',
            clock_out_at: '2026-06-11T12:00:00.000Z',
            break_minutes: 0,
          },
        ],
        pendingPto: 2,
        pendingSwaps: 1,
        hourlyStaff: [
          { id: 'staff-1', display_name: 'Alex', wage_type: 'HOURLY', wage_rate: '20' },
        ],
        expiringDocs: [],
        staffMissingRate: [],
      },
      dateStr,
      now
    )
    expect(summary.counts.pendingPto).toBe(2)
    expect(summary.counts.pendingSwaps).toBe(1)
    expect(summary.counts.estimatedLabourCostToday).toBe(80)
    expect(summary.labourCostToday.available).toBe(true)
  })

  it('flags overtime risk above daily threshold', () => {
    const hours = OT_DAILY_THRESHOLD_HOURS + 1
    const end = new Date(new Date('2026-06-11T08:00:00.000Z').getTime() + hours * 3600000)
    const summary = buildLabourSummary(
      {
        shiftsToday: [],
        openEntries: [],
        entriesToday: [
          {
            id: 'entry-1',
            staff_id: 'staff-1',
            staff_name: 'Alex',
            clock_in_at: '2026-06-11T08:00:00.000Z',
            clock_out_at: end.toISOString(),
            break_minutes: 0,
          },
        ],
        pendingPto: 0,
        pendingSwaps: 0,
        hourlyStaff: [
          { id: 'staff-1', display_name: 'Alex', wage_type: 'HOURLY', wage_rate: '15' },
        ],
        expiringDocs: [],
        staffMissingRate: [],
      },
      dateStr,
      now
    )
    expect(summary.overtimeRisk).toHaveLength(1)
    expect(summary.overtimeRisk[0].hoursWorked).toBeGreaterThan(OT_DAILY_THRESHOLD_HOURS)
  })

  it('entryHoursOnDate subtracts break minutes', () => {
    const hours = entryHoursOnDate(
      {
        clock_in_at: '2026-06-11T08:00:00.000Z',
        clock_out_at: '2026-06-11T12:00:00.000Z',
        break_minutes: 30,
      },
      dateStr,
      now
    )
    expect(hours).toBe(3.5)
  })
})
