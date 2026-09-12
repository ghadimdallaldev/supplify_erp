import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/env.js', () => ({
  config: {
    PAYMENTS_SECRET_KEY: 'sk_test_fake',
    NODE_ENV: 'test',
    PAYMENTS_MODE: 'test',
  },
}))

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('stripeGateway', () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = vi.fn()
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
  })

  it('isStripeConfigured is true for sk_ keys', async () => {
    const { isStripeConfigured } = await import('./stripe.js')
    expect(isStripeConfigured()).toBe(true)
  })

  it('charge returns succeeded on PaymentIntent succeeded', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pi_123', status: 'succeeded' }),
    })
    const { stripeGateway } = await import('./stripe.js')
    const result = await stripeGateway.charge({
      amount: 39,
      currency: 'USD',
      providerPaymentMethodId: 'pm_card',
      idempotencyKey: 'boost:1',
      metadata: { type: 'deal_boost' },
    })
    expect(result.status).toBe('succeeded')
    expect(result.providerPaymentId).toBe('pi_123')
    expect(global.fetch).toHaveBeenCalled()
    const [, init] = global.fetch.mock.calls[0]
    expect(init.headers.Authorization).toContain('sk_test_fake')
    expect(init.headers['Idempotency-Key']).toBe('boost:1')
  })

  it('charge returns failed on card decline', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        error: { message: 'Your card was declined.', code: 'card_declined' },
      }),
    })
    const { stripeGateway } = await import('./stripe.js')
    const result = await stripeGateway.charge({
      amount: 39,
      currency: 'USD',
      providerPaymentMethodId: 'pm_fail',
      idempotencyKey: 'boost:fail',
    })
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('card_declined')
  })

  it('refund creates Stripe refund', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 're_1', status: 'succeeded' }),
    })
    const { stripeGateway } = await import('./stripe.js')
    const result = await stripeGateway.refund({
      providerPaymentId: 'pi_123',
      amount: 39,
      currency: 'USD',
      reason: 'admin_refund',
      idempotencyKey: 'refund:1',
    })
    expect(result.status).toBe('succeeded')
    expect(result.providerRefundId).toBe('re_1')
  })
})
