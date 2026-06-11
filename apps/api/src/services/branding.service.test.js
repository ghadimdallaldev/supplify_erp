import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateHexColor, derivePalette, DEFAULT_BRAND } from './branding.service.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

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

describe('updateTenantBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('only updates fields present in the payload', async () => {
    const { query } = await import('../lib/db.js')
    query.mockResolvedValueOnce({
      rows: [
        {
          logo_url: null,
          brand_primary: '#5b21b6',
          brand_accent: null,
          brand_display_name: 'Gulf Chef',
        },
      ],
    })

    const { updateTenantBranding } = await import('./branding.service.js')
    await updateTenantBranding('supplier-1', 'SUPPLIER', {
      brandDisplayName: 'Gulf Chef',
    })

    const sql = query.mock.calls[0][0]
    expect(sql).toContain('brand_display_name = $2')
    expect(sql).not.toMatch(/SET[^R]*brand_primary/)
    expect(sql).not.toMatch(/SET[^R]*brand_accent/)
    expect(query.mock.calls[0][1]).toEqual(['supplier-1', 'Gulf Chef'])
  })
})
