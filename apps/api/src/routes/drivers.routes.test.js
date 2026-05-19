import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createMockApp, setupMocks, getMockDb } from '../test/helpers.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}))
vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))
vi.mock('../lib/rbac.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
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

describe('drivers routes', () => {
  let app
  let db

  beforeEach(async () => {
    vi.clearAllMocks()
    db = setupMocks()
    const { driversRoutes } = await import('./drivers.routes.js')
    app = createMockApp(driversRoutes, {
      userData: { id: 'user-1', role: 'SUPPLIER', email: 's@test.com' },
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
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'a1', order_id: 'o1', order_status: 'PROCESSING' }],
    })
    const res = await request(app).delete('/d1')
    expect(res.status).toBe(409)
    expect(res.body.error.name).toBe('ACTIVE_DELIVERIES')
  })
})
