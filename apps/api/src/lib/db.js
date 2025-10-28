import { Pool } from 'pg';
import { config } from '../config/env.js';
import { logger } from './logger.js';

// Create connection pool
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  logger.info('Database connected');
});

pool.on('error', (err) => {
  logger.error('Database connection error:', err);
});

// Transaction helper
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Query helper with logging
export async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { 
      text: text.substring(0, 100) + '...', 
      duration: `${duration}ms`,
      rowCount: result.rowCount 
    });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query failed', { 
      text: text.substring(0, 200), 
      duration: `${duration}ms`,
      error: error.message,
      details: error,
      params: params || []
    });
    throw error;
  }
}
