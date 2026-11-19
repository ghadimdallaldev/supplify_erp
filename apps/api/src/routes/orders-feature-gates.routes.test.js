/**
 * Wiring test: the default-on kill switches on /api/orders fire on the right paths/methods.
 * Sub-routers are stubbed; the gate records which feature key it was asked about.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const hits = []

vi.mock('../lib/tenant-feature-gate.js', () => ({
  tenantFeatureGate: (key) =>
    Object.assign(
      (_req, _res, next) => {
        hits.push(key)
        next()
      },
      { featureKey: key }
    ),
}))
vi.mock('../lib/rbac.js', () => {
  const pass = (_req, _res, next) => next()
  return { requireAuth: pass, resolveTenantContext: pass, requirePermission: () => pass }
})
vi.mock('../lib/route-permissions.js', () => ({
  ordersRouterMutationGuard: (_req, _res, next) => next(),
}))
vi.mock('./orders/orders.helpers.js', () => ({ createInvoiceFromOrder: vi.fn() }))

async function stubRouter() {
  const { default: exp } = await import('express')
  const r = exp.Router()
  r.all('*', (_req, res) => res.status(200).json({ ok: true }))
  return r
}
vi.mock('./orders-driver.routes.js', async () => {
  const { default: exp } = await import('express')
  return { ordersDriverRoutes: exp.Router() }
})
vi.mock('./orders/list.js', async () => ({ default: (await import('express')).default.Router() }))
vi.mock('./orders/warehouses.js', async () => ({
  default: (await import('express')).default.Router(),
}))
vi.mock('./orders/detail.js', async () => ({ default: (await import('express')).default.Router() }))
vi.mock('./orders/create.js', async () => ({ default: (await import('express')).default.Router() }))
vi.mock('./orders/update.js', async () => ({ default: (await import('express')).default.Router() }))
vi.mock('./orders/documents.js', async () => ({ default: await stubRouter() }))

async function app() {
  const { ordersRoutes } = await import('./orders/index.js')
  const a = express()
  a.use(express.json())
  a.use('/api/orders', ordersRoutes)
  return a
}

describe('orders default-on feature gates', () => {
  beforeEach(() => {
    hits.length = 0
  })

  it.each([
    ['post', '/api/orders', ['order_management', 'ordering']],
    ['post', '/api/orders/manual', ['order_management', 'ordering']],
    ['get', '/api/orders', ['order_management']],
    ['get', '/api/orders/o1', ['order_management']],
    ['get', '/api/orders/o1/warehouses', ['order_management', 'order_warehouse_dispatch']],
    ['patch', '/api/orders/o1/warehouses/a1', ['order_management', 'order_warehouse_dispatch']],
    ['get', '/api/orders/o1/packing-slip/pdf', ['order_management', 'packing_slips']],
    ['post', '/api/orders/o1/remind', ['order_management', 'order_reminders']],
  ])('%s %s → %j', async (method, path, expected) => {
    await request(await app())
      [method](path)
      .send({})
    expect(hits).toEqual(expected)
  })
})
