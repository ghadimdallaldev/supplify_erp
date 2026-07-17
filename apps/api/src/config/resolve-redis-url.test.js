import { describe, expect, it } from 'vitest'
import {
  isLikelyPublicRedisUrl,
  redisIoredisOptions,
  resolveRedisUrl,
} from './resolve-redis-url.js'

describe('resolveRedisUrl', () => {
  it('uses private REDIS_URL when set', () => {
    expect(
      resolveRedisUrl({
        redisUrl: 'redis://default:secret@redis.railway.internal:6379',
      })
    ).toBe('redis://default:secret@redis.railway.internal:6379')
  })

  it('does not fall back to REDIS_PUBLIC_URL', () => {
    expect(
      resolveRedisUrl({
        redisPublicUrl: 'redis://default:secret@autorack.proxy.rlwy.net:12345',
      })
    ).toBe('')
  })

  it('detects public proxy hosts', () => {
    expect(isLikelyPublicRedisUrl('redis://x@foo.proxy.rlwy.net:6379')).toBe(true)
    expect(isLikelyPublicRedisUrl('redis://x@redis.railway.internal:6379')).toBe(false)
  })
})

describe('redisIoredisOptions', () => {
  it('enables dual-stack DNS for Railway private network', () => {
    expect(redisIoredisOptions()).toMatchObject({ family: 0 })
    expect(redisIoredisOptions({ maxRetriesPerRequest: null }).maxRetriesPerRequest).toBe(null)
  })
})
