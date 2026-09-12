import { describe, expect, it } from 'vitest'
import {
  getNextLiveOrderStart,
  isWithinLiveOrderWindow,
  resolveConsumerOrderingStatus,
  validateConsumerOrderSchedule,
} from './consumer-ordering-hours.js'

const config = {
  live_order_start: '12:00',
  live_order_end: '00:00',
  allow_preorders_outside_live_hours: true,
}

describe('consumer-ordering-hours', () => {
  it('allows live orders from 12:00 until midnight', () => {
    expect(isWithinLiveOrderWindow(new Date('2026-06-12T14:00:00'), '12:00', '00:00')).toBe(true)
    expect(isWithinLiveOrderWindow(new Date('2026-06-12T23:59:00'), '12:00', '00:00')).toBe(true)
    expect(isWithinLiveOrderWindow(new Date('2026-06-12T11:59:00'), '12:00', '00:00')).toBe(false)
    expect(isWithinLiveOrderWindow(new Date('2026-06-12T02:00:00'), '12:00', '00:00')).toBe(false)
  })

  it('resolves PREORDER_ONLY outside live window', () => {
    const status = resolveConsumerOrderingStatus(config, new Date('2026-06-12T08:30:00'))
    expect(status.mode).toBe('PREORDER_ONLY')
    expect(status.allowAsap).toBe(false)
    expect(status.nextLiveOrderAt).toBeTruthy()
  })

  it('next live start is same day before noon', () => {
    const next = getNextLiveOrderStart(new Date('2026-06-12T08:00:00'), '12:00')
    expect(next.getHours()).toBe(12)
    expect(next.getDate()).toBe(12)
  })

  it('requires scheduled time during preorder-only window', () => {
    expect(() =>
      validateConsumerOrderSchedule(config, null, new Date('2026-06-12T08:00:00'))
    ).toThrow(/schedule/i)
  })

  it('accepts preorder at or after next live opening', () => {
    const now = new Date('2026-06-12T08:00:00')
    const status = validateConsumerOrderSchedule(config, '2026-06-12T12:30:00', now)
    expect(status.mode).toBe('PREORDER_ONLY')
  })

  it('allows ASAP during live window', () => {
    const status = validateConsumerOrderSchedule(config, null, new Date('2026-06-12T15:00:00'))
    expect(status.mode).toBe('LIVE')
  })
})
