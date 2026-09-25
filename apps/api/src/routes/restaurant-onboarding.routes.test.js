import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
    __withTransactionMock: withTransactionMock,
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
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        tenantId: 'tenant-1',
        tenantType: 'RESTAURANT',
        permissions: [
          'SETTINGS_VIEW',
          'SETTINGS_EDIT',
          'STAFF_VIEW',
          'STAFF_INVITE',
          'STAFF_MANAGE',
        ],
        roles: [],
      }
      next()
    },
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
    getRequestTenant: vi.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
    }),
  }
})

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn().mockResolvedValue({
    allowed: true,
    current: 0,
    limit: 100,
    isUnlimited: false,
  }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { restaurantOnboardingRoutes } from './restaurant-onboarding.routes.js'
import { getRestaurantIdForRequest } from '../lib/rbac.js'
import { query } from '../lib/db.js'

function mount(permissions) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.requestId = 'test-request-id'
    req.userData = { ...mockUser }
    req.tenantContext = {
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      permissions,
      roles: [],
    }
    next()
  })
  app.use('/api/restaurant-onboarding', restaurantOnboardingRoutes)
  return app
}

describe('restaurant-onboarding RBAC', () => {
  beforeEach(() => {
    clearAllMocks()
    setupMocks()
    getRestaurantIdForRequest.mockResolvedValue('restaurant-1')
  })

  it('rejects POST /team without STAFF_INVITE or STAFF_MANAGE', async () => {
    const app = mount(['STAFF_VIEW', 'SETTINGS_VIEW'])
    const response = await request(app)
      .post('/api/restaurant-onboarding/team')
      .send({
        name: 'Alex',
        email: 'alex@example.com',
        role: 'kitchen',
      })
      .expect(403)

    expect(response.body.error.message).toMatch(/STAFF_INVITE/)
  })

  it('rejects PATCH /profile without SETTINGS_EDIT', async () => {
    const app = mount(['SETTINGS_VIEW'])
    const response = await request(app)
      .patch('/api/restaurant-onboarding/profile')
      .send({ taxId: '123' })
      .expect(403)

    expect(response.body.error.message).toMatch(/SETTINGS_EDIT/)
  })

  it('updates profile by restaurant id, not contact email', async () => {
    const app = mount(['SETTINGS_EDIT', 'SETTINGS_VIEW'])
    query.mockResolvedValue({
      rows: [{ id: 'restaurant-1', tax_id: '123' }],
    })

    await request(app)
      .patch('/api/restaurant-onboarding/profile')
      .send({ taxId: '123' })
      .expect(200)

    const updateCall = query.mock.calls.find(([sql]) => String(sql).includes('UPDATE restaurant'))
    expect(updateCall?.[0]).toMatch(/WHERE id =/)
    expect(updateCall?.[1]).toContain('restaurant-1')
    expect(updateCall?.[1]).not.toContain(mockUser.email)
  })

  it('allows POST /team with STAFF_INVITE and tenant restaurant id', async () => {
    const app = mount(['STAFF_INVITE'])
    query.mockResolvedValue({
      rows: [{ id: 'member-1', email: 'alex@example.com' }],
    })

    await request(app)
      .post('/api/restaurant-onboarding/team')
      .send({
        name: 'Alex',
        email: 'alex@example.com',
        role: 'kitchen',
      })
      .expect(201)

    const insertCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO restaurant_team')
    )
    expect(insertCall?.[1]?.[0]).toBe('restaurant-1')
  })

  it('rejects DELETE /team/:id without STAFF_MANAGE', async () => {
    const app = mount(['STAFF_INVITE', 'STAFF_VIEW'])
    const response = await request(app)
      .delete('/api/restaurant-onboarding/team/member-1')
      .expect(403)

    expect(response.body.error.message).toMatch(/STAFF_MANAGE/)
  })
})
