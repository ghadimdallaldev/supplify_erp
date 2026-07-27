import { describe, expect, it } from 'vitest'
import { isOrderReadyForReceiving } from './orderReceiving'

describe('isOrderReadyForReceiving', () => {
  it('returns true for DELIVERED and COMPLETED', () => {
    expect(isOrderReadyForReceiving('DELIVERED')).toBe(true)
    expect(isOrderReadyForReceiving('completed')).toBe(true)
  })

  it('returns false for in-flight statuses', () => {
    expect(isOrderReadyForReceiving('SHIPPED')).toBe(false)
    expect(isOrderReadyForReceiving('PROCESSING')).toBe(false)
  })
})
