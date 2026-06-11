import { Pool } from 'pg'
import { config } from '../config/env.js'
import { logger } from './logger.js'
import { summarizeQuery } from './log-helpers.js'
import { recordPoolWaitIfNeeded, recordQueryMs } from '../middlewares/request-timing.js'

// Shared pool per process. min:2 + allowExitOnIdle:false keeps warm handles across short idle gaps.
const poolConfig = {
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  min: 2,
  idleTimeoutMillis: config.DATABASE_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,
  keepAlive: true,
}
if (config.DATABASE_SSL) {
  poolConfig.ssl = { rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED }
}
if (config.DATABASE_STATEMENT_TIMEOUT) {
  poolConfig.statement_timeout = config.DATABASE_STATEMENT_TIMEOUT
}
export const pool = new Pool(poolConfig)

let migrationPool = null

function buildPoolConfig(connectionString) {
  const cfg = {
    connectionString,
    max: Math.min(config.DATABASE_POOL_MAX, 5),
    min: 0,
    idleTimeoutMillis: config.DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
    keepAlive: true,
  }
  if (config.DATABASE_SSL) {
    cfg.ssl = { rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED }
  }
  if (config.DATABASE_STATEMENT_TIMEOUT) {
    cfg.statement_timeout = config.DATABASE_STATEMENT_TIMEOUT
  }
  return cfg
}

/** Pool for DDL and numbered SQL migrations — uses direct URL when configured. */
function getMigrationPool() {
  const migrationUrl = config.DATABASE_MIGRATION_URL || config.DATABASE_URL
  if (migrationUrl === config.DATABASE_URL) {
    return pool
  }
  if (!migrationPool) {
    migrationPool = new Pool(buildPoolConfig(migrationUrl))
    migrationPool.on('error', (err) => {
      logger.error('Migration database pool error', { error: err.message, code: err.code })
    })
  }
  return migrationPool
}

/** Run schema DDL / migration SQL (not for hot request paths unless repairing drift). */
export async function migrationQuery(text, params = []) {
  const start = Date.now()
  try {
    const result = await getMigrationPool().query(text, params)
    const duration = Date.now() - start
    if (duration > 500) {
      logger.warn({
        event: 'db.migration.query.slow',
        durationMs: duration,
        rowCount: result.rowCount,
        query: summarizeQuery(text),
      })
    }
    return result
  } catch (error) {
    logger.error({
      event: 'db.migration.query.failed',
      error: error.message,
      code: error.code,
      durationMs: Date.now() - start,
      query: summarizeQuery(text),
    })
    throw error
  }
}

let keepaliveTimer = null
/** Set when the pool opens a new physical connection (used to flag cold connect on a request). */
let lastPoolConnectAt = 0

pool.on('connect', () => {
  lastPoolConnectAt = Date.now()
  logger.debug('Database client connected')
})

function getKeepaliveIntervalMs() {
  if (!config.DB_KEEPALIVE_ENABLED) return 0
  if (config.DB_POOL_KEEPALIVE_MS >= 10_000) return config.DB_POOL_KEEPALIVE_MS
  const sec = config.DB_KEEPALIVE_INTERVAL_SECONDS
  return sec >= 10 ? sec * 1000 : 0
}

/**
 * Warm pool connections after listen so first user request avoids cold TCP/TLS handshake.
 */
export async function warmupPool() {
  if (process.env.NODE_ENV === 'test') return
  try {
    const target = Math.max(1, poolConfig.min || 1)
    await Promise.all(Array.from({ length: target }, () => pool.query('SELECT 1 AS warm')))
    logger.info({
      event: 'db.pool.warmup',
      connections: target,
      idle: pool.idleCount,
      total: pool.totalCount,
    })
  } catch (error) {
    logger.warn({ event: 'db.pool.warmup.failed', error: error.message })
  }
}

/** Lightweight keepalive to prevent Railway/proxy from closing idle connections. */
export function startPoolKeepalive() {
  if (process.env.NODE_ENV === 'test') return
  const intervalMs = getKeepaliveIntervalMs()
  if (!intervalMs) return
  if (keepaliveTimer) return
  keepaliveTimer = setInterval(() => {
    pool.query('SELECT 1').catch((error) => {
      logger.warn({ event: 'db.keepalive.failed', error: error.message })
    })
  }, intervalMs)
  keepaliveTimer.unref?.()
  logger.info({
    event: 'db.keepalive.started',
    intervalMs,
    enabled: config.DB_KEEPALIVE_ENABLED,
  })
}

export function stopPoolKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer)
    keepaliveTimer = null
  }
}

export async function closePool() {
  stopPoolKeepalive()
  await pool.end()
  if (migrationPool) {
    await migrationPool.end()
    migrationPool = null
  }
}

export function getLastPoolConnectAt() {
  return lastPoolConnectAt
}

pool.on('error', (err) => {
  logger.error('Database pool error', { error: err.message, code: err.code })
})

// Transaction helper
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function recordDbConnectIfNeeded(req, queryStartMs) {
  if (!req?._perf || !lastPoolConnectAt) return
  const delta = queryStartMs - lastPoolConnectAt
  if (delta >= 0 && delta < 100) {
    req._perf.stages.dbConnectMs = delta
  }
}

// Query helper with logging (params never logged to avoid PII/tokens)
export async function query(text, params = [], req = null) {
  const start = Date.now()
  if (req?._perf) recordPoolWaitIfNeeded(req)
  recordDbConnectIfNeeded(req, start)
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
    if (req?._perf) recordQueryMs(req, duration)
    if (duration > 500) {
      logger.warn({
        event: 'db.query.slow',
        durationMs: duration,
        rowCount: result.rowCount,
        query: summarizeQuery(text),
      })
    } else if (process.env.LOG_SQL === '1') {
      logger.debug({
        event: 'db.query',
        durationMs: duration,
        rowCount: result.rowCount,
        paramCount: params.length,
        query: summarizeQuery(text),
      })
    }
    return result
  } catch (error) {
    const duration = Date.now() - start
    if (error.code === '42P01') {
      // Table missing (e.g. optional staff feature); caller may handle
    } else {
      logger.error({
        event: 'db.query.failed',
        error: error.message,
        code: error.code,
        durationMs: duration,
        paramCount: params.length,
        query: summarizeQuery(text),
      })
    }
    throw error
  }
}
