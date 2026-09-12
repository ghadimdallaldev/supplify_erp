import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listConnectionRequestsForRestaurant = vi.fn()
const respondToConnectionRequest = vi.fn()
const getRestaurantIdForRequest = vi.fn()

vi.mock('../services/supplier-connection-request.service.js', () => ({
  listConnectionRequestsForRestaurant: (...args) => listConnectionRequestsForRestaurant(...args),
  respondToConnectionRequest: (...args) => respondToConnectionRequest(...args),
}))

vi.mock('../services/supplier-sponsorship.service.js', () => ({
  listRestaurantSponsorshipOffers: vi.fn(),
  getRestaurantSponsorshipOffer: vi.fn(),
  acceptSponsorship: vi.fn(),
  declineSponsorship: vi.fn(),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  resolveTenantContext: (_req, _res, next) => next(),
  getRestaurantIdForRequest: (...args) => getRestaurantIdForRequest(...args),
  requirePermission: (permission) => (req, res, next) => {
    if (!req.userData?.permissions?.includes(permission)) {
      return res.status(403).json({ ok: false, error: { name: 'FORBIDDEN' } })
    }
    next()
  },
}))

import { restaurantConnectionRequestRoutes } from './restaurant-connection-requests.routes.js'

function buildApp(permissions) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.requestId = 'test-req'
    req.userData = { id: 'restaurant-user', role: 'RESTAURANT', permissions }
    next()
  })
  app.use('/api/restaurant/growth', restaurantConnectionRequestRoutes)
  return app
}

describe('restaurant connection request authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRestaurantIdForRequest.mockResolvedValue('restaurant-1')
    listConnectionRequestsForRestaurant.mockResolvedValue([])
    respondToConnectionRequest.mockResolvedValue({ id: 'request-1' })
  })

  it('allows read access with SETTINGS_VIEW', async () => {
    await request(buildApp(['SETTINGS_VIEW']))
      .get('/api/restaurant/growth/connection-requests')
      .expect(200)

    expect(listConnectionRequestsForRestaurant).toHaveBeenCalledWith('restaurant-1')
  })

  it('blocks mutations when the user has only SETTINGS_VIEW', async () => {
    await request(buildApp(['SETTINGS_VIEW']))
      .post('/api/restaurant/growth/connection-requests/request-1/accept')
      .expect(403)

    expect(respondToConnectionRequest).not.toHaveBeenCalled()
  })
})
