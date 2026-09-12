import { describe, it, expect, vi } from 'vitest'
import {
  getBuiltinConversionFactor,
  normalizeUnit,
  resolveConversionFactor,
} from './recipe-unit-conversion.service.js'

describe('recipe-unit-conversion.service', () => {
  it('normalizes unit labels', () => {
    expect(normalizeUnit(' KG ')).toBe('kg')
    expect(normalizeUnit('Liters')).toBe('liter')
  })

  it('converts kg to g', () => {
    expect(getBuiltinConversionFactor('kg', 'g')).toBe(1000)
  })

  it('returns identity for same unit', async () => {
    const result = await resolveConversionFactor({
      restaurantId: 'r1',
      fromUnit: 'kg',
      toUnit: 'kg',
    })
    expect(result.factor).toBe(1)
    expect(result.missing).toBe(false)
  })

  it('flags missing conversion', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    const result = await resolveConversionFactor(
      {
        restaurantId: 'r1',
        fromUnit: 'box',
        toUnit: 'each',
      },
      dbQuery
    )
    expect(result.missing).toBe(true)
    expect(result.factor).toBeNull()
  })
})
