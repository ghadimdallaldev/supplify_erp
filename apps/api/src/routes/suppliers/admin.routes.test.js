import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
  query: mocks.query,
  pool: { query: mocks.query },
}))

vi.mock('../../lib/rbac.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    requireAuth: (req, _res, next) => next(),
    resolveAdminContext: (req, _res, next) => {
      req.adminContext = { permissions: req.userData?.adminPermissions || [] }
      next()
    },
  }
})

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createModuleLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  logEvent: vi.fn(),
  logQueryDebug: vi.fn(),
}))

import adminRouter from './admin.js'

describe('Supplier admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('denies an admin without ADMIN_TENANTS before creating a supplier', async () => {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { id: 'admin-1', role: 'ADMIN', adminPermissions: ['ADMIN_ACCESS'] }
      next()
    })
    app.use('/api/suppliers', adminRouter)

    const response = await request(app)
      .post('/api/suppliers')
      .send({
        name: 'Unauthorized Supplier',
        slug: 'unauthorized-supplier',
        contactEmail: 'owner@example.com',
      })
      .expect(403)

    expect(response.body.error.message).toContain('ADMIN_TENANTS')
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
