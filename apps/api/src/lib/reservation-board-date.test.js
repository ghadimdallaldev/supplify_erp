import { describe, expect, it } from 'vitest'
import { getLocalDayBounds, parseBoardDateParam } from './reservation-board-date.js'

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
})
