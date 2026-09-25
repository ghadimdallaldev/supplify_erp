import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockUser, clearAllMocks } from '../test/helpers.js'

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
  const actual = await importOriginal()
  return {
    ...actual,
    requireAuth: vi.fn(async (req, res, next) => {
      req.userData = req.userData || { ...mockUser }
      next()
    }),
    requireRole: () => (req, res, next) => next(),
    resolveTenantContext: (req, res, next) => next(),
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
  }
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
  checkLimit: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/restaurant-delivery-location.service.js', () => ({
  listRestaurantDeliveryLocations: vi.fn().mockResolvedValue({ restaurant: {}, branches: [] }),
  updateRestaurantDeliveryLocation: vi.fn().mockResolvedValue({ id: 'restaurant-1' }),
  updateBranchDeliveryLocation: vi.fn().mockResolvedValue({ id: 'branch-1' }),
}))

import { query } from '../lib/db.js'
import { getRestaurantIdForRequest } from '../lib/rbac.js'
import { restaurantsRoutes } from './restaurants.routes.js'

function mount(permissions) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.requestId = 'test-request-id'
    req.userData = { ...mockUser, role: 'RESTAURANT' }
    req.tenantContext = {
      tenantId: 'restaurant-1',
      tenantType: 'RESTAURANT',
      permissions,
      roles: [],
    }
    next()
  })
  app.use('/api/restaurants', restaurantsRoutes)
  return app
}

describe('restaurant delivery location RBAC', () => {
  beforeEach(() => {
    clearAllMocks()
  })

  it('rejects PATCH /me/delivery-location without SETTINGS_EDIT', async () => {
    const app = mount(['SETTINGS_VIEW'])
    const response = await request(app)
      .patch('/api/restaurants/me/delivery-location')
      .send({ latitude: 25.2, longitude: 55.3 })
      .expect(403)
    expect(response.body.error.message).toMatch(/SETTINGS_EDIT/)
  })

  it('rejects PATCH /branches/:id/delivery-location without SETTINGS_EDIT', async () => {
    const app = mount(['SETTINGS_VIEW', 'ORDERS_VIEW'])
    const response = await request(app)
      .patch('/api/restaurants/branches/11111111-1111-1111-1111-111111111111/delivery-location')
      .send({ latitude: 25.2, longitude: 55.3 })
      .expect(403)
    expect(response.body.error.message).toMatch(/SETTINGS_EDIT/)
  })

  it('allows GET /me/delivery-locations with ORDERS_VIEW for checkout', async () => {
    const app = mount(['ORDERS_VIEW'])
    const response = await request(app).get('/api/restaurants/me/delivery-locations').expect(200)
    expect(response.body.ok).toBe(true)
  })

  it('rejects GET /me/delivery-locations without settings or orders access', async () => {
    const app = mount(['CATALOG_VIEW'])
    const response = await request(app).get('/api/restaurants/me/delivery-locations').expect(403)
    expect(response.body.error.message).toMatch(/SETTINGS_VIEW|ORDERS_VIEW|ORDERS_CREATE/)
  })
})

describe('GET /api/restaurants/me financial fields', () => {
  beforeEach(() => {
    clearAllMocks()
    getRestaurantIdForRequest.mockResolvedValue('restaurant-1')
    query.mockResolvedValue({
      rows: [
        {
          id: 'restaurant-1',
          name: 'Cafe',
          slug: 'cafe',
          tax_id: 'secret-tax',
          vat_number: 'secret-vat',
          trade_license_no: 'secret-license',
        },
      ],
    })
  })

  it('omits tax and license fields without SETTINGS_VIEW', async () => {
    const app = mount(['ORDERS_VIEW', 'RESERVATIONS_VIEW'])
    const response = await request(app).get('/api/restaurants/me').expect(200)
    expect(response.body.data.restaurant.name).toBe('Cafe')
    expect(response.body.data.restaurant.tax_id).toBeUndefined()
    expect(response.body.data.restaurant.vat_number).toBeUndefined()
    expect(response.body.data.restaurant.trade_license_no).toBeUndefined()
  })

  it('returns tax fields with SETTINGS_VIEW', async () => {
    const app = mount(['SETTINGS_VIEW'])
    const response = await request(app).get('/api/restaurants/me').expect(200)
    expect(response.body.data.restaurant.tax_id).toBe('secret-tax')
  })
})
