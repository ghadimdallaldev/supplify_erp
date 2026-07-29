/**
 * Sanitized auth-session operational events. Never log raw tokens.
 */
import { logger } from './logger.js'

/** @typedef {'AUTH_TOKEN_REFRESH_SUCCEEDED'|'AUTH_TOKEN_REFRESH_FAILED'|'AUTH_REFRESH_TOKEN_REUSED'|'AUTH_SESSION_EXPIRED'|'AUTH_SESSION_REVOKED'|'AUTH_LOGOUT_COMPLETED'|'AUTH_PROACTIVE_REFRESH_TRIGGERED'|'AUTH_REFRESH_SINGLE_FLIGHT_JOINED'|'AUTH_OFFLINE_REFRESH_DEFERRED'} AuthSessionEvent */

const counters = {
  AUTH_TOKEN_REFRESH_SUCCEEDED: 0,
  AUTH_TOKEN_REFRESH_FAILED: 0,
  AUTH_REFRESH_TOKEN_REUSED: 0,
  AUTH_SESSION_EXPIRED: 0,
  AUTH_SESSION_REVOKED: 0,
  AUTH_LOGOUT_COMPLETED: 0,
  AUTH_PROACTIVE_REFRESH_TRIGGERED: 0,
  AUTH_REFRESH_SINGLE_FLIGHT_JOINED: 0,
  AUTH_OFFLINE_REFRESH_DEFERRED: 0,
}

/**
 * @param {AuthSessionEvent} event
 * @param {Record<string, unknown>} [fields]
 */
export function emitAuthSessionEvent(event, fields = {}) {
  if (Object.prototype.hasOwnProperty.call(counters, event)) {
    counters[event] += 1
  }
  logger.info({
    event,
    authSession: true,
    ...fields,
  })
}

/** @internal Test / metrics snapshot */
export function getAuthSessionCounters() {
  return { ...counters }
}

/** @internal */
export function resetAuthSessionCountersForTests() {
  for (const key of Object.keys(counters)) counters[key] = 0
}
