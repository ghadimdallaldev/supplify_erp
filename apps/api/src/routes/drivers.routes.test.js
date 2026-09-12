import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createMockApp, setupMocks, clearAllMocks, mockSupplierUser } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
  }
})
vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
  requireWithinLimit: () => (_req, _res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))
vi.mock('../lib/rbac.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
    resolveAdminContext: (_req, _res, next) => next(),
    resolveTenantContext: (_req, _res, next) => {
      _req.tenantContext = {
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: ['FULFILLMENT_VIEW', 'FULFILLMENT_MANAGE'],
      }
      next()
    },
    requirePermission: () => (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    requireAuth: (_req, _res, next) => next(),
  }
})
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe('drivers routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

    const { driversRoutes } = await import('./drivers.routes.js')
    app = createMockApp(driversRoutes, {
      userData: { ...mockSupplierUser, id: 'user-1', email: 's@test.com' },
    })
  })

  it('GET / lists drivers for supplier', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'd1',
          supplier_id: 'supplier-1',
          full_name: 'Alex Driver',
          is_active: true,
        },
      ],
    })
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.data.drivers).toHaveLength(1)
    expect(res.body.data.drivers[0].full_name).toBe('Alex Driver')
  })

  it('DELETE /:id blocks when active deliveries exist', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', supplier_id: 'supplier-1', full_name: 'Alex', is_active: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'a1' }],
      })
    const res = await request(app).delete('/d1')
    expect(res.status).toBe(409)
    expect(res.body.error.name).toBe('ACTIVE_DELIVERIES')
  })
})
