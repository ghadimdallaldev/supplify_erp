import { describe, expect, it, vi } from 'vitest'
import {
  consumerCheckoutPayloadHash,
  findConsumerCheckoutReplay,
} from './consumer-checkout-idempotency.js'
describe('guest checkout idempotency', () => {
  it('canonicalizes object key order, excludes the key, and binds the authenticated guest', () => {
    const payload = {
      branchId: 'b1',
      guestName: 'Guest',
      deliveryAddress: { city: 'Beirut', line1: 'Main' },
      lines: [{ menuItemId: 'p1', quantity: 2 }],
    }
    expect(consumerCheckoutPayloadHash({ ...payload, idempotencyKey: 'key1' })).toBe(
      consumerCheckoutPayloadHash({
        ...payload,
        idempotencyKey: 'key2',
        deliveryAddress: { line1: 'Main', city: 'Beirut' },
      })
    )
    expect(consumerCheckoutPayloadHash({ ...payload, consumerMemberId: 'member1' })).not.toBe(
      consumerCheckoutPayloadHash({ ...payload, consumerMemberId: 'member2' })
    )
  })
  it('rejects key reuse with changed data before reading another order receipt', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ payload_hash: 'original', consumer_order_id: 'o1' }] })
    await expect(findConsumerCheckoutReplay(query, 'r1', 'key', 'changed')).rejects.toMatchObject({
      name: 'IDEMPOTENCY_KEY_REUSED',
    })
    expect(query).toHaveBeenCalledOnce()
  })
})
