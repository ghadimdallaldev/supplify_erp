/**
 * Lightweight conversion funnel tracking (no analytics vendor).
 * Events: VIEW_PLANS, BLOCKED_FEATURE, BLOCKED_LIMIT, OPEN_UPGRADE, UPGRADE_SUCCESS
 */
import { query } from './db.js'
import { logger } from './logger.js'

export const ALLOWED_TYPES = [
  'VIEW_PLANS',
  'BLOCKED_FEATURE',
  'BLOCKED_LIMIT',
  'OPEN_UPGRADE',
  'UPGRADE_SUCCESS',
  'CLICK_UPGRADE',
  'CLOSE_UPGRADE_MODAL',
  'DOWNGRADE_ATTEMPT_BLOCKED',
  'RECOMMENDATION_SHOWN',
  'RECOMMENDATION_CLICKED',
]

/**
 * Record a conversion funnel event. Non-blocking; logs and continues on error.
 * @param {string} tenantId
 * @param {string} tenantType - 'RESTAURANT' | 'SUPPLIER'
 * @param {string} eventType - One of ALLOWED_TYPES
 * @param {Object} [metadata] - Optional payload (e.g. limitKey, featureKey, planCode)
 */
export async function recordConversionEvent(tenantId, tenantType, eventType, metadata = {}) {
  if (!ALLOWED_TYPES.includes(eventType)) {
    logger.warn('Conversion event type not allowed', { eventType })
    return
  }
  try {
    await query(
      `INSERT INTO conversion_event (tenant_id, tenant_type, event_type, metadata_json)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, tenantType, eventType, JSON.stringify(metadata || {})]
    )
  } catch (e) {
    if (e.code === '42P01') {
      logger.debug('conversion_event table not yet created')
      return
    }
    logger.error('Record conversion event failed', {
      error: e.message,
      tenantId,
      tenantType,
      eventType,
    })
  }
}
