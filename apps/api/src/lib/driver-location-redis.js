import { config } from '../config/env.js'
import { getRedisClient } from './cache.js'
import { logger } from './logger.js'

function ttlSeconds() {
  return Math.max(30, Number(config.GPS_STALE_AFTER_SECONDS || 300) * 2)
}

export function driverLocationKeys({ sessionId, driverId }) {
  return {
    session: sessionId ? `driver-location:session:${sessionId}` : null,
    driver: driverId ? `driver-location:driver:${driverId}` : null,
    status: driverId ? `driver-tracking-status:${driverId}` : null,
  }
}

export async function setLatestDriverLocation({ sessionId, driverId, location, status = null }) {
  const client = getRedisClient()
  if (!client || client.status !== 'ready') return false
  const keys = driverLocationKeys({ sessionId, driverId })
  const payload = JSON.stringify(location)
  try {
    const writes = [keys.driver && client.set(keys.driver, payload, 'EX', ttlSeconds())]
    if (keys.session) writes.push(client.set(keys.session, payload, 'EX', ttlSeconds()))
    if (keys.status && status)
      writes.push(client.set(keys.status, JSON.stringify(status), 'EX', ttlSeconds()))
    await Promise.all(writes.filter(Boolean))
    return true
  } catch (error) {
    logger.warn('Driver location Redis write failed; PostgreSQL remains authoritative', {
      error: error.message,
    })
    return false
  }
}

export async function getLatestDriverLocation({ sessionId, driverId }) {
  const client = getRedisClient()
  if (!client || client.status !== 'ready') return null
  const key =
    driverLocationKeys({ sessionId, driverId }).session ||
    driverLocationKeys({ sessionId, driverId }).driver
  if (!key) return null
  try {
    const value = await client.get(key)
    return value ? JSON.parse(value) : null
  } catch (error) {
    logger.warn('Driver location Redis read failed; using PostgreSQL fallback', {
      error: error.message,
    })
    return null
  }
}
