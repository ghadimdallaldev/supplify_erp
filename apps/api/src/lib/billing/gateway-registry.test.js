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

  it('falls back to stub for unknown provider', async () => {
    const { getBillingGateway } = await import('./gateway-registry.js')
    const gateway = getBillingGateway('unknown-provider')
    expect(gateway.id).toBe('stub')
  })

  it('registers custom gateway implementations', async () => {
    const { registerBillingGateway, getBillingGateway } = await import('./gateway-registry.js')
    const custom = { id: 'custom-test', charge: async () => ({ status: 'succeeded' }) }
    registerBillingGateway('custom-test', custom)
    expect(getBillingGateway('custom-test').id).toBe('custom-test')
  })
})
