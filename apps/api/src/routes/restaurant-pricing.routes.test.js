import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockSupplierUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(async (fn) => fn({ query: queryMock })),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

const tenantPermissions = { value: ['CATALOG_VIEW', 'CATALOG_MANAGE'] }

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = { ...mockSupplierUser, role: 'SUPPLIER', id: 'user-supplier' }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = {
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      permissions: tenantPermissions.value,
    }
    next()
  },
  resolveAdminContext: (req, res, next) => next(),
  requirePermission: (key) => (req, res, next) => {
    const perms = req.tenantContext?.permissions ?? []
    if (perms.includes(key) || perms.includes('ALL')) return next()
    return res.status(403).json({
      ok: false,
      error: { name: 'FORBIDDEN', message: `Missing permission: ${key}` },
    })
  },
  requireAnyPermission:
    (...keys) =>
    (req, res, next) => {
      const perms = req.tenantContext?.permissions ?? []
      if (keys.some((k) => perms.includes(k) || perms.includes('ALL'))) return next()
      return res.status(403).json({
        ok: false,
        error: { name: 'FORBIDDEN', message: `Missing one of: ${keys.join(', ')}` },
      })
    },
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const hookRecipeCostingAfterCatalogPriceChangeMock = vi.fn()

vi.mock('../services/recipe-purchasing-hooks.service.js', () => ({
  hookRecipeCostingAfterCatalogPriceChange: (...args) =>
    hookRecipeCostingAfterCatalogPriceChangeMock(...args),
}))

vi.mock('../services/resolve-product-price.service.js', () => ({
  resolveProductPricesBatch: vi.fn().mockResolvedValue([
    {
      productId: 'product-1',
      supplierId: 'supplier-1',
      quantity: 2,
      unitPrice: 8,
      source: 'CONTRACT_PRICE',
      defaultPrice: 10,
      contractPriceId: 'contract-1',
    },
  ]),
  getDefaultCatalogPricesBatch: vi
    .fn()
    .mockResolvedValue(
      new Map([['22222222-2222-4222-8222-222222222222', { amount: 100, currency: 'USD' }]])
    ),
}))

import { restaurantPricingRoutes } from './restaurant-pricing.routes.js'
import { errorHandler } from '../middlewares/errorHandler.js'
import { query } from '../lib/db.js'
import { getSupplierIdForRequest } from '../lib/rbac.js'

