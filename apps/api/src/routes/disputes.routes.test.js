import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/tenant-resolve.js', () => ({
  requireRestaurantId: vi.fn().mockResolvedValue('restaurant-1'),
  requireSupplierId: vi.fn().mockResolvedValue('supplier-1'),
}))

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/disputes.service.js', () => ({
  createDispute: vi.fn(),
  listDisputesForRestaurant: vi.fn(),
  listIncomingDisputesForSupplier: vi.fn(),
  getDispute: vi.fn(),
  addDisputeAttachment: vi.fn(),
  cancelDispute: vi.fn(),
  reviewDispute: vi.fn(),
  rejectDispute: vi.fn(),
  resolveDispute: vi.fn(),
}))

import { disputesRoutes } from './disputes.routes.js'
import * as disputesService from '../services/disputes.service.js'

describe('Disputes Routes', () => {
  let app

  beforeEach(async () => {
    clearAllMocks()
    setupMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = {
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
        permissions: ['ORDERS_VIEW', 'ORDERS_CREATE'],
      }
      next()
    })
    app.use('/api/disputes', disputesRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  it('GET / lists restaurant disputes', async () => {
    vi.mocked(disputesService.listDisputesForRestaurant).mockResolvedValue([
      { id: 'd-1', status: 'open' },
    ])
    const res = await request(app).get('/api/disputes').expect(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.disputes).toHaveLength(1)
  })

  it('POST / creates a dispute', async () => {
    vi.mocked(disputesService.createDispute).mockResolvedValue({
      dispute: { id: 'd-1', status: 'open' },
      items: [],
      attachments: [],
      creditNotes: [],
    })
    const res = await request(app)
      .post('/api/disputes')
      .send({
        orderId: '11111111-1111-1111-1111-111111111111',
        supplierId: '22222222-2222-2222-2222-222222222222',
        type: 'damaged_goods',
        description: 'Boxes crushed',
      })
      .expect(201)
    expect(res.body.ok).toBe(true)
    expect(disputesService.createDispute).toHaveBeenCalled()
  })
})
