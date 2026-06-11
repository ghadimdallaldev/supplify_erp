import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateHexColor, derivePalette, DEFAULT_BRAND } from './branding.service.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

const brandingColumnsExist = vi.fn().mockResolvedValue(true)
vi.mock('../lib/ensure-tenant-branding-schema.js', () => ({
  ensureTenantBrandingSchema: vi.fn().mockResolvedValue(undefined),
  brandingColumnsExist: (...args) => brandingColumnsExist(...args),
}))

describe('branding.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brandingColumnsExist.mockResolvedValue(true)
  })

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

describe('getTenantBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to logo_url when brand columns are missing', async () => {
    brandingColumnsExist.mockResolvedValue(false)
    const { query } = await import('../lib/db.js')
    query.mockResolvedValueOnce({
      rows: [{ logo_url: 'https://cdn.example/logo.png' }],
    })

    const { getTenantBranding, resetBrandingSchemaReadyForTests } = await import(
      './branding.service.js'
    )
    resetBrandingSchemaReadyForTests()

    const branding = await getTenantBranding('supplier-1', 'SUPPLIER')
    expect(branding.logoUrl).toBe('https://cdn.example/logo.png')
    expect(branding.isDefault).toBe(false)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT logo_url FROM supplier'), [
      'supplier-1',
    ])
  })
})

describe('updateTenantBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brandingColumnsExist.mockResolvedValue(true)
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

    const { updateTenantBranding, resetBrandingSchemaReadyForTests } = await import(
      './branding.service.js'
    )
    resetBrandingSchemaReadyForTests()

    await updateTenantBranding('supplier-1', 'SUPPLIER', {
      brandDisplayName: 'Gulf Chef',
    })

    const sql = query.mock.calls[0][0]
    expect(sql).toContain('brand_display_name = $2')
    expect(sql).not.toMatch(/SET[^R]*brand_primary/)
    expect(sql).not.toMatch(/SET[^R]*brand_accent/)
    expect(query.mock.calls[0][1]).toEqual(['supplier-1', 'Gulf Chef'])
  })

  it('rejects updates when brand columns are missing', async () => {
    brandingColumnsExist.mockResolvedValue(false)
    const { updateTenantBranding, resetBrandingSchemaReadyForTests } = await import(
      './branding.service.js'
    )
    resetBrandingSchemaReadyForTests()

    await expect(
      updateTenantBranding('supplier-1', 'SUPPLIER', { brandPrimary: '#5b21b6' })
    ).rejects.toThrow(/not available/)
  })
})
