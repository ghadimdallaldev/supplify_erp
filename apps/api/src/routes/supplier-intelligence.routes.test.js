import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listSupplierSlowMovingInventory, getRequestTenant, gates } = vi.hoisted(() => ({
  listSupplierSlowMovingInventory: vi.fn(),
  getRequestTenant: vi.fn(),
  gates: { inventory: true, tier: 'scale', permissions: new Set(['WAREHOUSES_VIEW']), order: [] },
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, _res, next) => {
    gates.order.push('auth')
    req.requestId = 'test-request'
    next()
  },
  resolveTenantContext: (req, _res, next) => {
    gates.order.push('tenant')
    req.tenantContext = { tenantId: 'supplier-1', tenantType: 'SUPPLIER' }
    next()
  },
  requireRole: () => (_req, _res, next) => {
    gates.order.push('role')
    next()
  },
  requirePermission: (permission) => (_req, res, next) => {
    gates.order.push(`permission:${permission}`)
    if (!gates.permissions.has(permission)) return res.status(403).json({ ok: false })
    return next()
  },
  requireAnyPermission: () => (_req, _res, next) => next(),
  getRequestTenant: (...args) => getRequestTenant(...args),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: (feature) => (_req, res, next) => {
    gates.order.push(`feature:${feature}`)
    if (feature === 'inventory_management' && !gates.inventory) {
      return res.status(403).json({ ok: false })
    }
    return next()
  },
}))

vi.mock('../lib/intelligence-tier.js', () => ({
  requireIntelligenceTier: (tier) => (_req, res, next) => {
    gates.order.push(`tier:${tier}`)
    if (gates.tier !== 'scale') return res.status(403).json({ ok: false })
    return next()
  },
}))

vi.mock('../lib/tenant-resolve.js', () => ({ requireSupplierId: vi.fn() }))
vi.mock('../services/supplier-slow-moving-intelligence.service.js', () => ({
  listSupplierSlowMovingInventory,
}))

const { supplierOpsRoutes } = await import('./supplier-ops.routes.js')

function buildApp() {
  const app = express()
  app.use('/api/supplier', supplierOpsRoutes)
  return app
}

describe('supplier slow-moving inventory route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gates.inventory = true
    gates.tier = 'scale'
    gates.permissions = new Set(['WAREHOUSES_VIEW'])
    gates.order = []
    getRequestTenant.mockResolvedValue({ tenantId: 'supplier-1', tenantType: 'SUPPLIER' })
    listSupplierSlowMovingInventory.mockResolvedValue({
      products: [],
      coverage: {},
      windowDays: 90,
    })
  })

  it('requires warehouse visibility, inventory management, and Supplier Scale in authorization order', async () => {
    const res = await request(buildApp())
      .get('/api/supplier/slow-moving-inventory?days=120&limit=5')
      .expect(200)

    expect(res.body).toMatchObject({ ok: true, data: { products: [] }, requestId: 'test-request' })
    expect(gates.order).toEqual([
      'auth',
      'tenant',
      'role',
      'permission:WAREHOUSES_VIEW',
      'feature:inventory_management',
      'tier:scale',
    ])
    expect(listSupplierSlowMovingInventory).toHaveBeenCalledWith('supplier-1', {
      days: '120',
      limit: '5',
    })
  })

  it('does not invoke the service when warehouse visibility or Scale intelligence is absent', async () => {
    gates.permissions = new Set()
    await request(buildApp()).get('/api/supplier/slow-moving-inventory').expect(403)
    expect(listSupplierSlowMovingInventory).not.toHaveBeenCalled()

    gates.permissions = new Set(['WAREHOUSES_VIEW'])
    gates.tier = 'basic'
    await request(buildApp()).get('/api/supplier/slow-moving-inventory').expect(403)
    expect(listSupplierSlowMovingInventory).not.toHaveBeenCalled()
  })

  it('uses the session supplier rather than a requested supplier id', async () => {
    await request(buildApp())
      .get('/api/supplier/slow-moving-inventory?supplierId=other-supplier')
      .expect(200)

    expect(listSupplierSlowMovingInventory.mock.calls[0][0]).toBe('supplier-1')
  })
})
