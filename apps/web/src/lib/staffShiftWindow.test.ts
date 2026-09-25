import { describe, expect, it } from 'vitest'
import { resolveStaffShiftWindow } from './staffShiftWindow'

describe('resolveStaffShiftWindow', () => {
  it('keeps a same-day shift on that date', () => {
    const window = resolveStaffShiftWindow('2026-09-25', '09:00', '17:00')
    if ('error' in window) throw new Error(window.error)
    expect(window.endsAt.getTime() - window.startsAt.getTime()).toBe(8 * 60 * 60 * 1000)
  })

  it('rolls a closing shift into the next day', () => {
    const window = resolveStaffShiftWindow('2026-09-25', '22:00', '02:00')
    if ('error' in window) throw new Error(window.error)
    expect(window.endsAt.getTime() - window.startsAt.getTime()).toBe(4 * 60 * 60 * 1000)
  })

  it('rejects a shift that starts and ends at the same time', () => {
    expect(resolveStaffShiftWindow('2026-09-25', '10:00', '10:00')).toEqual({ error: 'same' })
  })
})
