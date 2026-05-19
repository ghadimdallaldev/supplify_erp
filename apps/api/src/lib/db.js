import { Pool } from 'pg'
import { config } from '../config/env.js'
import { logger } from './logger.js'

// Create connection pool (production: set DATABASE_SSL=true, optional DATABASE_STATEMENT_TIMEOUT)
const poolConfig = {
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
}
if (config.DATABASE_SSL) {
  poolConfig.ssl = { rejectUnauthorized: true }
}
if (config.DATABASE_STATEMENT_TIMEOUT) {
  poolConfig.statement_timeout = config.DATABASE_STATEMENT_TIMEOUT
}
export const pool = new Pool(poolConfig)

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
export async function query(text, params = []) {
  const start = Date.now()
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
    if (duration > 500) {
      logger.warn('Slow query', {
        durationMs: duration,
        rowCount: result.rowCount,
        queryPreview: text.substring(0, 80),
      })
    }
    return result
  } catch (error) {
    const duration = Date.now() - start
    if (error.code === '42P01') {
      // Table missing (e.g. optional staff feature); caller may handle
    } else {
      logger.error('Query failed', {
        error: error.message,
        code: error.code,
        durationMs: duration,
        queryPreview: text.substring(0, 100),
      })
    }
    throw error
  }
}
