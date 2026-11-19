import { describe, it, expect } from 'vitest'
import { resolveSupplierDeliveryDate, parseClockToMinutes } from './supplier-last-order.js'

describe('supplier-last-order', () => {
  it('uses the first available delivery-day time when midnight is skipped', () => {
    expect(
      resolveSupplierDeliveryDate(
        {
          last_order_mode: 'cutoff',
          last_order_cutoff_type: 'minutes_before_window',
          last_order_cutoff_minutes: 30,
          last_order_timezone: 'Asia/Beirut',
        },
        '2026-03-29',
        new Date('2026-03-28T21:15:00Z')
      )
    ).toMatchObject({ deliveryDate: '2026-03-29', rolled: false })
  })
  it.each([
    ['Asia/Tokyo', '2026-09-10T07:00:00Z', '2026-09-12', true],
    ['America/Los_Angeles', '2026-09-10T20:00:00Z', '2026-09-11', false],
  ])('uses %s for the supplier cutoff clock', (timeZone, instant, day, rolled) => {
    const result = resolveSupplierDeliveryDate(
      {
        lastOrderMode: 'cutoff',
        lastOrderCutoffType: 'absolute_time',
        lastOrderCutoffTime: '15:00',
        lastOrderTimezone: timeZone,
      },
      '2026-09-11',
      new Date(instant)
    )
    expect(result).toMatchObject({ deliveryDate: day, rolled })
  })

  it('keeps a valid requested day that is still today for the supplier', () => {
    const result = resolveSupplierDeliveryDate(
      {
        last_order_mode: 'none',
        last_order_timezone: 'America/Los_Angeles',
      },
      '2026-09-10',
      new Date('2026-09-11T02:00:00Z')
    )
    expect(result.deliveryDate).toBe('2026-09-10')
  })

  it('defaults an omitted day from the supplier calendar', () => {
    const result = resolveSupplierDeliveryDate(
      {
        last_order_mode: 'none',
        last_order_timezone: 'Asia/Tokyo',
      },
      null,
      new Date('2026-09-10T22:00:00Z')
    )
    expect(result.deliveryDate).toBe('2026-09-12')
  })

  it.each([
    ['2026-11-01T05:00:00.000Z', false, '2026-11-02'],
    ['2026-11-01T05:00:00.001Z', true, '2026-11-03'],
  ])('uses the zoned delivery midnight across DST at %s', (instant, rolled, day) => {
    const result = resolveSupplierDeliveryDate(
      {
        last_order_mode: 'cutoff',
        last_order_cutoff_type: 'minutes_before_window',
        last_order_cutoff_minutes: 1440,
        last_order_timezone: 'America/New_York',
      },
      '2026-11-02',
      new Date(instant)
    )
    expect(result).toMatchObject({ deliveryDate: day, rolled })
  })

  it('preserves a calendar literal in a western supplier timezone', () => {
    expect(
      resolveSupplierDeliveryDate(
        { lastOrderTimezone: 'America/Los_Angeles' },
        '2026-09-11',
        new Date('2026-09-10T12:00:00Z')
      ).deliveryDate
    ).toBe('2026-09-11')
  })

  it('parses clock times', () => {
    expect(parseClockToMinutes('15:30')).toBe(15 * 60 + 30)
    expect(parseClockToMinutes('bad')).toBeNull()
  })

  it('allows anytime when mode is none', () => {
    const now = new Date('2026-09-10T20:00:00Z')
    const result = resolveSupplierDeliveryDate(
      { lastOrderMode: 'none', lastOrderTimezone: 'UTC' },
      '2026-09-11',
      now
    )
    expect(result.deliveryDate).toBe('2026-09-11')
    expect(result.rolled).toBe(false)
  })

  it('rolls tomorrow delivery when past absolute cutoff', () => {
    const now = new Date('2026-09-10T16:00:00Z')
    const result = resolveSupplierDeliveryDate(
      {
        lastOrderMode: 'cutoff',
        lastOrderCutoffType: 'absolute_time',
        lastOrderCutoffTime: '15:00',
        lastOrderRolloverDays: 1,
        lastOrderTimezone: 'UTC',
      },
      '2026-09-11',
      now
    )
    expect(result.rolled).toBe(true)
    expect(result.deliveryDate).toBe('2026-09-12')
  })

  it('keeps tomorrow when before cutoff', () => {
    const now = new Date('2026-09-10T14:00:00Z')
    const result = resolveSupplierDeliveryDate(
      {
        lastOrderMode: 'cutoff',
        lastOrderCutoffType: 'absolute_time',
        lastOrderCutoffTime: '15:00',
        lastOrderRolloverDays: 2,
        lastOrderTimezone: 'UTC',
      },
      '2026-09-11',
      now
    )
    expect(result.rolled).toBe(false)
    expect(result.deliveryDate).toBe('2026-09-11')
  })

  it('rolls by minutes_before_window', () => {
    const now = new Date('2026-09-10T23:45:00Z')
    const result = resolveSupplierDeliveryDate(
      {
        lastOrderMode: 'cutoff',
        lastOrderCutoffType: 'minutes_before_window',
        lastOrderCutoffMinutes: 30,
        lastOrderRolloverDays: 1,
        lastOrderTimezone: 'UTC',
      },
      '2026-09-11',
      now
    )
    expect(result.rolled).toBe(true)
    expect(result.deliveryDate).toBe('2026-09-12')
  })
})
