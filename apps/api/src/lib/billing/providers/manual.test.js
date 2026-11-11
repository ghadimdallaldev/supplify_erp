import { afterEach, describe, expect, it } from 'vitest'
import { config } from '../../../config/env.js'
import { manualGateway } from './manual.js'

describe('manualGateway', () => {
  const originalGateway = config.BILLING_GATEWAY

  afterEach(() => {
    config.BILLING_GATEWAY = originalGateway
  })

  it('settles charges while manual is the configured gateway (pilot mode)', async () => {
    config.BILLING_GATEWAY = 'manual'
    expect((await manualGateway.charge({ amount: 49 })).status).toBe('succeeded')
    expect((await manualGateway.chargeOffSession({ amount: 49 })).status).toBe('succeeded')
  })

  it('never settles a stored manual method once another gateway is configured', async () => {
    config.BILLING_GATEWAY = 'stripe'
    const result = await manualGateway.charge({ amount: 49, currency: 'USD' })
    expect(result.status).not.toBe('succeeded')
    expect(result.failureCode).toBe('MANUAL_PAYMENT_REQUIRES_ADMIN_CONFIRMATION')
    const offSession = await manualGateway.chargeOffSession({ amount: 49, currency: 'USD' })
    expect(offSession.status).not.toBe('succeeded')
  })

  it('still tokenizes payment methods for admin-recorded payments', async () => {
    const pm = await manualGateway.tokenizePaymentMethod({ type: 'BANK_ACCOUNT', card: {} })
    expect(pm.providerPaymentMethodId).toMatch(/^pm_manual_/)
  })
})
