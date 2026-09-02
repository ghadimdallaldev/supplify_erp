import { describe, expect, it, vi } from 'vitest'

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

describe('billing gateway registry', () => {
  it('lists stub and manual gateways', async () => {
    const { listBillingGateways } = await import('./gateway-registry.js')
    const gateways = listBillingGateways()
    expect(gateways).toContain('stub')
    expect(gateways).toContain('manual')
  })

  it('returns stub gateway by default', async () => {
    const { getBillingGateway } = await import('./gateway-registry.js')
    const gateway = getBillingGateway()
    expect(gateway.id).toBe('stub')
    expect(typeof gateway.charge).toBe('function')
  })

  it('falls back to stub for unknown provider when not live', async () => {
    const { getBillingGateway } = await import('./gateway-registry.js')
    const gateway = getBillingGateway('unknown-provider')
    expect(gateway.id).toBe('stub')
  })

  it('throws when stub is requested under PAYMENTS_MODE=live', async () => {
    vi.resetModules()
    vi.doMock('../../config/env.js', () => ({
      config: { APP_ENV: 'prod', PAYMENTS_MODE: 'live', BILLING_GATEWAY: 'stub' },
    }))
    const { getBillingGateway } = await import('./gateway-registry.js')
    expect(() => getBillingGateway('stub')).toThrow(/stub.*live/i)
    vi.doUnmock('../../config/env.js')
    vi.resetModules()
  })

  it('registers custom gateway implementations', async () => {
    const { registerBillingGateway, getBillingGateway } = await import('./gateway-registry.js')
    const custom = { id: 'custom-test', charge: async () => ({ status: 'succeeded' }) }
    registerBillingGateway('custom-test', custom)
    expect(getBillingGateway('custom-test').id).toBe('custom-test')
  })
})
