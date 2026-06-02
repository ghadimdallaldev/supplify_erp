import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const getBillingStatus = vi.fn()
const getRestaurantWorkspaceMode = vi.fn()

vi.mock('../lib/billing/billing-service.js', () => ({
  getBillingStatus: (...args) => getBillingStatus(...args),
  buildAccountLockedError: () => ({ name: 'ACCOUNT_LOCKED', message: 'locked' }),
}))

vi.mock('../lib/rbac.js', () => ({
  getRequestTenant: vi.fn().mockResolvedValue({
    tenantId: 'restaurant-1',
    tenantType: 'RESTAURANT',
  }),
}))

vi.mock('../lib/impersonation.js', () => ({
  isImpersonating: () => false,
}))

vi.mock('../config/supplifyModel.js', () => ({
  isSupplifyV2: vi.fn(),
}))

vi.mock('../lib/restaurant-workspace.js', () => ({
  getRestaurantWorkspaceMode: (...args) => getRestaurantWorkspaceMode(...args),
  WORKSPACE_MODE_BUYER_ONLY: 'buyer_only',
}))

import { isSupplifyV2 } from '../config/supplifyModel.js'

describe('billingAccessMiddleware buyer_only V2', () => {
  const prev = process.env.SUPPLIFY_MODEL_VERSION

  afterEach(() => {
    if (prev == null) delete process.env.SUPPLIFY_MODEL_VERSION
    else process.env.SUPPLIFY_MODEL_VERSION = prev
    vi.clearAllMocks()
  })

  it('allows POST /api/orders for locked buyer-only restaurant in V2', async () => {
    isSupplifyV2.mockReturnValue(true)
    getRestaurantWorkspaceMode.mockResolvedValue('buyer_only')
    getBillingStatus.mockResolvedValue({
      access: { isLocked: true, lockReason: 'overdue' },
      amountDue: 10,
    })

    const { billingAccessMiddleware } = await import('./billingAccess.js')
    const next = vi.fn()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const req = {
      method: 'POST',
      path: '/api/orders',
      userData: { role: 'RESTAURANT', id: 'u1' },
    }

    await billingAccessMiddleware(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('blocks POST /api/reservations for locked buyer-only in V2', async () => {
    isSupplifyV2.mockReturnValue(true)
    getRestaurantWorkspaceMode.mockResolvedValue('buyer_only')
    getBillingStatus.mockResolvedValue({
      access: { isLocked: true },
      amountDue: 10,
    })

    const { billingAccessMiddleware } = await import('./billingAccess.js')
    const next = vi.fn()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const req = {
      method: 'POST',
      path: '/api/reservations',
      userData: { role: 'RESTAURANT', id: 'u1' },
    }

    await billingAccessMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(402)
    expect(next).not.toHaveBeenCalled()
  })
})
