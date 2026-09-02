import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ordersCalendarRoutes } from './orders.calendar.routes.js'

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    getRequestTenant: vi.fn().mockResolvedValue({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
    }),
  })
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res) =>
    res.status(403).json({
      ok: false,
      data: null,
      error: {
        name: 'FEATURE_NOT_AVAILABLE',
        message: 'Order calendar is not available on your plan',
        details: { featureKey: 'order_calendar' },
      },
      requestId: req.requestId,
    }),
}))

describe('orders.calendar.routes feature gate', () => {
  let app

  beforeEach(() => {
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      next()
    })
    app.use('/api/orders/calendar', ordersCalendarRoutes)
  })

  it('returns 403 when order_calendar feature is disabled', async () => {
    const res = await request(app)
      .get('/api/orders/calendar')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .expect(403)

    expect(res.body.error.name).toBe('FEATURE_NOT_AVAILABLE')
    expect(res.body.error.details.featureKey).toBe('order_calendar')
  })
})
