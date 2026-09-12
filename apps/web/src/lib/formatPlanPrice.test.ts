import { describe, it, expect } from 'vitest'
import { formatPlanPrice } from './formatPlanPrice'

describe('formatPlanPrice', () => {
  it('formats yearly price with commas', () => {
    expect(formatPlanPrice(1490, '/yr')).toMatch(/\$1,490\/yr/)
    expect(formatPlanPrice(3490, '/yr')).toMatch(/\$3,490\/yr/)
  })
})
