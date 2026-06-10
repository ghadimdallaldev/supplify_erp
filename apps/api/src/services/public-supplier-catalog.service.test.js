import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/subscription.js', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
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
          logo_url: 'https://example.com/logo.png',
          brand_primary: '#5b21b6',
          brand_accent: '#7c3aed',
          brand_display_name: 'Fresh',
          public_catalog_enabled: true,
          minimum_order_amount: 100,
          payment_terms: 'NET30',
          contact_email: 'secret@fresh.co',
          vat_no: 'VAT123',
        },
      ],
    })

    const profile = await getPublicSupplierProfile('fresh-co')
    expect(profile.slug).toBe('fresh-co')
    expect(profile.name).toBe('Fresh Co')
    expect(profile.logoUrl).toBeTruthy()
    expect(profile).not.toHaveProperty('contactEmail')
    expect(profile).not.toHaveProperty('vatNo')
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
  })

  it('assertRestaurantNotBlocklisted throws for blocklisted restaurant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    await expect(assertRestaurantNotBlocklisted('rest-1', 'supplier-1')).rejects.toBeInstanceOf(
      ForbiddenError
    )
  })
})
