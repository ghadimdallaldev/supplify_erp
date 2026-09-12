import { describe, it, expect } from 'vitest'
import { validateHexColor, DEFAULT_BRAND } from './branding.service.js'

describe('featured-supplier-placement', () => {
  it('uses branding validateHexColor for consistency', () => {
    expect(validateHexColor('#112233', 'x')).toBe('#112233')
    expect(DEFAULT_BRAND.brandPrimary).toBeTruthy()
  })
})
