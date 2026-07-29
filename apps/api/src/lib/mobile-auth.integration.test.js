/**
 * Mobile bearer auth integration: requireAuth, CSRF bypass, RBAC, driver isolation.
 */
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_KEYS as P } from './permission-keys.js'

vi.mock('../config/env.js', () => ({
  config: {
    NODE_ENV: 'development',
    WEB_ORIGINS: ['http://localhost:5173'],
  },
}))

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./auth.js', () => ({
  verifyToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  refreshAccessTokenSingleFlight: vi.fn(),
  getAccessTokenExpiresAtMs: vi.fn().mockReturnValue(Date.now() + 1_200_000),
}))

vi.mock('./auth-session-events.js', () => ({
  emitAuthSessionEvent: vi.fn(),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

import { csrfProtection } from '../middlewares/csrf.js'
import { requireAuth, requireRole, requirePermission } from './rbac.js'

describe('mobile bearer auth integration', () => {
  let app
  let verifyToken
  let query

  beforeEach(async () => {
    vi.clearAllMocks()

    verifyToken = (await import('./auth.js')).verifyToken
    query = (await import('./db.js')).query

    app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'mobile-auth-int'
      next()
    })
    app.use(csrfProtection)

    app.get('/api/protected', requireAuth, (req, res) => {
      res.json({ ok: true, data: { userId: req.userData.id, authMethod: req.authMethod } })
    })

    app.post('/api/protected-mutation', requireAuth, (req, res) => {
      res.json({ ok: true, data: { mutated: true, authMethod: req.authMethod } })
    })

    app.get('/api/supplier-only', requireAuth, requireRole(['SUPPLIER']), (req, res) => {
      res.json({ ok: true, data: { role: req.userData.role } })
    })

    app.get(
      '/api/fulfillment-board',
      requireAuth,
      requirePermission(P.FULFILLMENT_VIEW),
      (req, res) => {
        res.json({ ok: true, data: { board: true } })
      }
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function mockUserLookup(role = 'RESTAURANT') {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-1',
          email: 'user@test.com',
          keycloak_sub: 'sub-1',
          role,
          display_name: 'Test User',
        },
      ],
    })
  }

  it('cookie auth still works on protected GET', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'sub-1' })
    mockUserLookup('RESTAURANT')

    const res = await request(app).get('/api/protected').set('Cookie', 'access_token=cookie-jwt')

    expect(res.status).toBe(200)
    expect(res.body.data.authMethod).toBe('cookie')
    expect(res.body.data.userId).toBe('user-1')
  })

  it('bearer auth works on protected GET', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'sub-1' })
    mockUserLookup('SUPPLIER')

    const res = await request(app).get('/api/protected').set('Authorization', 'Bearer valid.jwt')

    expect(res.status).toBe(200)
    expect(res.body.data.authMethod).toBe('bearer')
  })

  it('rejects invalid bearer token on protected GET', async () => {
    verifyToken.mockRejectedValueOnce(new Error('invalid'))

    const res = await request(app).get('/api/protected').set('Authorization', 'Bearer invalid.jwt')

    expect(res.status).toBe(401)
    expect(res.body.error.name).toBe('JWT_EXPIRED')
  })

  it('bearer mutations skip CSRF and succeed', async () => {
    verifyToken.mockResolvedValue({ sub: 'sub-1' })
    mockUserLookup('RESTAURANT')

    const res = await request(app)
      .post('/api/protected-mutation')
      .set('Authorization', 'Bearer valid.jwt')
      .send({ test: true })

    expect(res.status).toBe(200)
    expect(res.body.data.mutated).toBe(true)
    expect(res.body.data.authMethod).toBe('bearer')
  })

  it('cookie mutations still require CSRF', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'sub-1' })

    const res = await request(app)
      .post('/api/protected-mutation')
      .set('Cookie', 'access_token=cookie-jwt')
      .set('Origin', 'http://localhost:5173')
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error.name).toBe('CSRF_FORBIDDEN')
  })

  it('RBAC works with bearer auth — restaurant blocked from supplier route', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'sub-1' })
    mockUserLookup('RESTAURANT')

    const res = await request(app)
      .get('/api/supplier-only')
      .set('Authorization', 'Bearer valid.jwt')

    expect(res.status).toBe(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
  })

  it('driver bearer token cannot access supplier fulfillment routes', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'sub-driver' })
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'driver-user',
          email: 'driver@test.com',
          keycloak_sub: 'sub-driver',
          role: 'SUPPLIER',
          display_name: 'Driver User',
        },
      ],
    })

    const driverOnly = requirePermission(P.FULFILLMENT_VIEW)
    const driverApp = express()
    driverApp.use(express.json())
    driverApp.use((req, res, next) => {
      req.requestId = 'driver-rbac'
      next()
    })
    driverApp.get(
      '/api/fulfillment-board',
      requireAuth,
      (req, res, next) => {
        req.tenantContext = {
          permissions: [P.DRIVER_DELIVERIES_VIEW, P.DRIVER_DELIVERIES_MANAGE],
          tenantId: 'supplier-1',
          tenantType: 'SUPPLIER',
        }
        next()
      },
      driverOnly,
      (_req, res) => {
        res.json({ ok: true, data: { board: true } })
      }
    )

    const res = await request(driverApp)
      .get('/api/fulfillment-board')
      .set('Authorization', 'Bearer driver.jwt')

    expect(res.status).toBe(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
  })
})
