import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnabled = vi.fn()
const state = { fail: false }
vi.mock('./feature-flags.js', () => ({
  isPlatformFeatureEnabled: async (...args) => {
    if (state.fail) throw new Error('redis down')
    return mockEnabled(...args)
  },
}))

describe('maintenance mode (platform_access)', () => {
  beforeEach(() => {
    mockEnabled.mockReset()
    state.fail = false
  })

  it('blocks non-admins only when platform_access is off', async () => {
    const { isPlatformAccessBlocked } = await import('./maintenance-mode.js')
    mockEnabled.mockResolvedValue(true)
    await expect(isPlatformAccessBlocked({ role: 'RESTAURANT' })).resolves.toBe(false)
    mockEnabled.mockResolvedValue(false)
    await expect(isPlatformAccessBlocked({ role: 'SUPPLIER' })).resolves.toBe(true)
    expect(mockEnabled).toHaveBeenCalledWith('platform_access')
  })

  it('never blocks platform admins (no lockout) and fails open on errors', async () => {
    const { isPlatformAccessBlocked } = await import('./maintenance-mode.js')
    mockEnabled.mockResolvedValue(false)
    await expect(isPlatformAccessBlocked({ role: 'ADMIN' })).resolves.toBe(false)
    state.fail = true
    await expect(isPlatformAccessBlocked({ role: 'RESTAURANT' })).resolves.toBe(false)
  })

  it('returns a MAINTENANCE_MODE body', async () => {
    const { maintenanceModeBody } = await import('./maintenance-mode.js')
    expect(maintenanceModeBody({ requestId: 'r' }).error.code).toBe('MAINTENANCE_MODE')
  })
})
