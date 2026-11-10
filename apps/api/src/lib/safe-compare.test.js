import { describe, it, expect } from 'vitest'
import { safeEqualStrings } from './safe-compare.js'

describe('safeEqualStrings', () => {
  it('matches identical strings', () => {
    expect(safeEqualStrings('s3cret', 's3cret')).toBe(true)
  })
  it('rejects different strings, including different lengths', () => {
    expect(safeEqualStrings('s3cret', 's3creT')).toBe(false)
    expect(safeEqualStrings('s3cret', 's3cret-longer')).toBe(false)
  })
  it('rejects empty, undefined, arrays and other non-strings', () => {
    expect(safeEqualStrings('', '')).toBe(false)
    expect(safeEqualStrings(undefined, 'x')).toBe(false)
    expect(safeEqualStrings(['x'], 'x')).toBe(false)
  })
})
