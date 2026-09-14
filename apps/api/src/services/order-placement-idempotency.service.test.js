import { describe, expect, it, vi } from 'vitest'
import {
  claimOrderPlacementKey,
  hashOrderPlacementPayload,
  IdempotencyConflictError,
} from './order-placement-idempotency.service.js'

const base = {
  restaurantId: 'restaurant-1',
  key: 'checkout-attempt-1',
  requestHash: 'hash-1',
}

function clientFor(...responses) {
  return {
    query: vi.fn(async () => responses.shift() ?? { rows: [] }),
  }
}

describe('order placement idempotency', () => {
  it('hashes equivalent object payloads deterministically', () => {
    expect(hashOrderPlacementPayload({ items: [{ quantity: 2 }], notes: 'x' })).toBe(
      hashOrderPlacementPayload({ notes: 'x', items: [{ quantity: 2 }] })
    )
  })

  it('claims a new key', async () => {
    const client = clientFor({ rows: [] }, { rows: [{ id: 'claim-1', status: 'IN_PROGRESS' }] })

    await expect(claimOrderPlacementKey(client, base)).resolves.toMatchObject({
      enabled: true,
      replay: null,
      id: 'claim-1',
      key: base.key,
    })
    expect(client.query.mock.calls[1][1]).toEqual([base.restaurantId, base.key, base.requestHash])
  })

  it('replays a successful result for an identical key', async () => {
    const response = { order: { id: 'order-1' } }
    const client = clientFor(
      { rows: [] },
      { rows: [] },
      {
        rows: [
          {
            id: 'claim-1',
            request_hash: base.requestHash,
            status: 'SUCCEEDED',
            response_json: response,
          },
        ],
      }
    )

    await expect(claimOrderPlacementKey(client, base)).resolves.toMatchObject({
      enabled: true,
      replay: response,
      id: 'claim-1',
    })
  })

  it('rejects reuse with a different normalized payload', async () => {
    const client = clientFor(
      { rows: [] },
      { rows: [] },
      {
        rows: [
          { id: 'claim-1', request_hash: 'other-hash', status: 'SUCCEEDED', response_json: {} },
        ],
      }
    )

    const error = await claimOrderPlacementKey(client, base).catch((value) => value)
    expect(error).toBeInstanceOf(IdempotencyConflictError)
    expect(error).toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' })
  })

  it('does not expire a committed in-progress key', async () => {
    const client = clientFor(
      { rows: [] },
      { rows: [] },
      {
        rows: [
          {
            id: 'claim-1',
            request_hash: base.requestHash,
            status: 'IN_PROGRESS',
            response_json: null,
          },
        ],
      }
    )

    await expect(claimOrderPlacementKey(client, base)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_IN_PROGRESS',
    })
  })
})
