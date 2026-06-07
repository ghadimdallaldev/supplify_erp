import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const listMock = vi.fn()
const updateRestaurantMock = vi.fn()
const updateBranchMock = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, _res, next) => {
    req.userData = { id: 'user-1', email: 'owner@cafe.test', role: 'RESTAURANT' }
    next()
  },
  requireRole: () => (_req, _res, next) => next(),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../services/restaurant-delivery-location.service.js', () => ({
  listRestaurantDeliveryLocations: (...args) => listMock(...args),
  updateRestaurantDeliveryLocation: (...args) => updateRestaurantMock(...args),
  updateBranchDeliveryLocation: (...args) => updateBranchMock(...args),
}))

import { restaurantsRoutes } from './restaurants.routes.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.requestId = 'req-test'
    next()
  })
  app.use('/api/restaurants', restaurantsRoutes)
  return app
}

describe('restaurant delivery location routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listMock.mockResolvedValue({
      restaurant: { id: 'restaurant-1', coordinatesAvailable: false },
      branches: [],
    })
    updateRestaurantMock.mockResolvedValue({
      id: 'restaurant-1',
      deliveryLatitude: 33.8938,
      deliveryLongitude: 35.5018,
      coordinatesAvailable: true,
    })
    updateBranchMock.mockResolvedValue({
      id: 'branch-1',
      deliveryLatitude: 33.9,
      deliveryLongitude: 35.5,
      coordinatesAvailable: true,
    })
  })

  it('GET /me/delivery-locations returns restaurant and branch locations', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/restaurants/me/delivery-locations').expect(200)
    expect(listMock).toHaveBeenCalledWith('restaurant-1')
    expect(res.body.data.restaurant.id).toBe('restaurant-1')
  })

  it('PATCH /me/delivery-location updates restaurant coordinates', async () => {
    const app = buildApp()
    await request(app)
      .patch('/api/restaurants/me/delivery-location')
      .send({ deliveryLatitude: 33.8938, deliveryLongitude: 35.5018 })
      .expect(200)
    expect(updateRestaurantMock).toHaveBeenCalledWith('restaurant-1', {
      deliveryLatitude: 33.8938,
      deliveryLongitude: 35.5018,
    })
  })

  it('PATCH /me/delivery-location rejects invalid latitude', async () => {
    const { ValidationError } = await import('../middlewares/errorHandler.js')
    updateRestaurantMock.mockRejectedValueOnce(
      new ValidationError('latitude or longitude out of range')
    )
    const app = buildApp()
    const res = await request(app)
      .patch('/api/restaurants/me/delivery-location')
      .send({ deliveryLatitude: 999, deliveryLongitude: 35.5 })
      .expect(400)
    expect(res.body.error.name).toBe('VALIDATION_ERROR')
  })

  it('PATCH /branches/:branchId/delivery-location updates branch', async () => {
    const app = buildApp()
    await request(app)
      .patch('/api/restaurants/branches/branch-1/delivery-location')
      .send({
        deliveryLatitude: 33.9,
        deliveryLongitude: 35.5,
        deliveryLocationLabel: 'Loading dock',
      })
      .expect(200)
    expect(updateBranchMock).toHaveBeenCalledWith('restaurant-1', 'branch-1', {
      deliveryLatitude: 33.9,
      deliveryLongitude: 35.5,
      deliveryLocationLabel: 'Loading dock',
    })
  })
})
