import { describe, it, expect } from 'vitest'
import { resolveSupplierDeliveryDate, parseClockToMinutes } from './supplier-last-order.js'

describe('supplier-last-order', () => {
  it('parses clock times', () => {
    expect(parseClockToMinutes('15:30')).toBe(15 * 60 + 30)
    expect(parseClockToMinutes('bad')).toBeNull()
  })

  it('allows anytime when mode is none', () => {
    const now = new Date('2026-09-10T20:00:00')
    const result = resolveSupplierDeliveryDate({ lastOrderMode: 'none' }, '2026-09-11', now)
    expect(result.deliveryDate).toBe('2026-09-11')
    expect(result.rolled).toBe(false)
  })

  it('rolls tomorrow delivery when past absolute cutoff', () => {
    const now = new Date('2026-09-10T16:00:00')
    const result = resolveSupplierDeliveryDate(
      {
        lastOrderMode: 'cutoff',
        lastOrderCutoffType: 'absolute_time',
        lastOrderCutoffTime: '15:00',
        lastOrderRolloverDays: 1,
      },
      '2026-09-11',
      now
    )
    expect(result.rolled).toBe(true)
    expect(result.deliveryDate).toBe('2026-09-12')
  })

  it('keeps tomorrow when before cutoff', () => {
    const now = new Date('2026-09-10T14:00:00')
    const result = resolveSupplierDeliveryDate(
      {
        lastOrderMode: 'cutoff',
        lastOrderCutoffType: 'absolute_time',
        lastOrderCutoffTime: '15:00',
        lastOrderRolloverDays: 2,
      },
      '2026-09-11',
      now
    )
    expect(result.rolled).toBe(false)
    expect(result.deliveryDate).toBe('2026-09-11')
  })

  it('rolls by minutes_before_window', () => {
    const now = new Date('2026-09-10T23:45:00')
    const result = resolveSupplierDeliveryDate(
      {
        lastOrderMode: 'cutoff',
        lastOrderCutoffType: 'minutes_before_window',
        lastOrderCutoffMinutes: 30,
        lastOrderRolloverDays: 1,
      },
      '2026-09-11',
      now
    )
    expect(result.rolled).toBe(true)
    expect(result.deliveryDate).toBe('2026-09-12')
  })
})
