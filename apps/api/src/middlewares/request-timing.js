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
    cacheMisses: {},
    queryMsTotal: 0,
    queryCount: 0,
    poolWaitRecorded: false,
    handlerStartNs: null,
  }

  res.on('finish', () => {
    const totalMs = elapsedMs(req._perf.t0)
    mark(req, 'total', totalMs)

    const path = req.originalUrl?.split('?')[0] || req.path
    const breakdown = buildSlowBreakdown(req, totalMs)
    const perfPayload = {
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: totalMs,
      ...breakdown,
      cacheHits: req._perf.cacheHits,
      cacheMisses: req._perf.cacheMisses,
      dbPool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options.max,
      },
      requestId: req.requestId,
    }

    const idleSampleMs = config.IDLE_PERF_LOG_MS
    if (idleSampleMs > 0 && totalMs >= idleSampleMs && totalMs <= SLOW_REQUEST_MS) {
      logger.info({
        event: 'http.request.perf_sample',
        msg: `Perf sample: ${req.method} ${path} ${totalMs}ms`,
        ...perfPayload,
      })
    }

    if (totalMs <= SLOW_REQUEST_MS) return

    logger.warn({
      event: 'http.request.slow_breakdown',
      msg: `Slow request: ${req.method} ${path} ${totalMs}ms`,
      ...perfPayload,
    })
  })

  next()
}

/**
 * Map internal stage keys to HAR-friendly field names for slow-request logs.
 */
export function buildSlowBreakdown(req, totalMs) {
  const s = req._perf?.stages ?? {}
  const authMs = s.auth ?? 0
  const tenantMs = s.tenant ?? 0
  const billingMs = s.billing ?? 0
  const tenantCtxMs = s.tenantContext ?? 0
  const featureMs = s.feature ?? 0
  const handlerMs = s.handler ?? 0

  const rbacMs = Math.max(0, tenantCtxMs - billingMs)
  const subscriptionMs = billingMs
  const middlewareMs = authMs + tenantMs + tenantCtxMs + featureMs
  const queryMs = req._perf?.queryMsTotal ?? 0
  const serializationMs = Math.max(0, totalMs - middlewareMs - handlerMs - queryMs)

  return {
    authMs,
    userLookupMs: s.userLookup ?? authMs,
    tenantLookupMs: tenantMs,
    restaurantSupplierLookupMs: s.restaurantSupplier ?? 0,
    rbacMs,
    subscriptionMs,
    featureFlagMs: featureMs,
    dbCheckoutMs: s.poolWaiting ?? s.dbCheckout ?? 0,
    dbConnectMs: s.dbConnectMs ?? 0,
    handlerMs,
    queryMs,
    serializationMs,
    totalMs: Math.round(totalMs),
    queryCount: req._perf?.queryCount ?? 0,
    stages: { ...s },
  }
}

export function recordQueryMs(req, durationMs) {
  if (!req?._perf) return
  req._perf.queryMsTotal = (req._perf.queryMsTotal || 0) + durationMs
  req._perf.queryCount = (req._perf.queryCount || 0) + 1
}

export function mark(req, stage, durationMs) {
  if (!req?._perf) return
  if (typeof durationMs === 'number') {
    req._perf.stages[stage] = Math.round(durationMs)
    return
  }
  const start = req._perf[`_start_${stage}`]
  if (start != null) {
    req._perf.stages[stage] = Math.round(elapsedMs(start))
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

export function noteCacheMiss(req, key) {
  if (!req?._perf) return
  req._perf.cacheMisses[key] = true
}

export function recordPoolWaitIfNeeded(req) {
  if (!req?._perf || req._perf.poolWaitRecorded) return
  if (pool.waitingCount > 0) {
    req._perf.poolWaitRecorded = true
    req._perf.stages.poolWaiting = pool.waitingCount
    req._perf.stages.dbCheckout = pool.waitingCount
  }
}

function elapsedMs(startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1_000_000
}
