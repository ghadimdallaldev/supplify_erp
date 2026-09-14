import { describe, expect, it } from 'vitest'
import {
  assertValidOrderStatusTransition,
  requiresDriverAssignment,
} from './order-status-transitions.js'
import { ValidationError } from '../middlewares/errorHandler.js'

describe('order-status-transitions', () => {
  it('allows restaurant cancel from early fulfillment statuses', () => {
    expect(() =>
      assertValidOrderStatusTransition({ role: 'RESTAURANT', from: 'PLACED', to: 'CANCELLED' })
    ).not.toThrow()
    expect(() =>
      assertValidOrderStatusTransition({
        role: 'RESTAURANT',
        from: 'ACKNOWLEDGED',
        to: 'CANCELLED',
      })
    ).not.toThrow()
    expect(() =>
      assertValidOrderStatusTransition({
        role: 'RESTAURANT',
        from: 'PROCESSING',
        to: 'CANCELLED',
      })
    ).not.toThrow()
  })

  it('denies restaurant cancel after dispatch or receiving', () => {
    for (const from of ['SHIPPED', 'DELIVERED', 'RECEIVED_FULL', 'INVOICED']) {
      expect(() =>
        assertValidOrderStatusTransition({ role: 'RESTAURANT', from, to: 'CANCELLED' })
      ).toThrow(ValidationError)
    }
  })

  it('allows supplier forward progression only', () => {
    expect(() =>
      assertValidOrderStatusTransition({ role: 'SUPPLIER', from: 'PLACED', to: 'ACKNOWLEDGED' })
    ).not.toThrow()
    expect(() =>
      assertValidOrderStatusTransition({ role: 'SUPPLIER', from: 'ACKNOWLEDGED', to: 'PROCESSING' })
    ).not.toThrow()
    expect(() =>
      assertValidOrderStatusTransition({ role: 'SUPPLIER', from: 'PROCESSING', to: 'SHIPPED' })
    ).not.toThrow()
    expect(() =>
      assertValidOrderStatusTransition({ role: 'SUPPLIER', from: 'SHIPPED', to: 'DELIVERED' })
    ).not.toThrow()
  })

  it('denies supplier reverse or skip transitions', () => {
    expect(() =>
      assertValidOrderStatusTransition({ role: 'SUPPLIER', from: 'SHIPPED', to: 'PROCESSING' })
    ).toThrow(ValidationError)
    expect(() =>
      assertValidOrderStatusTransition({ role: 'SUPPLIER', from: 'PLACED', to: 'DELIVERED' })
    ).toThrow(ValidationError)
  })

  it('allows supplier decline from documented pre-delivery states', () => {
    for (const from of ['PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED']) {
      expect(() =>
        assertValidOrderStatusTransition({ role: 'SUPPLIER', from, to: 'CANCELLED' })
      ).not.toThrow()
    }
  })

  it('allows legacy COMPLETED path only after shipping', () => {
    expect(() =>
      assertValidOrderStatusTransition({
        role: 'SUPPLIER',
        from: 'SHIPPED',
        to: 'DELIVERED',
        legacyCompleted: true,
      })
    ).not.toThrow()
    expect(() =>
      assertValidOrderStatusTransition({
        role: 'SUPPLIER',
        from: 'PROCESSING',
        to: 'DELIVERED',
        legacyCompleted: true,
      })
    ).toThrow(ValidationError)
  })

  it('requires a driver for shipping and delivery status changes', () => {
    expect(requiresDriverAssignment('SHIPPED')).toBe(true)
    expect(requiresDriverAssignment('DELIVERED')).toBe(true)
    expect(requiresDriverAssignment('COMPLETED')).toBe(true)
    expect(requiresDriverAssignment('PROCESSING')).toBe(false)
  })

  it('blocks transitions from terminal statuses', () => {
    expect(() =>
      assertValidOrderStatusTransition({ role: 'SUPPLIER', from: 'CANCELLED', to: 'PLACED' })
    ).toThrow(ValidationError)
  })
})