describe('restaurant-pricing routes', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    setupMocks()
    hookRecipeCostingAfterCatalogPriceChangeMock.mockClear()
    tenantPermissions.value = ['CATALOG_VIEW', 'CATALOG_MANAGE']
    getSupplierIdForRequest.mockResolvedValue('supplier-1')
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      next()
    })
    app.use('/api/restaurant-pricing', restaurantPricingRoutes)
    app.use(errorHandler)
  })

  it('lists contract pricing for supplier tenant', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'rp-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'restaurant-1',
          product_id: 'product-1',
          price: '9.5',
          is_active: true,
          restaurant_name: 'Cafe A',
          product_name: 'Tomatoes',
          product_sku: 'TOM-1',
        },
      ],
    })

    const res = await request(app).get('/api/restaurant-pricing')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.pricing).toHaveLength(1)
    expect(res.body.data.pricing[0].price).toBe(9.5)
  })

  it('creates contract price for own product when restaurant is eligible', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'product-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'rp-new',
            supplier_id: 'supplier-1',
            restaurant_id: 'restaurant-1',
            product_id: 'product-1',
            price: '8.00',
            is_active: true,
          },
        ],
      })

    const res = await request(app).post('/api/restaurant-pricing').send({
      restaurantId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      price: 8,
    })

    expect(res.status).toBe(200)
    expect(res.body.data.pricing.price).toBe(8)
    expect(hookRecipeCostingAfterCatalogPriceChangeMock).toHaveBeenCalledWith(
      'product-1',
      8,
      'CONTRACT',
      'restaurant-1'
    )
  })

  it('filters expired contracts by end date only', async () => {
    query.mockResolvedValueOnce({ rows: [] })

    await request(app).get('/api/restaurant-pricing?status=expired')

    const listSql = query.mock.calls[0][0]
    expect(listSql).toContain('rp.contract_end_date < CURRENT_DATE')
    expect(listSql).not.toMatch(/status = 'expired'.*is_active/)
  })

  it('rejects create when restaurant has no commercial relationship', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'product-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app).post('/api/restaurant-pricing').send({
      restaurantId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      price: 8,
    })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/not eligible for contract pricing/)
  })

  it('rejects create when contract end date is before start date', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'product-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })

    const res = await request(app).post('/api/restaurant-pricing').send({
      restaurantId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      price: 8,
      contractStartDate: '2026-06-01',
      contractEndDate: '2026-05-01',
    })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/contractEndDate/)
  })

  it('rejects create when product not owned by supplier', async () => {
    query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app).post('/api/restaurant-pricing').send({
      restaurantId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      price: 8,
    })

    expect(res.status).toBe(404)
  })

  it('returns 403 without catalog manage permission on write', async () => {
    tenantPermissions.value = ['CATALOG_VIEW']

    const res = await request(app).post('/api/restaurant-pricing').send({
      restaurantId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      price: 8,
    })

    expect(res.status).toBe(403)
  })

  it('returns my-pricing for restaurant tenant', async () => {
    const { getRestaurantIdForRequest, requireAuth } = await import('../lib/rbac.js')
    getRestaurantIdForRequest.mockResolvedValue('restaurant-1')
    requireAuth.mockImplementationOnce(async (req, res, next) => {
      req.userData = { id: 'user-restaurant', email: 'cafe@example.com', role: 'RESTAURANT' }
      next()
    })

    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'rp-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'restaurant-1',
          product_id: 'product-1',
          price: '7.50',
          is_active: true,
          product_name: 'Tomatoes',
          product_sku: 'TOM-1',
          supplier_name: 'Fresh Farms',
          catalog_price: '10.00',
          contract_start_date: null,
          contract_end_date: null,
          agreement_type: 'CUSTOM',
          min_order_quantity: null,
        },
      ],
    })

    const res = await request(app).get('/api/restaurant-pricing/my-pricing')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.pricing).toHaveLength(1)
    expect(res.body.data.pricing[0].price).toBe(7.5)
    expect(res.body.data.summary).toHaveLength(1)
    expect(res.body.data.summary[0].supplier_name).toBe('Fresh Farms')
  })

  it('derives contract price from catalog discount when price is omitted', async () => {
    const { getDefaultCatalogPricesBatch } = await import(
      '../services/resolve-product-price.service.js'
    )
    vi.mocked(getDefaultCatalogPricesBatch).mockResolvedValueOnce(
      new Map([['22222222-2222-4222-8222-222222222222', { amount: 100, currency: 'USD' }]])
    )

    query
      .mockResolvedValueOnce({ rows: [{ id: 'product-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'rp-new',
            supplier_id: 'supplier-1',
            restaurant_id: 'restaurant-1',
            product_id: 'product-1',
            price: '90.00',
            contract_discount_percentage: '10',
            is_active: true,
          },
        ],
      })

    const res = await request(app).post('/api/restaurant-pricing').send({
      restaurantId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      contractDiscountPercentage: 10,
    })

    expect(res.status).toBe(200)
    expect(res.body.data.pricing.price).toBe(90)
    expect(res.body.data.pricing.contract_discount_percentage).toBe(10)
  })

  it('deduplicates bulk items by productId (last wins)', async () => {
    const productId = '22222222-2222-4222-8222-222222222222'
    query
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: productId }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'rp-bulk',
            supplier_id: 'supplier-1',
            restaurant_id: 'restaurant-1',
            product_id: productId,
            price: '12.00',
            is_active: true,
          },
        ],
      })

    const res = await request(app)
      .post('/api/restaurant-pricing/bulk')
      .send({
        restaurantId: '11111111-1111-4111-8111-111111111111',
        items: [
          { productId, price: 8 },
          { productId, price: 12 },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.data.count).toBe(1)
    const insertCall = query.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO restaurant_pricing')
    )
    expect(insertCall?.[1]?.[3]).toEqual([12])
  })

  it('deactivates contract price scoped to supplier', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'rp-1', supplier_id: 'supplier-1', is_active: false }],
    })

    const res = await request(app).delete('/api/restaurant-pricing/rp-1')
    expect(res.status).toBe(200)
    expect(res.body.data.pricing.is_active).toBe(false)
  })
})
