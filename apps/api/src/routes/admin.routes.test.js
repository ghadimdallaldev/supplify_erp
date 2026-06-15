import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const getRequestTenant = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'UNAUTHORIZED', message: 'Authentication required' },
        requestId: req.requestId,
      })
    }
    next()
  },
  requireRole: (roles) => (req, res, next) => {
    const allowed = Array.isArray(roles) ? roles : [roles]
    if (!allowed.includes(req.userData?.role)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Forbidden' },
        requestId: req.requestId,
      })
    }
    next()
  },
  getRequestTenant: (...args) => getRequestTenant(...args),
}))

vi.mock('../lib/impersonation.js', () => ({
  getEffectiveTenant: vi.fn().mockReturnValue(null),
}))

import { adminRoutes } from './admin.routes.js'

function buildApp(userData) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.requestId = 'test-req'
    req.userData = userData
    next()
  })
  app.use('/api/admin', adminRoutes)
  return app
}

describe('admin.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    getRequestTenant.mockResolvedValue({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      tenantName: 'Test Restaurant',
    })
  })

  it('GET /audit returns 403 for non-admin users', async () => {
    const app = buildApp({ id: 'user-1', role: 'RESTAURANT', email: 'r@test.com' })
    await request(app).get('/api/admin/audit').expect(403)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('GET /audit returns audit logs for admin users', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'log-1', action: 'test.action' }] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })

    const app = buildApp({ id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' })
    const res = await request(app).get('/api/admin/audit').expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.logs).toHaveLength(1)
  })

  it('GET /dashboard returns 403 for non-admin users', async () => {
    queryMock.mockResolvedValue({ rows: [{ count: '3' }] })

    const app = buildApp({ id: 'user-1', role: 'RESTAURANT', email: 'r@test.com' })
    await request(app).get('/api/admin/dashboard').expect(403)
    expect(getRequestTenant).not.toHaveBeenCalled()
  })

  it('GET /dashboard returns platform stats for admin users', async () => {
    queryMock.mockResolvedValue({ rows: [{ count: '3' }] })

    const app = buildApp({ id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' })
    const res = await request(app).get('/api/admin/dashboard').expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.stats).toBeDefined()
    expect(getRequestTenant).toHaveBeenCalled()
  })

  it('GET /dashboard returns platform stats for admin without impersonation', async () => {
    getRequestTenant.mockResolvedValueOnce(null)
    queryMock.mockResolvedValue({ rows: [{ count: '10' }] })

    const app = buildApp({ id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' })
    const res = await request(app).get('/api/admin/dashboard').expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.stats.totalSuppliers).toBeDefined()
  })
})
