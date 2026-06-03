import { Pool } from 'pg'
import { config } from '../config/env.js'
import { logger } from './logger.js'
import { summarizeQuery } from './log-helpers.js'
import { recordPoolWaitIfNeeded } from '../middlewares/request-timing.js'

// Create connection pool (hosted: DATABASE_SSL=true; rejectUnauthorized defaults false for Railway)
// min:2 keeps two physical connections warm so Railway requests never wait for a cold TCP handshake.
// allowExitOnIdle:false prevents the pool from draining to zero between request bursts.
const poolConfig = {
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,
}
if (config.DATABASE_SSL) {
  poolConfig.ssl = { rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED }
}
if (config.DATABASE_STATEMENT_TIMEOUT) {
  poolConfig.statement_timeout = config.DATABASE_STATEMENT_TIMEOUT
}
export const pool = new Pool(poolConfig)

export async function closePool() {
  await pool.end()
}

pool.on('connect', () => {
  logger.debug('Database client connected')
})

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

// Query helper with logging (params never logged to avoid PII/tokens)
export async function query(text, params = [], req = null) {
  const start = Date.now()
  if (req?._perf) recordPoolWaitIfNeeded(req)
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
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
