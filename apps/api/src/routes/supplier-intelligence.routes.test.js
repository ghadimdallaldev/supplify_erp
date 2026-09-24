import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  listSupplierSlowMovingInventory,
  listSupplierDemandForecast,
  listSupplierStockoutRisks,
  listSupplierCrossSellOpportunities,
  getRequestTenant,
  gates,
} = vi.hoisted(() => ({
  listSupplierSlowMovingInventory: vi.fn(),
  listSupplierDemandForecast: vi.fn(),
  listSupplierStockoutRisks: vi.fn(),
  listSupplierCrossSellOpportunities: vi.fn(),
  getRequestTenant: vi.fn(),
  gates: {
    inventory: true,
    smartReorder: true,
    forecast: true,
    tier: 'scale',
    permissions: new Set(['WAREHOUSES_VIEW', 'ORDERS_VIEW']),
    order: [],
  },
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
    if (feature === 'smart_reorder' && !gates.smartReorder) {
      return res.status(403).json({ ok: false })
    }
    return next()
  },
}))

vi.mock('../lib/feature-flags.js', () => ({
  getResolvedFeatureValue: vi.fn().mockResolvedValue('ai_forecast_seasonality'),
}))
vi.mock('../lib/smart-reorder-tier.js', () => ({
  hasSmartReorderCapability: vi.fn(() => {
    gates.order.push('capability:forecast')
    return gates.forecast
  }),
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
vi.mock('../services/supplier-demand-forecast.service.js', () => ({ listSupplierDemandForecast }))
vi.mock('../services/supplier-stockout-intelligence.service.js', () => ({
  listSupplierStockoutRisks,
}))
vi.mock('../services/supplier-cross-sell-intelligence.service.js', () => ({
  listSupplierCrossSellOpportunities,
}))

const { supplierOpsRoutes } = await import('./supplier-ops.routes.js')

function buildApp() {
  const app = express()
  app.use('/api/supplier', supplierOpsRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  gates.inventory = true
  gates.smartReorder = true
  gates.forecast = true
  gates.tier = 'scale'
  gates.permissions = new Set(['WAREHOUSES_VIEW', 'ORDERS_VIEW'])
  gates.order = []
  getRequestTenant.mockResolvedValue({ tenantId: 'supplier-1', tenantType: 'SUPPLIER' })
  listSupplierSlowMovingInventory.mockResolvedValue({ products: [], coverage: {}, windowDays: 90 })
  listSupplierDemandForecast.mockResolvedValue({ forecasts: [], coverage: {}, horizonDays: 14 })
  listSupplierStockoutRisks.mockResolvedValue({ risks: [], coverage: {}, horizonDays: 14 })
  listSupplierCrossSellOpportunities.mockResolvedValue({ opportunities: [], observationDays: 180 })
})

describe('supplier slow-moving inventory route', () => {
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
})

describe('supplier cross-sell route', () => {
  it('requires order visibility and Supplier Scale before reading cross-sell evidence', async () => {
    const res = await request(buildApp())
      .get('/api/supplier/cross-sell-opportunities?days=120&limit=5')
      .expect(200)

    expect(res.body).toMatchObject({
      ok: true,
      data: { opportunities: [] },
      requestId: 'test-request',
    })
    expect(gates.order).toEqual(['auth', 'tenant', 'role', 'permission:ORDERS_VIEW', 'tier:scale'])
    expect(listSupplierCrossSellOpportunities).toHaveBeenCalledWith('supplier-1', {
      days: '120',
      limit: '5',
    })
  })

  it('does not invoke cross-sell analysis without order visibility or Scale intelligence', async () => {
    gates.permissions = new Set(['WAREHOUSES_VIEW'])
    await request(buildApp()).get('/api/supplier/cross-sell-opportunities').expect(403)
    expect(listSupplierCrossSellOpportunities).not.toHaveBeenCalled()

    gates.permissions = new Set(['ORDERS_VIEW'])
    gates.tier = 'basic'
    await request(buildApp()).get('/api/supplier/cross-sell-opportunities').expect(403)
    expect(listSupplierCrossSellOpportunities).not.toHaveBeenCalled()
  })
})

describe('supplier stockout risk route', () => {
  it('requires both source permissions, forecast capability, and Supplier Scale in authorization order', async () => {
    const res = await request(buildApp())
      .get('/api/supplier/stockout-risks?horizon_days=21&limit=5')
      .expect(200)

    expect(res.body).toMatchObject({ ok: true, data: { risks: [] }, requestId: 'test-request' })
    expect(gates.order).toEqual([
      'auth',
      'tenant',
      'role',
      'permission:ORDERS_VIEW',
      'permission:WAREHOUSES_VIEW',
      'feature:smart_reorder',
      'capability:forecast',
      'tier:scale',
    ])
    expect(listSupplierStockoutRisks).toHaveBeenCalledWith('supplier-1', {
      horizonDays: '21',
      limit: '5',
    })
  })

  it('does not invoke stockout analysis without warehouse visibility or forecast capability', async () => {
    gates.permissions = new Set(['ORDERS_VIEW'])
    await request(buildApp()).get('/api/supplier/stockout-risks').expect(403)
    expect(listSupplierStockoutRisks).not.toHaveBeenCalled()

    gates.permissions = new Set(['ORDERS_VIEW', 'WAREHOUSES_VIEW'])
    gates.forecast = false
    await request(buildApp()).get('/api/supplier/stockout-risks').expect(403)
    expect(listSupplierStockoutRisks).not.toHaveBeenCalled()
  })
})
describe('supplier demand forecast route', () => {
  it('requires order visibility, forecasting capability, and Supplier Scale in authorization order', async () => {
    const res = await request(buildApp())
      .get('/api/supplier/demand-forecast?horizon_days=21&limit=5')
      .expect(200)

    expect(res.body).toMatchObject({ ok: true, data: { forecasts: [] }, requestId: 'test-request' })
    expect(gates.order).toEqual([
      'auth',
      'tenant',
      'role',
      'permission:ORDERS_VIEW',
      'feature:smart_reorder',
      'capability:forecast',
      'tier:scale',
    ])
    expect(listSupplierDemandForecast).toHaveBeenCalledWith('supplier-1', {
      horizonDays: '21',
      limit: '5',
    })
  })

  it('does not invoke the forecast service without a forecast capability or Scale intelligence', async () => {
    gates.forecast = false
    await request(buildApp()).get('/api/supplier/demand-forecast').expect(403)
    expect(listSupplierDemandForecast).not.toHaveBeenCalled()

    gates.forecast = true
    gates.tier = 'basic'
    await request(buildApp()).get('/api/supplier/demand-forecast').expect(403)
    expect(listSupplierDemandForecast).not.toHaveBeenCalled()
  })

  it('uses the session supplier rather than a requested supplier id', async () => {
    await request(buildApp())
      .get('/api/supplier/demand-forecast?supplierId=other-supplier')
      .expect(200)

    expect(listSupplierDemandForecast.mock.calls[0][0]).toBe('supplier-1')
  })
})
