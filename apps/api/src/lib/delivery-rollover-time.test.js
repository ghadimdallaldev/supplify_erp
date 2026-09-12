import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  getZonedParts,
  isDeliveryDateEligibleForRollover,
} from './delivery-rollover-time.js'

describe('delivery-rollover-time', () => {
  it('adds calendar days', () => {
    expect(addCalendarDays('2026-06-08', 1)).toBe('2026-06-09')
  })

  it('marks past delivery dates eligible', () => {
    const now = new Date('2026-06-09T10:00:00Z')
    expect(
      isDeliveryDateEligibleForRollover({
        effectiveDeliveryDate: '2026-06-08',
        now,
        timeZone: 'Asia/Beirut',
        cutoffHour: 3,
      })
    ).toBe(true)
  })

  it('marks same-day before cutoff ineligible', () => {
    const parts = getZonedParts(new Date('2026-06-09T00:30:00Z'), 'Asia/Beirut')
    const now = new Date('2026-06-09T00:30:00Z')
    if (parts.hour < 3) {
      expect(
        isDeliveryDateEligibleForRollover({
          effectiveDeliveryDate: parts.calendarDate,
          now,
          timeZone: 'Asia/Beirut',
          cutoffHour: 3,
        })
      ).toBe(false)
    }
  })
})
