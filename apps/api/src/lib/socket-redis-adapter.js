import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { config } from '../config/env.js'
import { redisIoredisOptions } from '../config/resolve-redis-url.js'
import { logger } from './logger.js'

const REDIS_CONNECT_TIMEOUT_MS = 10_000

/**
 * Wait until ioredis is connected (required before psubscribe with enableOfflineQueue: false).
 * @param {import('ioredis').default} client
 * @param {number} [timeoutMs]
 */
export function waitForRedisReady(client, timeoutMs = REDIS_CONNECT_TIMEOUT_MS) {
  if (client.status === 'ready') {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Redis connect timed out after ${timeoutMs}ms (status: ${client.status})`))
    }, timeoutMs)

    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = (err) => {
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    const cleanup = () => {
      clearTimeout(timer)
      client.off('ready', onReady)
      client.off('error', onError)
    }

    client.once('ready', onReady)
    client.once('error', onError)
  })
}

async function disconnectRedisClients(...clients) {
  await Promise.all(
    clients.filter(Boolean).map((client) => client.quit().catch(() => client.disconnect()))
  )
}

/**
 * Attach Socket.IO Redis adapter for multi-replica broadcast.
 * @param {import('socket.io').Server} io
 * @returns {Promise<boolean>}
 */
export async function attachSocketRedisAdapter(io) {
  if (!config.REDIS_URL) {
    return false
  }

  let pubClient
  let subClient
  try {
    pubClient = new Redis(config.REDIS_URL, redisIoredisOptions({ maxRetriesPerRequest: null }))
    subClient = pubClient.duplicate()
    await Promise.all([waitForRedisReady(pubClient), waitForRedisReady(subClient)])
    io.adapter(createAdapter(pubClient, subClient))
    logger.info('Socket.IO Redis adapter attached')
    return true
  } catch (error) {
    await disconnectRedisClients(pubClient, subClient)
    logger.warn('Socket.IO Redis adapter failed; single-instance broadcast only', {
      error: error.message,
    })
    return false
  }
}
