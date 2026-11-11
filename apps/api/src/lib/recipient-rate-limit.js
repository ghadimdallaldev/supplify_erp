import { createHash } from 'node:crypto'
import { config } from '../config/env.js'
import { getRedisClient } from './cache.js'

/** In-memory fallback (single process) when Redis is not configured. key -> { count, resetAt } */
const memoryBuckets = new Map()

function hashRecipient(recipient) {
  return createHash('sha256')
    .update(String(recipient).trim().toLowerCase())
    .digest('hex')
    .slice(0, 32)
}

function consumeInMemory(key, limit, windowMs, now = Date.now()) {
  if (memoryBuckets.size > 5000) {
    for (const [k, bucket] of memoryBuckets) {
      if (bucket.resetAt <= now) memoryBuckets.delete(k)
    }
  }
  const bucket = memoryBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

/**
 * Per-recipient quota for outbound messages triggered by unauthenticated callers (guest checkout),
 * so one victim email/phone cannot be spammed through many orders from many IPs or suppliers.
 * Redis-backed (INCR + EXPIRE, shared across replicas) with an in-memory fallback. The recipient is
 * hashed in the key. Falls back to memory on Redis errors.
 *
 * @param {{ channel: string, recipient: string, limit?: number, windowMs?: number }} opts
 * @returns {Promise<boolean>} true when the message may be sent
 */
export async function consumeRecipientQuota({
  channel,
  recipient,
  limit = 3,
  windowMs = 60 * 60 * 1000,
}) {
  if (!config.RATE_LIMIT_ENABLED) return true
  if (!recipient || !String(recipient).trim()) return false

  const key = `rl:recipient:${channel}:${hashRecipient(recipient)}`
  const client = getRedisClient()
  if (!client) return consumeInMemory(key, limit, windowMs)

  try {
    const hits = await client.incr(key)
    if (hits === 1) await client.expire(key, Math.ceil(windowMs / 1000))
    return hits <= limit
  } catch {
    return consumeInMemory(key, limit, windowMs)
  }
}

/** Test helper. */
export function resetRecipientQuotaMemory() {
  memoryBuckets.clear()
}
