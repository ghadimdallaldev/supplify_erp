import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('../config/supplifyModel.js', () => ({
  isSupplifyV2: vi.fn(),
}))

vi.mock('../lib/restaurant-workspace.js', () => ({
  getRestaurantWorkspaceMode: vi.fn(),
  hasActiveSupplierRestaurantLink: vi.fn().mockResolvedValue(false),
  WORKSPACE_MODE_BUYER_ONLY: 'buyer_only',
}))

vi.mock('../lib/rbac.js', () => ({
  getRequestTenant: vi.fn(),
}))

import { isSupplifyV2 } from '../config/supplifyModel.js'
import { getRestaurantWorkspaceMode } from '../lib/restaurant-workspace.js'

describe('restaurantWorkspaceAccess', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('requireFullRestaurantWorkspace is no-op on V1', async () => {
    isSupplifyV2.mockReturnValue(false)
    const { requireFullRestaurantWorkspace } = await import('./restaurantWorkspaceAccess.js')
    const mw = requireFullRestaurantWorkspace()
    const next = vi.fn()
    const req = { tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' } }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await mw(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('blocks buyer_only workspace on V2', async () => {
    isSupplifyV2.mockReturnValue(true)
    getRestaurantWorkspaceMode.mockResolvedValue('buyer_only')
    const { requireFullRestaurantWorkspace } = await import('./restaurantWorkspaceAccess.js')
    const mw = requireFullRestaurantWorkspace()
    const next = vi.fn()
    const req = { tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' }, requestId: 'req-1' }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await mw(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ name: 'BUYER_WORKSPACE_LIMIT' }),
      })
    )
  })

  it('requireBuyerSupplierCatalogAccess blocks unlinked supplier on V2 buyer', async () => {
    isSupplifyV2.mockReturnValue(true)
    getRestaurantWorkspaceMode.mockResolvedValue('buyer_only')
    const { hasActiveSupplierRestaurantLink } = await import('../lib/restaurant-workspace.js')
    vi.mocked(hasActiveSupplierRestaurantLink).mockResolvedValue(false)

    const { requireBuyerSupplierCatalogAccess } = await import('./restaurantWorkspaceAccess.js')
    const mw = requireBuyerSupplierCatalogAccess()
    const next = vi.fn()
    const req = {
      tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' },
      query: { supplier: 'supplier-x' },
      requestId: 'req-2',
    }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await mw(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ name: 'SUPPLIER_NOT_LINKED' }),
      })
    )
  })
})
