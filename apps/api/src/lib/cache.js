import Redis from 'ioredis'
import { config } from '../config/env.js'
import { logger } from './logger.js'

let redisClient = null

if (config.REDIS_URL) {
  try {
    redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })

    redisClient.on('error', (error) => {
      const log = logger.warn ?? logger.info ?? logger.error
      if (typeof log === 'function') {
        log.call(logger, 'Redis connection error for calendar cache', { error: error.message })
      }
    })

    redisClient.on('connect', () => {
      if (typeof logger.info === 'function') {
        logger.info('Redis connection established for calendar cache')
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
}

const memoryCache = new Map()

function setMemoryCache(key, value, ttlSeconds) {
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
