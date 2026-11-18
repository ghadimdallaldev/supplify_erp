import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  permissions: [],
  roles: [],
  commandCenter: vi.fn(),
  runSheet: vi.fn(),
}))
vi.mock('../lib/cache.js', () => ({
  getCache: vi.fn(async () => null),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
}))
vi.mock('../lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  withTransaction: vi.fn(),
}))
vi.mock('../config/env.js', () => ({
  config: { NODE_ENV: 'test', APP_ENV: 'dev', RATE_LIMIT_ENABLED: false },
}))
vi.mock('../lib/rbac.js', async (original) => ({
  ...(await original()),
  requireAuth: (req, _res, next) => {
    req.userData = { id: 'user-1', role: 'SUPPLIER' }
    next()
  },
  resolveTenantContext: (req, _res, next) => {
    req.tenantContext = {
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      permissions: state.permissions,
      roles: state.roles,
    }
    next()
  },
  getRequestTenant: async (req) => req.tenantContext,
}))
vi.mock('../services/supplier-command-center.service.js', () => ({
  getSupplierCommandCenter: state.commandCenter,
}))
vi.mock('../services/supplier-run-sheet.service.js', () => ({
  getSupplierRunSheet: state.runSheet,
}))

import { supplierOpsRoutes } from './supplier-ops.routes.js'

const financePriority = {
  id: 'overdue-invoices',
  type: 'finance',
  title: 'Confidential balance 9543',
  href: '/app/invoices',
}
const ordersPriority = { id: 'orders-action', type: 'orders', title: '2 orders need action' }
const commandPayload = {
  kpis: { unpaidBalance: 9543, overdueBalance: 9543, ordersToPrepareToday: 2 },
  todaysPriorities: [financePriority, ordersPriority],
  needsAttention: [financePriority, ordersPriority],
  previews: {
    receivables: { topDebtors: [{ restaurantName: 'Confidential customer', balanceDue: 9543 }] },
    deliveries: [{ orderId: 'order-1' }],
  },
}
const runSheetPayload = {
  date: '2026-11-17',
  summary: {
    kpis: commandPayload.kpis,
    todaysPriorities: commandPayload.todaysPriorities,
    receivablesByCurrency: [{ currency: 'USD', unpaidTotal: 9543, overdueTotal: 9543 }],
  },
  ordersToPick: { count: 2, orders: [] },
  receivablesDueToday: {
    summary: {
      count: 1,
      totalBalanceDue: 9543,
      byCurrency: [{ currency: 'USD', totalBalanceDue: 9543 }],
      dueTodayCount: 0,
      overdueCount: 1,
    },
    invoices: [{ id: 'confidential-invoice', balanceDue: 9543 }],
  },
}
const app = express()
app.use('/api/supplier', supplierOpsRoutes)

beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = ['FULFILLMENT_VIEW']
  state.roles = ['Warehouse Manager']
  state.commandCenter.mockResolvedValue(structuredClone(commandPayload))
  state.runSheet.mockResolvedValue(structuredClone(runSheetPayload))
})

describe('supplier summary financial access', () => {
  it('does not expose balances, debtors or financial priorities through command center access', async () => {
    const response = await request(app).get('/api/supplier/command-center').expect(200)
    expect(response.body.data.kpis).toMatchObject({
      unpaidBalance: null,
      overdueBalance: null,
      ordersToPrepareToday: 2,
    })
    expect(response.body.data.previews.receivables).toBeNull()
    expect(response.body.data.todaysPriorities).toEqual([ordersPriority])
    expect(response.body.data.needsAttention).toEqual([ordersPriority])
    expect(JSON.stringify(response.body)).not.toMatch(/9543|Confidential/)
  })

  it('does not expose invoice rows or currency totals through run-sheet access', async () => {
    const response = await request(app).get('/api/supplier/run-sheet').expect(200)
    expect(response.body.data.summary.kpis).toMatchObject({
      unpaidBalance: null,
      overdueBalance: null,
    })
    expect(response.body.data.summary.receivablesByCurrency).toEqual([])
    expect(response.body.data.summary.todaysPriorities).toEqual([ordersPriority])
    expect(response.body.data.receivablesDueToday).toEqual({
      summary: {
        count: 0,
        totalBalanceDue: null,
        byCurrency: [],
        dueTodayCount: 0,
        overdueCount: 0,
      },
      invoices: [],
    })
    expect(response.body.data.ordersToPick.count).toBe(2)
    expect(JSON.stringify(response.body)).not.toContain('9543')
    expect(JSON.stringify(response.body)).not.toContain('confidential-invoice')
  })

  it('does not mutate a shared cached response when redacting it', async () => {
    const shared = structuredClone(commandPayload)
    state.commandCenter.mockResolvedValue(shared)
    await request(app).get('/api/supplier/command-center').expect(200)
    expect(shared).toEqual(commandPayload)
    state.permissions = ['INVOICES_VIEW']
    const response = await request(app).get('/api/supplier/command-center').expect(200)
    expect(response.body.data).toEqual(commandPayload)
  })

  it.each(['INVOICES_VIEW', 'INVOICES_MANAGE'])(
    'preserves authorized finance data for %s',
    async (permission) => {
      state.permissions = [permission]
      const response = await request(app).get('/api/supplier/run-sheet').expect(200)
      expect(response.body.data).toEqual(runSheetPayload)
    }
  )

  it('preserves the existing trusted Owner permission bypass', async () => {
    state.permissions = []
    state.roles = ['Owner']
    const response = await request(app).get('/api/supplier/run-sheet').expect(200)
    expect(response.body.data).toEqual(runSheetPayload)
  })

  it('rejects a driver-only account before loading the tenant-wide run sheet', async () => {
    state.permissions = ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE']
    state.roles = ['Driver']
    await request(app).get('/api/supplier/run-sheet').expect(403)
    expect(state.runSheet).not.toHaveBeenCalled()
  })
})
