import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'
import { mockSubscriptionModule, resetFeatureGates } from '../test/feature-gate-mock.js'

vi.mock('../lib/subscription.js', () => mockSubscriptionModule())

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

vi.mock('../services/reviews.service.js', () => ({
  listSupplierReviews: vi.fn().mockResolvedValue({ reviews: [{ id: 'r1' }], total: 1 }),
  getSupplierRatingSummary: vi.fn().mockResolvedValue({
    supplier_id: 'sup-1',
    review_count: 5,
    avg_overall: 4.2,
  }),
  listMyReviews: vi.fn().mockResolvedValue([]),
  createSupplierReview: vi.fn().mockResolvedValue({ id: 'new-review' }),
  updateSupplierReview: vi.fn(),
  deleteSupplierReview: vi.fn(),
}))

import { reviewsRoutes } from './reviews.routes.js'
import * as reviewsService from '../services/reviews.service.js'

describe('Reviews Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    resetFeatureGates({ supplier_reviews: true })
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    db.query.mockResolvedValue({ rows: [{ id: 'restaurant-1' }] })

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      next()
    })
    app.use('/api/reviews', reviewsRoutes)
  })

  it('GET /suppliers/:id is public', async () => {
    const res = await request(app).get('/api/reviews/suppliers/sup-1')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.reviews).toHaveLength(1)
    expect(reviewsService.listSupplierReviews).toHaveBeenCalled()
  })

  it('GET /suppliers/:id/summary is public', async () => {
    const res = await request(app).get('/api/reviews/suppliers/sup-1/summary')
    expect(res.status).toBe(200)
    expect(res.body.data.summary.avg_overall).toBe(4.2)
  })

  it('GET /my requires auth middleware path', async () => {
    const res = await request(app).get('/api/reviews/my')
    expect(res.status).toBe(200)
    expect(reviewsService.listMyReviews).toHaveBeenCalled()
  })

  it('POST /suppliers/:id creates review', async () => {
    const res = await request(app).post('/api/reviews/suppliers/sup-1').send({
      orderId: '00000000-0000-4000-8000-000000000001',
      overallRating: 5,
      comment: 'Great',
    })
    expect(res.status).toBe(201)
    expect(reviewsService.createSupplierReview).toHaveBeenCalled()
  })
})
