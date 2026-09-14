import { describe, expect, it } from 'vitest'
import { orderShortId } from './templates.js'

describe('orderShortId', () => {
  it('uses the first 8 UUID chars uppercase (not the last 8)', () => {
    const order = { id: '486db23d-52ee-4a96-93f0-85c028edea5f' }
    expect(orderShortId(order)).toBe('486DB23D')
    expect(orderShortId(order)).not.toBe('28EDEA5F')
  })
})
