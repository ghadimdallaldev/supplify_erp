import { describe, expect, it } from 'vitest'
import { stubGateway } from './stub.js'

describe('stubGateway', () => {
  it('tokenizes valid card numbers', async () => {
    const result = await stubGateway.tokenizePaymentMethod({
      type: 'CARD',
      card: { number: '4242424242424242', expMonth: 12, expYear: 2030 },
    })
    expect(result.type).toBe('CARD')
    expect(result.last4).toBe('4242')
    expect(result.brand).toBe('visa')
    expect(result.providerPaymentMethodId).toMatch(/^pm_stub_/)
  })

  it('rejects invalid card numbers', async () => {
    await expect(
      stubGateway.tokenizePaymentMethod({
        type: 'CARD',
        card: { number: '123', expMonth: 12, expYear: 2030 },
      })
    ).rejects.toMatchObject({ code: 'invalid_card' })
  })

  it('charges successfully by default', async () => {
    const result = await stubGateway.charge({
      amount: 99.5,
      currency: 'USD',
      providerPaymentMethodId: 'pm_stub_ok',
      idempotencyKey: 'idem-1',
    })
    expect(result.status).toBe('succeeded')
    expect(result.providerPaymentId).toMatch(/^pi_stub_/)
  })

  it('simulates decline when payment method id contains fail', async () => {
    const result = await stubGateway.charge({
      amount: 10,
      currency: 'USD',
      providerPaymentMethodId: 'pm_stub_fail_test',
      idempotencyKey: 'idem-2',
    })
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('card_declined')
  })
})
