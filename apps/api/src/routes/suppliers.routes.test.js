import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Mock db before importing routes
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        permissions: ['SETTINGS_MANAGE', 'WAREHOUSES_MANAGE'],
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
      }
      next()
    },
    getRequestTenant: vi.fn().mockResolvedValue({
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      tenantName: 'Test Supplier',
    }),
    optionalAuth: vi.fn(async (req, res, next) => {
      if (!req.userData) {
        req.userData = { ...mockUser }
      }
      next()
    }),
  })
})

vi.mock('../lib/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  const silentLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
  return {
    ...actual,
    logger: silentLogger,
    createModuleLogger: () => silentLogger,
  }
})

vi.mock('../services/reviews.service.js', () => ({
  getSupplierRatingSummary: vi.fn().mockResolvedValue({ avg_overall: 0, review_count: 0 }),
  getRecentReviewsForSupplier: vi.fn().mockResolvedValue([]),
  getSupplierRatingSummariesBatch: vi.fn().mockResolvedValue(new Map()),
  getRecentReviewsForSuppliersBatch: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('../services/store-deals.service.js', () => ({
  getActiveStoreWideDealsBatch: vi.fn().mockResolvedValue(new Map()),
  formatStoreDealLabel: vi.fn(),
}))

// Import routes after mocks
import { suppliersRoutes } from './suppliers.routes.js'

describe('Suppliers Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()

    // Sync db mocks
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, role: 'RESTAURANT', email: 'test@example.com' }
      next()
    })
    app.use('/api/suppliers', suppliersRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/suppliers', () => {
    it('should return list of suppliers', async () => {
      // Mock: restaurant lookup (for RESTAURANT role with userData), then suppliers query, then count query
      // The route checks if req.userData?.role === 'RESTAURANT' and queries restaurant table
      // Then queries suppliers, then queries count for pagination
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'supplier-1',
              name: 'Test Supplier',
              contact_email: 'supplier@example.com',
              phone: '1234567890',
              product_count: 5,
              avg_price: 10.5,
              is_followed: false,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: '1' }], // Count query for pagination
        })

      const response = await request(app).get('/api/suppliers').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.suppliers).toHaveLength(1)
    })

    it('includes store-wide deal badges on supplier list', async () => {
      const { getActiveStoreWideDealsBatch } = await import('../services/store-deals.service.js')

      vi.mocked(getActiveStoreWideDealsBatch).mockResolvedValueOnce(
        new Map([
          [
            'supplier-1',
            {
              id: 'deal-1',
              type: 'percentage_discount',
              discount_value: 15,
              label: '15% off',
            },
          ],
        ])
      )

      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'supplier-1',
              name: 'Test Supplier',
              contact_email: 'supplier@example.com',
              product_count: 5,
              avg_price: 10.5,
              is_followed: false,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
        })

      const response = await request(app).get('/api/suppliers').expect(200)

      expect(response.body.data.suppliers[0]).toMatchObject({
        has_store_deal: true,
        store_deal_label: '15% off',
        store_deal_id: 'deal-1',
      })
      expect(getActiveStoreWideDealsBatch).toHaveBeenCalledOnce()
    })
  })

  describe('GET /api/suppliers/:id', () => {
    it('should return supplier details', async () => {
      // Mock: restaurant lookup (for RESTAURANT role), then supplier query
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'supplier-1',
            name: 'Test Supplier',
            contact_email: 'supplier@example.com',
            phone: '1234567890',
            address: '123 Main St',
            product_count: 5,
            avg_price: 10.5,
          },
        ],
      })

      const response = await request(app).get('/api/suppliers/supplier-1').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.supplier.id).toBe('supplier-1')
    })
  })
})
