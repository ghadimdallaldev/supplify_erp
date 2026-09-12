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

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../services/consumer-reviews.service.js', () => ({
  listRestaurantReviews: vi.fn().mockResolvedValue({ reviews: [{ id: 'r1' }], total: 1 }),
  getRestaurantRatingSummary: vi.fn().mockResolvedValue({
    restaurant_id: 'rest-1',
    review_count: 3,
    avg_overall: 4.5,
  }),
  createRestaurantReview: vi.fn().mockResolvedValue({ id: 'new-review' }),
  updateRestaurantReview: vi.fn(),
  deleteRestaurantReview: vi.fn(),
}))

import { consumerReviewsRoutes } from './consumer-reviews.routes.js'
import * as consumerReviewsService from '../services/consumer-reviews.service.js'

describe('Consumer Reviews Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
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
    app.use('/api/consumer-reviews', consumerReviewsRoutes)
  })

  it('GET /restaurants/:id is public', async () => {
    const res = await request(app).get('/api/consumer-reviews/restaurants/rest-1')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.reviews).toHaveLength(1)
    expect(consumerReviewsService.listRestaurantReviews).toHaveBeenCalled()
  })

  it('GET /restaurants/:id/summary is public', async () => {
    const res = await request(app).get('/api/consumer-reviews/restaurants/rest-1/summary')
    expect(res.status).toBe(200)
    expect(res.body.data.summary.avg_overall).toBe(4.5)
  })

  it('POST /restaurants/:id creates review without auth', async () => {
    const res = await request(app).post('/api/consumer-reviews/restaurants/rest-1').send({
      consumerOrderId: '00000000-0000-4000-8000-000000000001',
      overallRating: 5,
      comment: 'Great meal',
    })
    expect(res.status).toBe(201)
    expect(consumerReviewsService.createRestaurantReview).toHaveBeenCalled()
  })
})
