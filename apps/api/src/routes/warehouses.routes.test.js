import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockSupplierUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.userData = req.userData || { ...mockSupplierUser }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      permissions: ['WAREHOUSES_VIEW', 'WAREHOUSES_MANAGE'],
    }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/plan-enforcement.js', () => ({
  checkWarehouseLimit: vi.fn().mockResolvedValue({ allowed: true, reason: null }),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import warehousesRoutes from './warehouses.routes.js'

describe('Warehouses Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockSupplierUser, email: 'supplier@example.com', role: 'SUPPLIER' }
      next()
    })
    app.use('/api/warehouses', warehousesRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/warehouses', () => {
    it('should return warehouses for supplier (supplier_id column)', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ column_name: 'supplier_id' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'wh-1', name: 'Main Warehouse', supplier_id: 'supplier-1' }],
        })

      const response = await request(app).get('/api/warehouses').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.warehouses).toHaveLength(1)
      expect(response.body.data.warehouses[0].name).toBe('Main Warehouse')
    })

    it('should return 400 when supplier not found', async () => {
      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getSupplierIdForRequest).mockResolvedValueOnce(null)

      const response = await request(app).get('/api/warehouses').expect(400)

      expect(response.body.ok).toBe(false)
      expect(response.body.error.name).toBe('BAD_REQUEST')
    })
  })
})
