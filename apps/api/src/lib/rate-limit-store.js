import { getRedisClient } from './cache.js'

/**
 * express-rate-limit v7 store backed by the shared ioredis client (INCR + EXPIRE).
 * @see https://github.com/express-rate-limit/express-rate-limit/wiki/Creating-Your-Own-Store
 */
class RedisRateLimitStore {
  /** @param {string} prefix */
  constructor(prefix) {
    this.prefix = prefix
    /** @type {import('ioredis').default} */
    this.client = getRedisClient()
    /** @type {number | undefined} */
    this.windowMs = undefined
  }

  /** @param {{ windowMs: number }} options */
  init(options) {
    this.windowMs = options.windowMs
  }

  /** @param {string} key */
  redisKey(key) {
    return `${this.prefix}:${key}`
  }

  /** @param {string} key */
  async increment(key) {
    const redisKey = this.redisKey(key)
    const totalHits = await this.client.incr(redisKey)

    if (totalHits === 1) {
      const windowSec = Math.ceil((this.windowMs ?? 60000) / 1000)
      await this.client.expire(redisKey, windowSec)
    }

    const ttlSec = await this.client.ttl(redisKey)
    const resetTime = new Date(Date.now() + (ttlSec > 0 ? ttlSec * 1000 : (this.windowMs ?? 60000)))

    return { totalHits, resetTime }
  }

  /** @param {string} key */
  async decrement(key) {
    await this.client.decr(this.redisKey(key))
  }

  /** @param {string} key */
  async resetKey(key) {
    await this.client.del(this.redisKey(key))
  }
}

/**
 * @param {string} prefix Redis key prefix for this limiter (e.g. rl:auth)
 * @returns {RedisRateLimitStore | undefined} Store instance, or undefined to use in-memory fallback
 */
export function createRateLimitStore(prefix) {
  const client = getRedisClient()
  if (!client) {
    return undefined
  }

  return new RedisRateLimitStore(prefix)
}
