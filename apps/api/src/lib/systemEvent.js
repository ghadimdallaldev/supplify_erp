/**
 * Write system events for observability (health dashboard, recent errors).
 * Non-blocking; failures are logged but not thrown.
 */
import { query } from './db.js'
import { logger } from './logger.js'

/**
 * @param {object} opts
 * @param {string} opts.type - e.g. 'api_error', 'job_failure', 'webhook_failure', 'email_failure'
 * @param {string} [opts.severity] - 'info' | 'warn' | 'error'
 * @param {string} [opts.source] - e.g. 'orders.routes', 'scheduled-orders'
 * @param {object} [opts.payload] - arbitrary JSON
 */
export async function writeSystemEvent(opts) {
  const { type, severity = 'error', source = null, payload = {} } = opts
  try {
    await query(
      `INSERT INTO system_event (type, severity, source, payload) VALUES ($1, $2, $3, $4)`,
      [type, severity, source || null, JSON.stringify(payload)]
    )
  } catch (err) {
    if (err.code === '42P01') logger.warn('system_event table missing')
    else logger.error('writeSystemEvent failed', { error: err.message })
  }
}
