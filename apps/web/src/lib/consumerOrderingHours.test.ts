import { describe, expect, it } from 'vitest'
import { isWithinLiveOrderWindow, scheduledInstant } from './consumerOrderingHours'

describe('scheduled guest order clock', () => {
  it('reads 7:00 p.m. as Beirut time, not the browser clock', () => {
    const instant = scheduledInstant('2026-09-25T19:00', 'Asia/Beirut')
    expect(instant.toISOString()).toBe('2026-09-25T16:00:00.000Z')
    expect(isWithinLiveOrderWindow(instant, '12:00', '00:00', 'Asia/Beirut')).toBe(true)
    expect(isWithinLiveOrderWindow(instant, '20:00', '23:00', 'Asia/Beirut')).toBe(false)
  })
})
