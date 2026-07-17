import { describe, it, expect } from 'vitest'
import {
  getQuantityUnitRules,
  snapQuantityToUnit,
  assertValidQuantityForUnit,
} from './quantity-unit.js'

describe('quantity-unit', () => {
  it('uses whole numbers for piece/unit', () => {
    expect(getQuantityUnitRules('piece').step).toBe(1)
    expect(snapQuantityToUnit(2.4, 'piece')).toBe(2)
  })

  it('uses 0.1 steps for kg', () => {
    expect(snapQuantityToUnit(1.04, 'kg')).toBe(1)
    expect(snapQuantityToUnit(1.05, 'kg')).toBe(1.1)
  })

  it('rejects invalid increments', () => {
    expect(() => assertValidQuantityForUnit(2.5, 'box')).toThrow(/whole numbers/)
  })
})
