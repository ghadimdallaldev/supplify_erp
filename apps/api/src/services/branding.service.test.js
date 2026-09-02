import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateHexColor,
  validateLogoUrl,
  derivePalette,
  DEFAULT_BRAND,
} from './branding.service.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../lib/tenant-profile-cache.js', () => ({
  invalidateTenantProfileCache: vi.fn().mockResolvedValue(undefined),
}))

const tenantBrandingColumnMap = vi.fn().mockResolvedValue({
  logoUrl: true,
  brandPrimary: true,
  brandAccent: true,
  brandDisplayName: true,
})
vi.mock('../lib/ensure-tenant-branding-schema.js', () => ({
  ensureTenantBrandingSchema: vi.fn().mockResolvedValue(undefined),
  tenantBrandingColumnMap: (...args) => tenantBrandingColumnMap(...args),
  resetBrandingColumnCache: vi.fn(),
}))

describe('branding.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantBrandingColumnMap.mockResolvedValue({
      logoUrl: true,
      brandPrimary: true,
      brandAccent: true,
      brandDisplayName: true,
    })
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

  it('preserves the chosen primary even when contrast on white is low', () => {
    const palette = derivePalette('#fde047')
    expect(palette.brandPrimary).toBe('#fde047')
  })
})

describe('validateLogoUrl', () => {
  it('accepts https URLs', () => {
    expect(validateLogoUrl('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png')
  })

  it('returns null for empty values', () => {
    expect(validateLogoUrl('')).toBeNull()
    expect(validateLogoUrl(null)).toBeNull()
  })

  it('rejects non-http(s) URLs', () => {
    expect(() => validateLogoUrl('javascript:alert(1)')).toThrow(/http or https/)
  })

  it('rejects invalid URLs', () => {
    expect(() => validateLogoUrl('not-a-url')).toThrow(/valid http or https/)
  })
})

describe('getTenantBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to logo_url when brand columns are missing', async () => {
    tenantBrandingColumnMap.mockResolvedValue({
      logoUrl: true,
      brandPrimary: false,
      brandAccent: false,
      brandDisplayName: false,
    })
    const { query } = await import('../lib/db.js')
    query.mockResolvedValueOnce({
      rows: [{ logo_url: 'https://cdn.example/logo.png' }],
    })

    const { getTenantBranding } = await import('./branding.service.js')

    const branding = await getTenantBranding('supplier-1', 'SUPPLIER')
    expect(branding.logoUrl).toBe('https://cdn.example/logo.png')
    expect(branding.isDefault).toBe(true)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT logo_url FROM supplier'), [
      'supplier-1',
    ])
  })

  it('omits logo_url from SELECT when only brand columns exist', async () => {
    tenantBrandingColumnMap.mockResolvedValue({
      logoUrl: false,
      brandPrimary: true,
      brandAccent: true,
      brandDisplayName: true,
    })
    const { query } = await import('../lib/db.js')
    query.mockResolvedValueOnce({
      rows: [
        {
          brand_primary: '#5b21b6',
          brand_accent: null,
          brand_display_name: 'Gulf Chef',
        },
      ],
    })

    const { getTenantBranding } = await import('./branding.service.js')

    const branding = await getTenantBranding('supplier-1', 'SUPPLIER')
    expect(branding.brandDisplayName).toBe('Gulf Chef')
    expect(branding.logoUrl).toBeNull()
    const sql = query.mock.calls.find((call) => call[0].includes('SELECT'))?.[0] ?? ''
    expect(sql).not.toContain('logo_url')
    expect(sql).toContain('brand_primary')
  })
})

describe('updateTenantBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantBrandingColumnMap.mockResolvedValue({
      logoUrl: true,
      brandPrimary: true,
      brandAccent: true,
      brandDisplayName: true,
    })
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

  it('rejects updates when brand columns are missing', async () => {
    tenantBrandingColumnMap.mockResolvedValue({
      logoUrl: true,
      brandPrimary: false,
      brandAccent: false,
      brandDisplayName: false,
    })
    const { updateTenantBranding } = await import('./branding.service.js')

    await expect(
      updateTenantBranding('supplier-1', 'SUPPLIER', { brandPrimary: '#5b21b6' })
    ).rejects.toThrow(/not available/)
  })
})

describe('updateTenantLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantBrandingColumnMap.mockResolvedValue({
      logoUrl: true,
      brandPrimary: true,
      brandAccent: true,
      brandDisplayName: true,
    })
  })

  it('updates logo_url and invalidates tenant profile cache', async () => {
    const { query } = await import('../lib/db.js')
    const { invalidateTenantProfileCache } = await import('../lib/tenant-profile-cache.js')
    query.mockResolvedValueOnce({
      rows: [{ id: 'supplier-1', logo_url: 'https://cdn.example/logo.png' }],
    })

    const { updateTenantLogo } = await import('./branding.service.js')
    const row = await updateTenantLogo('supplier-1', 'SUPPLIER', 'https://cdn.example/logo.png')

    expect(row.logo_url).toBe('https://cdn.example/logo.png')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE supplier SET logo_url = $2'),
      ['supplier-1', 'https://cdn.example/logo.png']
    )
    expect(invalidateTenantProfileCache).toHaveBeenCalledWith('supplier-1', 'SUPPLIER')
  })

  it('clears logo when given an empty string', async () => {
    const { query } = await import('../lib/db.js')
    query.mockResolvedValueOnce({
      rows: [{ id: 'supplier-1', logo_url: null }],
    })

    const { updateTenantLogo } = await import('./branding.service.js')
    const row = await updateTenantLogo('supplier-1', 'SUPPLIER', '')

    expect(row.logo_url).toBeNull()
    expect(query).toHaveBeenCalledWith(expect.any(String), ['supplier-1', null])
  })

  it('rejects invalid logo URLs', async () => {
    const { updateTenantLogo } = await import('./branding.service.js')
    await expect(updateTenantLogo('supplier-1', 'SUPPLIER', 'not-a-url')).rejects.toThrow(
      /valid http or https/
    )
  })

  it('rejects updates when logo_url column is missing', async () => {
    tenantBrandingColumnMap.mockResolvedValue({
      logoUrl: false,
      brandPrimary: true,
      brandAccent: true,
      brandDisplayName: true,
    })
    const { updateTenantLogo } = await import('./branding.service.js')
    await expect(
      updateTenantLogo('supplier-1', 'SUPPLIER', 'https://cdn.example/logo.png')
    ).rejects.toThrow(/not available/)
  })

  it('throws when tenant is not found', async () => {
    const { query } = await import('../lib/db.js')
    query.mockResolvedValueOnce({ rows: [] })

    const { updateTenantLogo } = await import('./branding.service.js')
    await expect(
      updateTenantLogo('supplier-1', 'SUPPLIER', 'https://cdn.example/logo.png')
    ).rejects.toThrow(/not found/i)
  })
})
