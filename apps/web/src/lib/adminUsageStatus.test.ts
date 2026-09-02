import { describe, it, expect } from 'vitest'
import { computeUsageStatus, computeWorstUsageStatus, usagePercent } from './adminUsageStatus'

describe('adminUsageStatus', () => {
  it('returns unlimited for limit -1', () => {
    expect(computeUsageStatus(100, -1)).toBe('unlimited')
  })

  it('returns healthy below 80%', () => {
    expect(computeUsageStatus(7, 10)).toBe('healthy')
  })

  it('returns near_limit at 80% or above', () => {
    expect(computeUsageStatus(8, 10)).toBe('near_limit')
    expect(computeUsageStatus(9, 10)).toBe('near_limit')
  })

  it('returns over_limit when used exceeds limit', () => {
    expect(computeUsageStatus(11, 10)).toBe('over_limit')
  })

  it('returns unknown when limit is null', () => {
    expect(computeUsageStatus(5, null)).toBe('unknown')
  })

  it('computeWorstUsageStatus prioritizes over_limit', () => {
    expect(computeWorstUsageStatus(['healthy', 'near_limit', 'over_limit'])).toBe('over_limit')
  })

  it('usagePercent caps at 100', () => {
    expect(usagePercent(15, 10)).toBe(100)
    expect(usagePercent(5, 10)).toBe(50)
  })
})
