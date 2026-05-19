import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { pool } from './db.js'
import { logger } from './logger.js'

const PgSession = connectPgSimple(session)

/**
 * PostgreSQL-backed express-session store (shared across API instances).
 * Falls back to in-memory when NODE_ENV=test.
 */
export function createSessionStore() {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Using in-memory session store (test)')
    return undefined
  }

  const store = new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
    pruneSessionInterval: 15 * 60,
  })

  logger.info('Using PostgreSQL session store')
  return store
}
