import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { config } from '../config/env.js'
import { logger } from './logger.js'

/**
 * Attach Socket.IO Redis adapter for multi-replica broadcast.
 * @param {import('socket.io').Server} io
 * @returns {Promise<boolean>}
 */
export async function attachSocketRedisAdapter(io) {
  if (!config.REDIS_URL) {
    return false
  }
  try {
    const pubClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    })
    const subClient = pubClient.duplicate()
    io.adapter(createAdapter(pubClient, subClient))
    logger.info('Socket.IO Redis adapter attached')
    return true
  } catch (error) {
    logger.warn('Socket.IO Redis adapter failed; single-instance broadcast only', {
      error: error.message,
    })
    return false
  }
}
