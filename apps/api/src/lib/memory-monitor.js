import process from 'node:process'
import { config } from '../config/env.js'
import { logger } from './logger.js'

function roundMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10
}

/**
 * Snapshot of Node process memory (RSS, heap, external, optional handle counts).
 * Safe to call from health checks and periodic dev monitors.
 */
export function getMemorySnapshot() {
  const mu = process.memoryUsage()
  const snapshot = {
    rssMb: roundMb(mu.rss),
    heapUsedMb: roundMb(mu.heapUsed),
    heapTotalMb: roundMb(mu.heapTotal),
    externalMb: roundMb(mu.external),
    arrayBuffersMb: roundMb(mu.arrayBuffers ?? 0),
  }

  if (typeof process._getActiveHandles === 'function') {
    snapshot.activeHandles = process._getActiveHandles().length
  }
  if (typeof process._getActiveRequests === 'function') {
    snapshot.activeRequests = process._getActiveRequests().length
  }

  return snapshot
}

export function isMemoryDebugEnabled() {
  return config.MEMORY_DEBUG === true || config.NODE_ENV === 'development'
}

export function shouldExposeMemoryOnHealth() {
  if (config.NODE_ENV === 'test') return false
  if (config.MEMORY_HEALTH_EXPOSE === true) return true
  return config.APP_ENV === 'dev'
}

/**
 * Periodic memory logging in development / when MEMORY_DEBUG=1.
 * Returns a stop function for graceful shutdown.
 */
export function startMemoryMonitor(options = {}) {
  if (!isMemoryDebugEnabled() || config.NODE_ENV === 'test') {
    return () => {}
  }

  const intervalMs = options.intervalMs ?? config.MEMORY_LOG_INTERVAL_MS ?? 5 * 60 * 1000
  const warnMb = config.MEMORY_WARN_RSS_MB ?? 512

  const logSnapshot = (reason = 'interval') => {
    const memory = getMemorySnapshot()
    logger.debug({ event: 'memory.snapshot', reason, ...memory })
    if (memory.rssMb >= warnMb) {
      logger.warn({
        event: 'memory.high',
        reason,
        thresholdMb: warnMb,
        ...memory,
      })
    }
  }

  logSnapshot('startup')

  const timer = setInterval(() => logSnapshot('interval'), intervalMs)
  if (typeof timer.unref === 'function') {
    timer.unref()
  }

  return () => clearInterval(timer)
}
