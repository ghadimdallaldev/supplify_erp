import { beforeEach, describe, expect, it, vi } from 'vitest'

const cfg = vi.hoisted(() => ({ RATE_LIMIT_ENABLED: true }))
const redis = vi.hoisted(() => ({ client: null }))
vi.mock('../config/env.js', () => ({ config: cfg }))
vi.mock('./cache.js', () => ({ getRedisClient: () => redis.client }))

import { consumeRecipientQuota, resetRecipientQuotaMemory } from './recipient-rate-limit.js'

describe('consumeRecipientQuota', () => {
  beforeEach(() => {
    cfg.RATE_LIMIT_ENABLED = true
    redis.client = null
    resetRecipientQuotaMemory()
  })

  it('allows up to the limit per recipient then blocks (in-memory fallback)', async () => {
    const args = { channel: 'email', recipient: 'Victim@Example.com', limit: 3 }
    expect(await consumeRecipientQuota(args)).toBe(true)
    expect(await consumeRecipientQuota(args)).toBe(true)
    expect(await consumeRecipientQuota(args)).toBe(true)
    expect(await consumeRecipientQuota({ ...args, recipient: 'victim@example.com' })).toBe(false)
  })

  it('tracks recipients and channels independently', async () => {
    const one = { channel: 'email', recipient: 'a@x.com', limit: 1 }
    expect(await consumeRecipientQuota(one)).toBe(true)
    expect(await consumeRecipientQuota(one)).toBe(false)
    expect(await consumeRecipientQuota({ ...one, recipient: 'b@x.com' })).toBe(true)
    expect(await consumeRecipientQuota({ ...one, channel: 'whatsapp' })).toBe(true)
  })

  it('uses Redis INCR + EXPIRE when available and hashes the recipient in the key', async () => {
    const incr = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(4)
    const expire = vi.fn()
    redis.client = { incr, expire }
    const args = { channel: 'email', recipient: 'a@x.com', limit: 3 }
    expect(await consumeRecipientQuota(args)).toBe(true)
    expect(await consumeRecipientQuota(args)).toBe(false)
    expect(expire).toHaveBeenCalledTimes(1)
    expect(incr.mock.calls[0][0]).toMatch(/^rl:recipient:email:[0-9a-f]{32}$/)
    expect(incr.mock.calls[0][0]).not.toContain('a@x.com')
  })

  it('is a no-op when rate limiting is disabled', async () => {
    cfg.RATE_LIMIT_ENABLED = false
    for (let i = 0; i < 10; i += 1) {
      expect(
        await consumeRecipientQuota({ channel: 'email', recipient: 'a@x.com', limit: 1 })
      ).toBe(true)
    }
  })
})
