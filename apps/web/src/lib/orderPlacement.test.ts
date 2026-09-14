import { describe, expect, it } from 'vitest'
import { formatOrderRef, orderShortId } from './orderPlacement'

describe('orderShortId / formatOrderRef', () => {
  const fullId = '486db23d-52ee-4a96-93f0-85c028edea5f'

  it('uses the first 8 UUID chars (not the last 8)', () => {
    expect(orderShortId(fullId)).toBe('486DB23D')
    expect(orderShortId(fullId)).not.toBe('28EDEA5F')
    expect(formatOrderRef(fullId)).toBe('#486DB23D')
  })

  it('returns empty / em dash for missing ids', () => {
    expect(orderShortId(null)).toBe('')
    expect(formatOrderRef(null)).toBe('—')
    expect(formatOrderRef('')).toBe('—')
  })
})
