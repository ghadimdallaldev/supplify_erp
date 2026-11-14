import { describe, expect, it } from 'vitest'
import { formatQualityScore } from './qualityScore'
describe('receiving score display', () => {
  it('rounds aggregate precision without misrepresenting missing scores as zero', () => {
    expect(formatQualityScore('4.5454545454545')).toBe('4.5')
    expect(formatQualityScore(5)).toBe('5')
    expect(formatQualityScore(null)).toBe('—')
    expect(formatQualityScore('NaN')).toBe('—')
  })
})
