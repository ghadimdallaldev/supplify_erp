import Redis from 'ioredis'
import { config } from '../config/env.js'
import { redisIoredisOptions } from '../config/resolve-redis-url.js'
import { logger } from './logger.js'

let redisClient = null

if (config.REDIS_URL) {
  try {
    redisClient = new Redis(config.REDIS_URL, redisIoredisOptions({ maxRetriesPerRequest: 1 }))

    redisClient.on('error', (error) => {
      const log = logger.warn ?? logger.info ?? logger.error
      if (typeof log === 'function') {
        log.call(logger, 'Redis cache connection error', { error: error.message })
      }
    })

    redisClient.on('connect', () => {
      if (typeof logger.info === 'function') {
        logger.info('Redis cache connection established (shared cross-request cache enabled)')
      }
    })
  } catch (error) {
    const log = logger.warn ?? logger.info ?? logger.error
    if (typeof log === 'function') {
      log.call(logger, 'Failed to initialize Redis client, falling back to in-memory cache', {
        error: error.message,
      })
    }
    redisClient = null
  }
} else if (typeof logger.warn === 'function') {
  logger.warn(
    'REDIS_URL is not set — API caches use in-process memory only (no cross-replica sharing)'
  )
}

/** @returns {import('ioredis').default | null} */
export function getRedisClient() {
  return redisClient
}

/** @returns {boolean} */
export function isRedisCacheEnabled() {
  return redisClient != null
}

const MEMORY_CACHE_MAX_ENTRIES = 500
const memoryCache = new Map()
let memoryCacheEvictionLogged = false

function setMemoryCache(key, value, ttlSeconds) {
  if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES && !memoryCache.has(key)) {
    const oldestKey = memoryCache.keys().next().value
    if (oldestKey !== undefined) {
      memoryCache.delete(oldestKey)
      if (!memoryCacheEvictionLogged) {
        memoryCacheEvictionLogged = true
        logger.warn(
          'In-memory cache reached capacity; evicting oldest entries (set REDIS_URL for shared cache)'
        )
      }
    }
  }
  const expiresAt = Date.now() + ttlSeconds * 1000
  memoryCache.set(key, { value, expiresAt })
}

function getMemoryCache(key) {
  const entry = memoryCache.get(key)
  if (!entry) {
    return null
  }

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key)
    return null
  }

  return entry.value
}

export async function getCache(key) {
  if (redisClient) {
    try {
      const value = await redisClient.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      logger.warn('Redis get failed, using memory cache', { error: error.message, key })
    }
  }

  return getMemoryCache(key)
}

export async function setCache(key, value, ttlSeconds = 300) {
  if (redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds)
      return
    } catch (error) {
      logger.warn('Redis set failed, falling back to memory cache', { error: error.message, key })
    }
  }

  setMemoryCache(key, value, ttlSeconds)
}

export async function deleteCache(key) {
  if (redisClient) {
    try {
      await redisClient.del(key)
      return
    } catch (error) {
      logger.warn('Redis del failed, clearing memory cache', { error: error.message, key })
    }
  }
  memoryCache.delete(key)
}

/** Delete all cache entries whose keys start with `prefix` (global feature-flag invalidation). */
export async function deleteCacheByPrefix(prefix) {
  if (redisClient) {
    try {
      let cursor = '0'
      do {
        const [nextCursor, keys] = await redisClient.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100
        )
        cursor = nextCursor
        if (keys.length > 0) {
          await redisClient.del(...keys)
        }
      } while (cursor !== '0')
      return
    } catch (error) {
      logger.warn('Redis prefix delete failed, falling back to memory sweep', {
        error: error.message,
        prefix,
      })
    }
  }
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key)
    }
  }
}

export function isRedisConnected() {
  return Boolean(redisClient && redisClient.status === 'ready')
}

export async function disconnectCache() {
  if (redisClient) {
    try {
      await redisClient.quit()
    } catch (error) {
      logger.warn('Error disconnecting Redis client', { error: error.message })
    }
  }
}
