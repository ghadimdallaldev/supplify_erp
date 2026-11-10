import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ query: vi.fn(), withTransaction: vi.fn() }))
vi.mock('../lib/audit.js', () => ({ writeAuditLog: vi.fn() }))
vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn(),
}))
vi.mock('../lib/subscription.js', () => ({ requireFeature: () => (req, res, next) => next() }))
vi.mock('../services/order-amendments.service.js', () => ({
  getOrderForAmendment: vi.fn(),
  assertNoPendingAmendment: vi.fn(),
  canAmendOrderStatus: vi.fn(),
  acceptAmendment: vi.fn(),
  notifyAmendmentParty: vi.fn(),
}))

import { createAmendmentSchema } from './order-amendments.routes.js'

const uuid = '3f2b8c1e-6d4a-4b7e-9a21-0c5d7e8f9a10'

describe('createAmendmentSchema (B11)', () => {
  const base = { changeType: 'quantity_change', description: 'more please' }

  it('accepts a positive requested quantity', () => {
    const parsed = createAmendmentSchema.parse({
      ...base,
      items: [{ orderItemId: uuid, requestedQuantity: 3 }],
    })
    expect(parsed.items[0].requestedQuantity).toBe(3)
  })

  it.each([0, -1, -0.5])('rejects requestedQuantity %s', (requestedQuantity) => {
    expect(() =>
      createAmendmentSchema.parse({ ...base, items: [{ orderItemId: uuid, requestedQuantity }] })
    ).toThrow()
  })

  it('rejects a non-positive originalQuantity', () => {
    expect(() =>
      createAmendmentSchema.parse({ ...base, items: [{ orderItemId: uuid, originalQuantity: -2 }] })
    ).toThrow()
  })

  it('does not carry a client unitPrice through (the server owns pricing)', () => {
    const parsed = createAmendmentSchema.parse({
      ...base,
      items: [{ orderItemId: uuid, requestedQuantity: 2, unitPrice: 0.01 }],
    })
    expect(parsed.items[0]).not.toHaveProperty('unitPrice')
  })
})
