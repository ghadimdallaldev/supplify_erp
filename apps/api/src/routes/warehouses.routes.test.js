import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockSupplierUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn(async (handler) => handler({ query: queryMock }))
  return {
    query: queryMock,
    pool: { query: queryMock },
    withTransaction: withTransactionMock,
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.userData = req.userData || { ...mockSupplierUser }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveAdminContext: (_req, _res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      permissions: ['WAREHOUSES_VIEW', 'WAREHOUSES_MANAGE'],
      roles: [],
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

vi.mock('../lib/warehouse-helpers.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ensureDefaultWarehouseForPaidSupplier: vi.fn().mockResolvedValue(null),
  }
})

vi.mock('../services/supplier-stock.service.js', () => ({
  seedMissingWarehouseInventoryForSupplier: vi.fn().mockResolvedValue({
    seeded: 0,
    transferredFromInactive: 0,
  }),
  transferWarehouseInventory: vi.fn().mockResolvedValue({ transferred: 0 }),
}))

vi.mock('../services/supplier-order-stock.service.js', () => ({
  syncLegacyMirrorFromWarehouse: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import warehousesRoutes from './warehouses.routes.js'

describe('Warehouses Routes', () => {
  let app
  let db
  let userRole

  beforeEach(async () => {
    clearAllMocks()
    userRole = 'SUPPLIER'
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockSupplierUser, email: 'supplier@example.com', role: userRole }
      next()
    })
    app.use('/api/warehouses', warehousesRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/warehouses', () => {
    it('should return warehouses for supplier (supplier_id column)', async () => {
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('FROM warehouse w')) {
          return {
            rows: [{ id: 'wh-1', name: 'Main Warehouse', supplier_id: 'supplier-1' }],
          }
        }
        return { rows: [] }
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

  describe('PATCH /api/warehouses/:id', () => {
    it('scopes warehouse updates to the supplier and 404s unknown ids for admins', async () => {
      userRole = 'ADMIN'
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('SELECT * FROM warehouse WHERE id')) {
          return { rows: [] }
        }
        if (text.includes('UPDATE warehouse SET')) {
          return { rows: [{ id: 'foreign-wh', name: 'Leaked' }] }
        }
        return { rows: [] }
      })

      const response = await request(app)
        .patch('/api/warehouses/foreign-wh')
        .send({ name: 'Hijacked' })
        .expect(404)

      expect(response.body.error.name).toBe('NOT_FOUND')
      expect(
        db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE warehouse SET'))
      ).toBe(false)
    })

    it('includes supplier ownership in warehouse updates', async () => {
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('SELECT * FROM warehouse WHERE id')) {
          return { rows: [{ id: 'wh-1', supplier_id: 'supplier-1', is_active: true }] }
        }
        if (text.includes('UPDATE warehouse SET')) {
          return { rows: [{ id: 'wh-1', name: 'Renamed' }] }
        }
        return { rows: [] }
      })

      await request(app).patch('/api/warehouses/wh-1').send({ name: 'Renamed' }).expect(200)

      const updateCall = db.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE warehouse SET')
      )
      expect(updateCall?.[0]).toMatch(/supplier_id/)
    })

    it('rejects deactivation when the user only has WAREHOUSES_EDIT', async () => {
      app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.userData = { ...mockSupplierUser, email: 'supplier@example.com', role: 'SUPPLIER' }
        req.tenantContext = {
          tenantId: 'supplier-1',
          tenantType: 'SUPPLIER',
          permissions: ['WAREHOUSES_VIEW', 'WAREHOUSES_EDIT'],
          roles: [],
        }
        next()
      })
      app.use('/api/warehouses', warehousesRoutes)
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('SELECT * FROM warehouse WHERE id')) {
          return {
            rows: [{ id: 'wh-1', supplier_id: 'supplier-1', is_active: true, is_default: false }],
          }
        }
        return { rows: [] }
      })

      const response = await request(app)
        .patch('/api/warehouses/wh-1')
        .send({ is_active: false })
        .expect(403)

      expect(response.body.error.message).toMatch(/WAREHOUSES_MANAGE/)
    })
  })

  describe('PATCH /api/warehouses/routing/rules/:id', () => {
    it('rejects reassigning a rule to another supplier warehouse', async () => {
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('SELECT * FROM warehouse WHERE id')) {
          return { rows: [] }
        }
        if (text.includes('UPDATE warehouse_routing_rule')) {
          return { rows: [{ id: 'rule-1', warehouse_id: 'foreign-wh' }] }
        }
        return { rows: [] }
      })

      const response = await request(app)
        .patch('/api/warehouses/routing/rules/rule-1')
        .send({ warehouse_id: 'foreign-wh' })
        .expect(404)

      expect(response.body.error.name).toBe('NOT_FOUND')
      expect(
        db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE warehouse_routing_rule'))
      ).toBe(false)
    })
  })

  describe('PATCH /api/warehouses/:id/inventory/:productId', () => {
    it('does not zero omitted quantity fields on partial update', async () => {
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('SELECT * FROM warehouse WHERE id')) {
          return { rows: [{ id: 'wh-1', supplier_id: 'supplier-1' }] }
        }
        if (text.includes('SELECT id FROM product')) {
          return { rows: [{ id: 'prod-1' }] }
        }
        if (text.includes('INSERT INTO warehouse_inventory')) {
          return { rows: [{ warehouse_id: 'wh-1', product_id: 'prod-1', reorder_point: 4 }] }
        }
        return { rows: [] }
      })

      await request(app)
        .patch('/api/warehouses/wh-1/inventory/prod-1')
        .send({ reorder_point: 4 })
        .expect(200)

      const insertCall = db.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO warehouse_inventory')
      )
      expect(insertCall?.[1].slice(2, 5)).toEqual([null, null, null])
    })

    it('rejects inventory updates for another supplier product', async () => {
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('SELECT * FROM warehouse WHERE id')) {
          return { rows: [{ id: 'wh-1', supplier_id: 'supplier-1' }] }
        }
        if (text.includes('SELECT id FROM product')) {
          return { rows: [] }
        }
        return { rows: [] }
      })

      const response = await request(app)
        .patch('/api/warehouses/wh-1/inventory/foreign-prod')
        .send({ quantity_available: 10 })
        .expect(404)

      expect(response.body.error.name).toBe('NOT_FOUND')
      expect(
        db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO warehouse_inventory'))
      ).toBe(false)
    })
  })

  describe('POST /api/warehouses/routing/simulate', () => {
    it('scopes simulated stock to the supplier warehouses', async () => {
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('FROM warehouse WHERE') && text.includes('is_active')) {
          return { rows: [{ id: 'wh-1', name: 'Main', is_default: true }] }
        }
        if (text.includes('FROM warehouse_routing_rule')) {
          return { rows: [] }
        }
        if (text.includes('FROM warehouse_inventory')) {
          return { rows: [{ warehouse_id: 'wh-1', product_id: 'prod-1', quantity_available: 5 }] }
        }
        if (text.includes('FROM delivery_zone')) {
          return { rows: [] }
        }
        if (text.includes('FROM product')) {
          return { rows: [{ id: 'prod-1', category_id: null }] }
        }
        return { rows: [] }
      })

      await request(app)
        .post('/api/warehouses/routing/simulate')
        .send({ items: [{ product_id: 'prod-1', quantity: 1 }] })
        .expect(200)

      const stockCall = db.query.mock.calls.find(([sql]) =>
        String(sql).includes('FROM warehouse_inventory')
      )
      expect(stockCall?.[0]).toMatch(/warehouse w/)
      expect(stockCall?.[1]?.[0]).toEqual(['prod-1'])
      expect(stockCall?.[1]?.[1]).toBe('supplier-1')

      const productCall = db.query.mock.calls.find(
        ([sql]) => String(sql).includes('FROM product') && String(sql).includes('category_id')
      )
      expect(productCall?.[0]).toMatch(/supplier_id/)
      expect(productCall?.[1]?.[1]).toBe('supplier-1')
    })
  })

  describe('GET /api/warehouses/:id/inventory', () => {
    it('lists only products owned by the supplier', async () => {
      db.query.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'supplier_id' }] }
        }
        if (text.includes('SELECT * FROM warehouse WHERE id')) {
          return { rows: [{ id: 'wh-1', supplier_id: 'supplier-1' }] }
        }
        if (text.includes('FROM warehouse_inventory')) {
          return { rows: [{ product_id: 'prod-1', product_name: 'Flour' }] }
        }
        return { rows: [] }
      })

      await request(app).get('/api/warehouses/wh-1/inventory').expect(200)

      const inventoryCall = db.query.mock.calls.find(([sql]) =>
        String(sql).includes('FROM warehouse_inventory')
      )
      expect(inventoryCall?.[0]).toMatch(/p\.supplier_id = \$2/)
      expect(inventoryCall?.[1]?.[1]).toBe('supplier-1')
    })
  })
})
