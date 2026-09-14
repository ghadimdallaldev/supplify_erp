import { describe, expect, it } from 'vitest'
import { formatOptionalCount, parseOptionalCount } from './adminMetricDisplay'

describe('adminMetricDisplay', () => {
  it('formatOptionalCount returns Not available for nullish values', () => {
    expect(formatOptionalCount(null)).toBe('Not available')
    expect(formatOptionalCount(undefined)).toBe('Not available')
    expect(formatOptionalCount('')).toBe('Not available')
  })

  it('formatOptionalCount formats finite numbers', () => {
    expect(formatOptionalCount(0)).toBe('0')
    expect(formatOptionalCount(42)).toBe('42')
    expect(formatOptionalCount('12')).toBe('12')
  })

  it('parseOptionalCount returns null for missing values', () => {
    expect(parseOptionalCount(null)).toBeNull()
    expect(parseOptionalCount(undefined)).toBeNull()
    expect(parseOptionalCount('')).toBeNull()
  })

  it('parseOptionalCount parses integers', () => {
    expect(parseOptionalCount(5)).toBe(5)
    expect(parseOptionalCount('9')).toBe(9)
  })
})
