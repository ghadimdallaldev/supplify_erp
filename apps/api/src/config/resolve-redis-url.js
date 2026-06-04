/**
 * Resolve Redis URL for API runtime. Use private REDIS_URL on Railway (not REDIS_PUBLIC_URL).
 */

/** @param {string | undefined} url */
export function isLikelyPublicRedisUrl(url) {
  if (!url) return false
  return (
    /proxy\.rlwy\.net/i.test(url) || /RAILWAY_TCP_PROXY/i.test(url) || /REDIS_PUBLIC_URL/i.test(url)
  )
}

/**
 * @param {{ redisUrl?: string; redisPublicUrl?: string }} [input]
 */
export function resolveRedisUrl(input = {}) {
  const explicit = (input.redisUrl ?? process.env.REDIS_URL ?? '').trim()
  const publicUrl = (input.redisPublicUrl ?? process.env.REDIS_PUBLIC_URL ?? '').trim()

  if (explicit) {
    return explicit
  }

  // Never fall back to REDIS_PUBLIC_URL for in-project API ↔ Redis (egress fees).
  if (publicUrl) {
    return ''
  }

  return ''
}

/** ioredis options for Railway private DNS (IPv4 + IPv6). See Railway Redis troubleshooting. */
export function redisIoredisOptions(overrides = {}) {
  return {
    family: 0,
    enableOfflineQueue: false,
    ...overrides,
  }
}
