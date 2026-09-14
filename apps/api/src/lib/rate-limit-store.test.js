import { describe, it, expect, vi, beforeEach } from 'vitest'

const incrMock = vi.fn()
const expireMock = vi.fn()
const ttlMock = vi.fn()
const decrMock = vi.fn()
const delMock = vi.fn()

const redisMock = {
  incr: incrMock,
  expire: expireMock,
  ttl: ttlMock,
  decr: decrMock,
  del: delMock,
}

vi.mock('./cache.js', () => ({
  getRedisClient: vi.fn(),
}))

describe('rate-limit-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns undefined when Redis is unavailable', async () => {
    const { getRedisClient } = await import('./cache.js')
    vi.mocked(getRedisClient).mockReturnValue(null)

    const { createRateLimitStore } = await import('./rate-limit-store.js')
    expect(createRateLimitStore('rl:test')).toBeUndefined()
  })

  it('increments key and sets expiry on first hit', async () => {
    const { getRedisClient } = await import('./cache.js')
    vi.mocked(getRedisClient).mockReturnValue(redisMock)
    incrMock.mockResolvedValue(1)
    expireMock.mockResolvedValue(1)
    ttlMock.mockResolvedValue(60)

    const { createRateLimitStore } = await import('./rate-limit-store.js')
    const store = createRateLimitStore('rl:test')
    store.init({ windowMs: 60_000 })

    const result = await store.increment('user-1')

    expect(incrMock).toHaveBeenCalledWith('rl:test:user-1')
    expect(expireMock).toHaveBeenCalledWith('rl:test:user-1', 60)
    expect(result.totalHits).toBe(1)
    expect(result.resetTime).toBeInstanceOf(Date)
  })

  it('does not reset expiry on subsequent hits', async () => {
    const { getRedisClient } = await import('./cache.js')
    vi.mocked(getRedisClient).mockReturnValue(redisMock)
    incrMock.mockResolvedValue(3)
    ttlMock.mockResolvedValue(45)

    const { createRateLimitStore } = await import('./rate-limit-store.js')
    const store = createRateLimitStore('rl:test')
    store.init({ windowMs: 60_000 })

    const result = await store.increment('user-1')

    expect(expireMock).not.toHaveBeenCalled()
    expect(result.totalHits).toBe(3)
  })

  it('decrements and resets keys', async () => {
    const { getRedisClient } = await import('./cache.js')
    vi.mocked(getRedisClient).mockReturnValue(redisMock)

    const { createRateLimitStore } = await import('./rate-limit-store.js')
    const store = createRateLimitStore('rl:test')

    await store.decrement('user-1')
    await store.resetKey('user-1')

    expect(decrMock).toHaveBeenCalledWith('rl:test:user-1')
    expect(delMock).toHaveBeenCalledWith('rl:test:user-1')
  })
})
