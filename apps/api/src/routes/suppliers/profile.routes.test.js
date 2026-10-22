import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockSupplierUser, clearAllMocks } from '../../test/helpers.js'

vi.mock('../../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../../lib/rbac.js', async (importOriginal) => {
  const actual = await importOriginal()
  const { loadRbacRouteMock } = await import('../../test/rbac-route-mock.js')
  return loadRbacRouteMock(async () => actual, {
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        permissions: ['SETTINGS_VIEW', 'SETTINGS_EDIT'],
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
      }
      next()
    },
    resolveAdminContext: (req, res, next) => {
      req.adminContext = {
        permissions: req.userData?.adminPermissions || [],
      }
      next()
    },
    requirePermission: actual.requirePermission,
    requireAnyPermission: actual.requireAnyPermission,
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  })
})

vi.mock('../../lib/logger.js', async (importOriginal) => {
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

vi.mock('../../services/reviews.service.js', () => ({
  getSupplierRatingSummary: vi.fn().mockResolvedValue({ avg_overall: 0, review_count: 0 }),
  getRecentReviewsForSupplier: vi.fn().mockResolvedValue([]),
}))

import profileRouter from './profile.js'

describe('Supplier profile routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()

    const dbModule = await import('../../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockSupplierUser
      req.userData = { ...mockSupplierUser }
      next()
    })
    app.use('/api/suppliers', profileRouter)
  })

  function createAdminApp(adminPermissions) {
    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { id: 'admin-1', role: 'ADMIN', adminPermissions }
      next()
    })
    adminApp.use('/api/suppliers', profileRouter)
    return adminApp
  }

  describe('featured placement admin permissions', () => {
    it('denies the placement queue without growth or finance permission', async () => {
      const response = await request(createAdminApp(['ADMIN_ACCESS']))
        .get('/api/suppliers/featured-placement/admin/active')
        .expect(403)

      expect(response.body.error.message).toContain('ADMIN_GROWTH')
      expect(db.query).not.toHaveBeenCalled()
    })

    it('denies approval without ADMIN_GROWTH', async () => {
      const response = await request(createAdminApp(['ADMIN_FINANCE']))
        .post('/api/suppliers/featured-placement/placement-1/approve')
        .send({})
        .expect(403)

      expect(response.body.error.message).toContain('ADMIN_GROWTH')
      expect(db.query).not.toHaveBeenCalled()
    })

    it('denies an explicit refund without ADMIN_FINANCE', async () => {
      const response = await request(createAdminApp(['ADMIN_GROWTH']))
        .post('/api/suppliers/featured-placement/placement-1/refund')
        .send({ reason: 'test' })
        .expect(403)

      expect(response.body.error.message).toContain('ADMIN_FINANCE')
      expect(db.query).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/suppliers/me', () => {
    it('returns sales, accounting, and logistics contact fields', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'supplier-1',
            name: 'Test Supplier',
            contact_email: 'supplier@example.com',
            sales_contact_email: 'sales@example.com',
            sales_contact_phone: '1111111111',
            accounting_contact_email: 'accounting@example.com',
            accounting_contact_phone: '2222222222',
            logistics_contact_email: 'logistics@example.com',
            logistics_contact_phone: '3333333333',
          },
        ],
      })

      const response = await request(app).get('/api/suppliers/me').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.supplier).toMatchObject({
        id: 'supplier-1',
        sales_contact_email: 'sales@example.com',
        sales_contact_phone: '1111111111',
        accounting_contact_email: 'accounting@example.com',
        accounting_contact_phone: '2222222222',
        logistics_contact_email: 'logistics@example.com',
        logistics_contact_phone: '3333333333',
      })
    })
  })

  describe('GET /api/suppliers/me/business', () => {
    it('returns normalized business settings', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            business_hours_json: {
              monday: { open: '08:00', close: '18:00' },
              sunday: { closed: true },
            },
            minimum_order_amount: '200',
            payment_terms: 'Net 30',
            return_policy: 'Returns within 7 days',
            terms_and_conditions: 'Standard terms',
          },
        ],
      })

      const response = await request(app).get('/api/suppliers/me/business').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.business).toMatchObject({
        minimumOrderAmount: 200,
        paymentTerms: 'Net 30',
        returnPolicy: 'Returns within 7 days',
        termsAndConditions: 'Standard terms',
      })
      expect(response.body.data.business.operatingHours.monday).toEqual({
        open: '08:00',
        close: '18:00',
        closed: false,
      })
      expect(response.body.data.business.operatingHours.sunday.closed).toBe(true)
    })
  })

  describe('PATCH /api/suppliers/me/business', () => {
    it('updates business settings', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            business_hours_json: { monday: { open: '09:00', close: '17:00', closed: false } },
            minimum_order_amount: '150',
            payment_terms: 'COD',
            return_policy: 'No returns',
            terms_and_conditions: 'Updated terms',
          },
        ],
      })

      const response = await request(app)
        .patch('/api/suppliers/me/business')
        .send({
          minimumOrderAmount: 150,
          paymentTerms: 'COD',
          returnPolicy: 'No returns',
          termsAndConditions: 'Updated terms',
          operatingHours: {
            monday: { open: '09:00', close: '17:00', closed: false },
          },
        })
        .expect(200)

      expect(response.body.data.business.minimumOrderAmount).toBe(150)
      expect(response.body.data.business.paymentTerms).toBe('COD')
      expect(db.query).toHaveBeenCalledTimes(1)
    })
  })
})
