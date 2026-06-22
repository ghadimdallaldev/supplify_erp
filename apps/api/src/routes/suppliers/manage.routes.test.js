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
  const { loadRbacRouteMock } = await import('../../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        permissions: ['SETTINGS_EDIT', 'SETTINGS_VIEW'],
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
      }
      next()
    },
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

vi.mock('../../lib/tenant-profile-cache.js', () => ({
  invalidateTenantProfileCache: vi.fn().mockResolvedValue(undefined),
}))

import manageRouter from './manage.js'

describe('Supplier manage routes', () => {
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
    app.use('/api/suppliers', manageRouter)
  })

  describe('PATCH /api/suppliers/:id', () => {
    it('updates sales, accounting, and logistics contact fields', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'supplier-1', name: 'Test Supplier', contact_email: 'supplier@example.com' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'supplier-1',
              name: 'Test Supplier',
              sales_contact_email: 'sales@example.com',
              sales_contact_phone: '1111111111',
              accounting_contact_email: 'accounting@example.com',
              accounting_contact_phone: '2222222222',
              logistics_contact_email: 'logistics@example.com',
              logistics_contact_phone: '3333333333',
            },
          ],
        })

      const response = await request(app)
        .patch('/api/suppliers/supplier-1')
        .send({
          salesContactEmail: 'sales@example.com',
          salesContactPhone: '1111111111',
          accountingContactEmail: 'accounting@example.com',
          accountingContactPhone: '2222222222',
          logisticsContactEmail: 'logistics@example.com',
          logisticsContactPhone: '3333333333',
        })
        .expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.supplier).toMatchObject({
        sales_contact_email: 'sales@example.com',
        sales_contact_phone: '1111111111',
        accounting_contact_email: 'accounting@example.com',
        accounting_contact_phone: '2222222222',
        logistics_contact_email: 'logistics@example.com',
        logistics_contact_phone: '3333333333',
      })

      const updateSql = db.query.mock.calls[1][0]
      expect(updateSql).toContain('sales_contact_email = $1')
      expect(updateSql).toContain('sales_contact_phone = $2')
      expect(updateSql).toContain('accounting_contact_email = $3')
      expect(updateSql).toContain('accounting_contact_phone = $4')
      expect(updateSql).toContain('logistics_contact_email = $5')
      expect(updateSql).toContain('logistics_contact_phone = $6')
    })

    it('rejects invalid contact email', async () => {
      const response = await request(app)
        .patch('/api/suppliers/supplier-1')
        .send({ salesContactEmail: 'not-an-email' })
        .expect(400)

      expect(response.body.error.name).toBe('VALIDATION_ERROR')
      expect(db.query).not.toHaveBeenCalled()
    })
  })
})
