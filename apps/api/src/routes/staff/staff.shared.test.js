import { describe, expect, it } from 'vitest'
import {
  getInactiveStaffError,
  openTimeEntryConflictError,
  getPtoDateError,
  getShiftWindowError,
  getSwapCreateError,
  getSwapDecisionError,
  getTimeEntryCloseError,
  mapStaffRow,
  timeOffOverlapsShift,
} from './staff.shared.js'

describe('getShiftWindowError', () => {
  it('rejects an end time that is not after the start', () => {
    expect(getShiftWindowError('2026-09-25T18:00:00.000Z', '2026-09-25T18:00:00.000Z')).toMatch(
      /after the start/
    )
  })

  it('accepts a normal shift window', () => {
    expect(getShiftWindowError('2026-09-25T09:00:00.000Z', '2026-09-25T17:00:00.000Z')).toBeNull()
  })

  it('rejects a clock-out that is not after clock-in', () => {
    const now = new Date('2026-09-25T18:00:00.000Z')
    expect(
      getTimeEntryCloseError('2026-09-25T17:00:00.000Z', '2026-09-25T16:00:00.000Z', 0, now)
    ).toMatch(/after clock-in/)
  })

  it('treats approved time off and a shift on the same day as a conflict', () => {
    expect(timeOffOverlapsShift('2026-09-25', '2026-09-26', '2026-09-26', '2026-09-26')).toBe(true)
    expect(timeOffOverlapsShift('2026-09-25', '2026-09-25', '2026-09-26', '2026-09-26')).toBe(false)
  })

  it('only lets the person on an open shift request a swap', () => {
    expect(
      getSwapCreateError({
        shiftStatus: 'SCHEDULED',
        shiftStaffId: 'staff-1',
        requestedBy: 'staff-2',
      })
    ).toMatch(/person on this shift/)
    expect(
      getSwapCreateError({
        shiftStatus: 'CANCELLED',
        shiftStaffId: 'staff-1',
        requestedBy: 'staff-1',
      })
    ).toMatch(/cancelled/)
    expect(
      getSwapDecisionError({ status: 'COMPLETED', proposed_cover_id: 'staff-2' }, 'APPROVED')
    ).toMatch(/already been decided/)
    expect(
      getSwapDecisionError({ status: 'REQUESTED', proposed_cover_id: null }, 'APPROVED')
    ).toMatch(/cover this shift/)
  })

  it('turns a second open punch into the existing clock-in conflict', () => {
    const conflict = openTimeEntryConflictError({ code: '23505' })
    expect(conflict?.name).toBe('TIME_ENTRY_OPEN_EXISTS')
    expect(conflict?.status).toBe(409)
    expect(openTimeEntryConflictError({ code: '23503' })).toBeNull()
  })

  it('rejects a person who is no longer active', () => {
    expect(getInactiveStaffError('ACTIVE')).toBeNull()
    expect(getInactiveStaffError('ARCHIVED')).toMatch(/active team/)
  })

  it('keeps an hourly rate of zero', () => {
    const row = mapStaffRow({
      id: 's1',
      restaurant_id: 'r1',
      status: 'ACTIVE',
      first_name: 'Amina',
      last_name: 'Haddad',
      wage_type: 'HOURLY',
      wage_rate: 0,
    })
    expect(row.wageRate).toBe(0)
  })

  it('rejects time off that ends before it starts', () => {
    expect(getPtoDateError('2026-09-28', '2026-09-25')).toMatch(/end before/)
    expect(getPtoDateError('2026-09-25', '2026-09-25')).toBeNull()
  })

  it('rejects a break longer than the shift', () => {
    const now = new Date('2026-09-25T18:00:00.000Z')
    expect(
      getTimeEntryCloseError('2026-09-25T16:00:00.000Z', '2026-09-25T17:00:00.000Z', 90, now)
    ).toMatch(/Break cannot be longer/)
  })
})
