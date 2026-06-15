import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const columnExistsMock = vi.fn()
const queryMock = vi.fn()

vi.mock('../../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
}))

vi.mock('../../lib/ensure-tenant-branding-schema.js', () => ({
  columnExists: (...args) => columnExistsMock(...args),
}))

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import tenantsRouter from './tenants.js'

const BASE_SUPPLIER_COLUMNS = new Set([
  'slug',
  'organization_id',
  'is_main_branch',
  'contact_email',
])

function columnExistsImplementation(table, column) {
  if (table === 'supplier') {
    return Promise.resolve(BASE_SUPPLIER_COLUMNS.has(column))
  }
  if (table === 'restaurant') {
    return Promise.resolve(
      ['slug', 'organization_id', 'is_main_branch', 'contact_email'].includes(column)
    )
  }
  return Promise.resolve(false)
}

describe('admin-dashboard tenants routes', () => {
  let app
  const capturedSql = []

  beforeEach(() => {
    capturedSql.length = 0
    columnExistsMock.mockReset()
    queryMock.mockReset()
    columnExistsMock.mockImplementation(columnExistsImplementation)
    queryMock.mockImplementation((sql) => {
      capturedSql.push(String(sql))
      if (String(sql).includes('FROM supplier s')) {
        return Promise.resolve({
          rows: [
            {
              id: 'supplier-1',
              name: 'Demo Supplier',
              slug: 'demo-supplier',
              organization_id: 'org-1',
              is_main_branch: true,
              contact_email: 'sales@demo.test',
              subscription_status: 'ACTIVE',
              plan_name: 'Gold',
              plan_code: 'gold',
              tenant_type: 'SUPPLIER',
            },
          ],
        })
      }
      if (String(sql).includes('FROM restaurant r')) {
        return Promise.resolve({
          rows: [
            {
              id: 'restaurant-1',
              name: 'Demo Restaurant',
              slug: 'demo-restaurant',
              organization_id: 'org-2',
              is_main_branch: true,
              contact_email: 'hello@demo.test',
              subscription_status: 'ACTIVE',
              plan_name: 'Silver',
              plan_code: 'silver',
              tenant_type: 'RESTAURANT',
            },
          ],
        })
      }
      return Promise.resolve({ rows: [] })
    })

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request'
      next()
    })
    app.use('/api/admin-dashboard', tenantsRouter)
  })

  it('GET /tenants/search omits missing supplier contact columns from SQL', async () => {
    const res = await request(app).get('/api/admin-dashboard/tenants/search?q=demo')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.tenants).toHaveLength(2)

    const supplierSql = capturedSql.find((sql) => sql.includes('FROM supplier s'))
    expect(supplierSql).toBeTruthy()
    expect(supplierSql).not.toContain('sales_contact_email')
    expect(supplierSql).not.toContain('accounting_contact_email')
    expect(supplierSql).toContain('COALESCE(s.contact_email) AS contact_email')
  })

  it('GET /tenants/search includes optional supplier contact columns when present', async () => {
    columnExistsMock.mockImplementation((table, column) => {
      if (table === 'supplier') {
        return Promise.resolve(
          [
            'slug',
            'organization_id',
            'is_main_branch',
            'contact_email',
            'sales_contact_email',
            'accounting_contact_email',
          ].includes(column)
        )
      }
      return columnExistsImplementation(table, column)
    })

    const res = await request(app).get('/api/admin-dashboard/tenants/search?type=SUPPLIER')

    expect(res.status).toBe(200)
    const supplierSql = capturedSql.find((sql) => sql.includes('FROM supplier s'))
    expect(supplierSql).toContain(
      'COALESCE(s.contact_email, s.sales_contact_email, s.accounting_contact_email) AS contact_email'
    )
  })

  it('GET /tenants/search filters org branches when orgMainOnly=true', async () => {
    queryMock.mockImplementation((sql) => {
      capturedSql.push(String(sql))
      if (String(sql).includes('FROM supplier s')) {
        return Promise.resolve({
          rows: [
            {
              id: 'supplier-main',
              name: 'Main Supplier',
              slug: 'main-supplier',
              organization_id: 'org-1',
              is_main_branch: true,
              contact_email: 'main@demo.test',
              tenant_type: 'SUPPLIER',
            },
            {
              id: 'supplier-branch',
              name: 'Branch Supplier',
              slug: 'branch-supplier',
              organization_id: 'org-1',
              is_main_branch: false,
              contact_email: 'branch@demo.test',
              tenant_type: 'SUPPLIER',
            },
          ],
        })
      }
      return Promise.resolve({ rows: [] })
    })

    const res = await request(app).get(
      '/api/admin-dashboard/tenants/search?type=SUPPLIER&orgMainOnly=true'
    )

    expect(res.status).toBe(200)
    expect(res.body.data.tenants).toHaveLength(1)
    expect(res.body.data.tenants[0].id).toBe('supplier-main')
  })

  it('GET /tenants/suppliers omits missing logo_url from SQL', async () => {
    queryMock.mockImplementation((sql) => {
      capturedSql.push(String(sql))
      if (String(sql).includes('COUNT(*)::int AS total FROM supplier')) {
        return Promise.resolve({ rows: [{ total: 1 }] })
      }
      if (String(sql).includes('FROM supplier s') && String(sql).includes('product_count')) {
        return Promise.resolve({ rows: [{ id: 'supplier-1', name: 'Demo Supplier' }] })
      }
      return Promise.resolve({ rows: [] })
    })

    const res = await request(app).get('/api/admin-dashboard/tenants/suppliers?limit=50&offset=0')

    expect(res.status).toBe(200)
    const supplierSql = capturedSql.find(
      (sql) => sql.includes('FROM supplier s') && sql.includes('product_count')
    )
    expect(supplierSql).toBeTruthy()
    expect(supplierSql).not.toContain('s.logo_url')
    expect(supplierSql).toContain('NULL::text AS logo_url')
  })
})
