import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const columnExistsMock = vi.fn()
const getTenantBrandingMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/ensure-tenant-branding-schema.js', () => ({
  columnExists: (...args) => columnExistsMock(...args),
}))

vi.mock('../lib/subscription.js', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('./branding.service.js', () => ({
  getTenantBranding: (...args) => getTenantBrandingMock(...args),
}))

import {
  getPublicSupplierProfile,
  listPublicSupplierProducts,
  assertRestaurantNotBlocklisted,
  isUuid,
} from './public-supplier-catalog.service.js'
import { NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'

describe('public-supplier-catalog.service', () => {
  beforeEach(() => {
    queryMock.mockReset()
    columnExistsMock.mockReset()
    getTenantBrandingMock.mockReset()
    columnExistsMock.mockImplementation((_table, column) =>
      Promise.resolve(column === 'public_catalog_enabled')
    )
    getTenantBrandingMock.mockResolvedValue({
      logoUrl: 'https://example.com/logo.png',
      brandDisplayName: 'Fresh',
      brandPrimary: '#5b21b6',
      brandAccent: '#7c3aed',
      isDefault: false,
    })
  })

  it('isUuid detects uuid strings', () => {
    expect(isUuid('11111111-1111-1111-1111-111111111111')).toBe(true)
    expect(isUuid('fresh-foods')).toBe(false)
  })

  it('getPublicSupplierProfile returns safe fields only', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'supplier-1',
          slug: 'fresh-co',
          name: 'Fresh Co',
          public_catalog_enabled: true,
          minimum_order_amount: 100,
          payment_terms: 'NET30',
        },
      ],
    })

    const profile = await getPublicSupplierProfile('fresh-co')
    expect(profile.slug).toBe('fresh-co')
    expect(profile.name).toBe('Fresh Co')
    expect(profile.logoUrl).toBeTruthy()
    expect(getTenantBrandingMock).toHaveBeenCalledWith('supplier-1', 'SUPPLIER')
    expect(profile).not.toHaveProperty('contactEmail')
    expect(profile).not.toHaveProperty('vatNo')
  })

  it('getPublicSupplierProfile works when branding columns are missing', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'supplier-1',
          slug: 'fresh-co',
          name: 'Fresh Co',
          public_catalog_enabled: true,
          minimum_order_amount: null,
          payment_terms: null,
        },
      ],
    })
    getTenantBrandingMock.mockResolvedValueOnce({
      logoUrl: 'https://example.com/logo.png',
      brandDisplayName: null,
      brandPrimary: '#5b21b6',
      brandAccent: null,
      isDefault: false,
    })

    const profile = await getPublicSupplierProfile('fresh-co')
    expect(profile.logoUrl).toBe('https://example.com/logo.png')
    expect(profile.name).toBe('Fresh Co')
  })

  it('getPublicSupplierProfile throws when catalog disabled', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(getPublicSupplierProfile('hidden-supplier')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('listPublicSupplierProducts excludes prices', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'product-1',
            name: 'Chicken',
            sku: 'CHK',
            category: 'Poultry',
            unit: 'kg',
            image_url: null,
            description: 'Fresh',
            in_stock: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ category: 'Poultry' }] })

    const result = await listPublicSupplierProducts('supplier-1', { page: 1, limit: 24 })
    expect(result.products[0].name).toBe('Chicken')
    expect(result.products[0]).not.toHaveProperty('currentPrice')
    expect(result.products[0]).not.toHaveProperty('unit_price')
    expect(result.pagination.total).toBe(1)
    expect(queryMock.mock.calls[0][0]).not.toContain('brand_primary')
  })

  it('assertRestaurantNotBlocklisted throws for blocklisted restaurant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    await expect(assertRestaurantNotBlocklisted('rest-1', 'supplier-1')).rejects.toBeInstanceOf(
      ForbiddenError
    )
  })
})
