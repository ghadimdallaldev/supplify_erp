import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
    withTransaction: vi.fn(async (fn) => fn({ query: queryMock })),
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        permissions: ['ORDERS_CREATE', 'CATALOG_VIEW', 'ORDERS_VIEW'],
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
      }
      next()
    },
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('rest-1'),
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  })
})

vi.mock('../services/quote-requests.service.js', () => ({
  createQuoteRequest: vi.fn().mockResolvedValue({
    quoteRequest: { id: 'qr-1', status: 'open' },
    itemCount: 1,
    supplierCount: 1,
  }),
  listRestaurantQuoteRequests: vi.fn().mockResolvedValue({
    quoteRequests: [{ id: 'qr-1', status: 'open' }],
    pagination: { page: 1, limit: 20, total: 1 },
  }),
  getQuoteRequestDetail: vi
    .fn()
    .mockResolvedValue({ quoteRequest: { id: 'qr-1' }, items: [], suppliers: [] }),
  getQuoteRequestCompare: vi
    .fn()
    .mockResolvedValue({ quoteRequest: { id: 'qr-1' }, items: [], suppliers: [] }),
  listSupplierQuoteRequests: vi.fn().mockResolvedValue({
    inbox: [{ id: 'qrs-1' }],
    pagination: { page: 1, limit: 20, total: 1 },
  }),
  getSupplierQuoteRequestDetail: vi.fn().mockResolvedValue({ id: 'qrs-1', items: [] }),
  submitQuoteResponse: vi.fn().mockResolvedValue({ id: 'qrs-1', status: 'responded' }),
  buildCartPayloadFromResponse: vi.fn().mockResolvedValue({
    supplierId: 'supplier-1',
    items: [{ productId: 'p-1', quantity: 2, quotedUnitPrice: 5 }],
    disclaimer: 'Checkout resolves prices',
  }),
  assertRestaurantOwnsQuoteRequest: vi.fn().mockResolvedValue({ id: 'qr-1' }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  createModuleLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}))

import { quoteRequestsRoutes } from './quote-requests.routes.js'
import * as quoteService from '../services/quote-requests.service.js'

describe('quote-requests.routes', () => {
  let app

  beforeEach(async () => {
    clearAllMocks()
    setupMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, role: 'RESTAURANT' }
      next()
    })
    app.use('/api/quote-requests', quoteRequestsRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  it('POST / creates quote request for restaurant', async () => {
    const res = await request(app)
      .post('/api/quote-requests')
      .send({
        items: [{ productId: '11111111-1111-1111-1111-111111111111', quantity: 2 }],
        supplierIds: ['22222222-2222-2222-2222-222222222222'],
        note: 'Urgent',
      })

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(quoteService.createQuoteRequest).toHaveBeenCalled()
  })

  it('GET / lists restaurant quote requests', async () => {
    const res = await request(app).get('/api/quote-requests')
    expect(res.status).toBe(200)
    expect(res.body.data.quoteRequests).toHaveLength(1)
  })

  it('POST to-cart returns cart payload without order', async () => {
    const res = await request(app).post('/api/quote-requests/qr-1/suppliers/qrs-1/to-cart')
    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(quoteService.buildCartPayloadFromResponse).toHaveBeenCalled()
  })
})
