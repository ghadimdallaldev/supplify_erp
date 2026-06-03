import { config } from '../config/env.js'
import { pool } from '../lib/db.js'
import { logger } from '../lib/logger.js'

const SLOW_REQUEST_MS = config.SLOW_REQUEST_MS

/**
 * Initialize per-request performance tracking. Register first in server.js.
 */
export function requestTimingMiddleware(req, res, next) {
  req._perf = {
    t0: process.hrtime.bigint(),
    stages: {},
    cacheHits: {},
    poolWaitRecorded: false,
  }

  res.on('finish', () => {
    const totalMs = elapsedMs(req, 'total', req._perf.t0)
    mark(req, 'total', totalMs)

    if (totalMs <= SLOW_REQUEST_MS) return

    const path = req.originalUrl?.split('?')[0] || req.path
    const stages = { ...req._perf.stages }
    logger.warn({
      event: 'http.request.slow_breakdown',
      msg: `Slow request: ${req.method} ${path} ${totalMs}ms`,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: totalMs,
      stages,
      cacheHits: req._perf.cacheHits,
      dbPool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options.max,
      },
      requestId: req.requestId,
    })
  })

  next()
}

/**
 * Record stage duration in ms. Pass startNs from process.hrtime.bigint() or omit for incremental mark.
 */
export function mark(req, stage, durationMs) {
  if (!req?._perf) return
  if (typeof durationMs === 'number') {
    req._perf.stages[stage] = Math.round(durationMs)
    return
  }
  const start = req._perf[`_start_${stage}`]
  if (start != null) {
    req._perf.stages[stage] = Math.round(elapsedMs(req, stage, start))
    delete req._perf[`_start_${stage}`]
  }
}

export function startStage(req, stage) {
  if (!req?._perf) return
  req._perf[`_start_${stage}`] = process.hrtime.bigint()
}

export function noteCacheHit(req, key) {
  if (!req?._perf) return
  req._perf.cacheHits[key] = true
}

export function recordPoolWaitIfNeeded(req) {
  if (!req?._perf || req._perf.poolWaitRecorded) return
  if (pool.waitingCount > 0) {
    req._perf.poolWaitRecorded = true
    req._perf.stages.poolWaiting = pool.waitingCount
  }
}

function elapsedMs(_req, _stage, startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1_000_000
}
