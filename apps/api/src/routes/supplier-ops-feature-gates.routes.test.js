/**
 * Wiring test: default-on kill switches on /api/supplier fire on the right paths.
 * The gate stub records the key and short-circuits with 418 so handlers never run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const hits = []

vi.mock('../lib/tenant-feature-gate.js', () => ({
  tenantFeatureGate: (key) =>
    Object.assign(
      (_req, res) => {
        hits.push(key)
        res.status(418).json({ gated: key })
      },
      { featureKey: key }
    ),
}))
vi.mock('../lib/rbac.js', () => {
  const pass = (_req, _res, next) => next()
  return {
    requireAuth: pass,
    resolveTenantContext: pass,
    requireRole: () => pass,
    requirePermission: () => pass,
    requireAnyPermission: () => pass,
    getRequestTenant: vi.fn(async () => ({ tenantId: 's1', tenantType: 'SUPPLIER' })),
  }
})
vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
}))
vi.mock('../lib/intelligence-tier.js', () => ({
  requireIntelligenceTier: () => (_req, _res, next) => next(),
}))
vi.mock('../lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  withTransaction: vi.fn(),
}))

async function app() {
  const { supplierOpsRoutes } = await import('./supplier-ops.routes.js')
  const a = express()
  a.use(express.json())
  a.use('/api/supplier', supplierOpsRoutes)
  return a
}

describe('supplier-ops default-on feature gates', () => {
  beforeEach(() => {
    hits.length = 0
  })

  it.each([
    ['get', '/api/supplier/command-center', 'ops_dashboard'],
    ['get', '/api/supplier/run-sheet', 'ops_dashboard'],
    ['post', '/api/supplier/products/import/preview', 'catalog_import'],
    ['get', '/api/supplier/products/import/job-1', 'catalog_import'],
    ['post', '/api/supplier/products/images/import', 'catalog_import'],
    ['get', '/api/supplier/products/p1/substitutes', 'product_substitutes'],
    ['delete', '/api/supplier/products/p1/substitutes/s1', 'product_substitutes'],
    ['get', '/api/supplier/orders/o1/substitutions', 'product_substitutes'],
    ['get', '/api/supplier/orders/o1/fulfillment-issues', 'fulfillment_issues'],
    ['post', '/api/supplier/orders/o1/fulfillment-issues/shortage', 'fulfillment_issues'],
  ])('%s %s → %s', async (method, path, key) => {
    const res = await request(await app())
      [method](path)
      .send({})
    expect(res.status).toBe(418)
    expect(hits).toEqual([key])
  })
})
