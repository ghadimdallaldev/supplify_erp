import { describe, expect, it } from 'vitest'
import {
  getLocalDayBounds,
  getZonedDayBounds,
  parseBoardDateParam,
} from './reservation-board-date.js'

describe('reservation-board-date', () => {
  it('keeps YYYY-MM-DD without UTC shift', () => {
    expect(parseBoardDateParam('2026-05-28')).toBe('2026-05-28')
  })

  it('builds local midnight bounds for a calendar day', () => {
    const { start, end } = getLocalDayBounds('2026-05-28')
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(4)
    expect(start.getDate()).toBe(28)
    expect(start.getHours()).toBe(0)
    expect(end.getDate()).toBe(28)
    expect(end.getHours()).toBe(23)
  })

  it('starts a Beirut calendar day at local midnight, not UTC midnight', () => {
    const { start, end } = getZonedDayBounds('2026-09-25', 'Asia/Beirut')
    expect(start.toISOString()).toBe('2026-09-24T21:00:00.000Z')
    expect(end.toISOString()).toBe('2026-09-25T20:59:59.999Z')
  })
})
