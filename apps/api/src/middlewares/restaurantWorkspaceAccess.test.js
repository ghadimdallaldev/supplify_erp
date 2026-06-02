import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('restaurantWorkspaceAccess', () => {
  const prev = process.env.SUPPLIFY_MODEL_VERSION

  afterEach(() => {
    if (prev == null) delete process.env.SUPPLIFY_MODEL_VERSION
    else process.env.SUPPLIFY_MODEL_VERSION = prev
    vi.resetModules()
  })

  it('requireFullRestaurantWorkspace is no-op on V1', async () => {
    delete process.env.SUPPLIFY_MODEL_VERSION
    vi.resetModules()
    const { requireFullRestaurantWorkspace } = await import('./restaurantWorkspaceAccess.js')
    const mw = requireFullRestaurantWorkspace()
    const next = vi.fn()
    const req = { tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' } }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await mw(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })
})
