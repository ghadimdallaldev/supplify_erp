import { describe, it, expect } from 'vitest'
import { validateHexColor, derivePalette, DEFAULT_BRAND } from './branding.service.js'

describe('branding.service', () => {
  it('accepts valid hex colors', () => {
    expect(validateHexColor('#5b21b6', 'brandPrimary')).toBe('#5b21b6')
  })

  it('rejects invalid hex colors', () => {
    expect(() => validateHexColor('red', 'brandPrimary')).toThrow()
    expect(() => validateHexColor('#fff', 'brandPrimary')).toThrow()
  })

  it('derives palette from primary color', () => {
    const palette = derivePalette('#5b21b6')
    expect(palette.brandPrimary).toBeTruthy()
    expect(palette.brandMid).toMatch(/^#/)
  })

  it('falls back to defaults for invalid primary', () => {
    const palette = derivePalette('invalid')
    expect(palette.brandPrimary).toBe(DEFAULT_BRAND.brandPrimary)
  })
})
