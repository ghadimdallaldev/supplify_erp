/**
 * Unified audit logging. All actions should write to audit_logs with:
 * action_type, actor_user_id, actor_admin_role (if admin), tenant_type, tenant_id, target_id, payload_json, request_id, created_at
 */
import { query } from './db.js'
import { logger } from './logger.js'

export function maskIpAddress(ip) {
  if (!ip || typeof ip !== 'string') return null
  const trimmed = ip.replace(/^::ffff:/, '')
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.')
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').filter(Boolean)
    return parts.length >= 2 ? `${parts.slice(0, 3).join(':')}::` : trimmed
  }
  return trimmed
}

export function formatAuditLogRow(row) {
  const payload = row.payload_json || {}
  return {
    id: row.id,
    action: row.action_type,
    resource_type: payload.resource_type || null,
    resource_id: row.target_id || payload.resource_id || null,
    user_name: row.user_name || null,
    user_email: row.user_email || null,
    ip_address: maskIpAddress(payload.ip_address),
    created_at: row.created_at,
    metadata: payload,
  }
}

/**
 * Write an entry to the unified audit_logs table.
 * @param {object} req - Express request (must have req.requestId; req.userData for actor)
 * @param {object} opts
 * @param {string} opts.action_type - Action type (e.g. subscription.plan_change, override.create, impersonation.start)
 * @param {string} [opts.tenant_type] - RESTAURANT | SUPPLIER
 * @param {string} [opts.tenant_id] - UUID
 * @param {string} [opts.target_id] - UUID of target entity
 * @param {object} [opts.payload_json] - Additional payload (resource_type, changes, etc.)
 * @param {string} [opts.actor_admin_role] - Set when actor is admin (e.g. 'ADMIN')
 */
export async function writeAuditLog(req, opts) {
  const requestId = req?.requestId || null
  const actorUserId = req?.userData?.id || null
  const tenantType = opts.tenant_type || req?.tenantContext?.tenantType || null
  const tenantId = opts.tenant_id || req?.tenantContext?.tenantId || null
  const payload = { ...(opts.payload_json || {}) }
  if (opts.tenant_type) payload.tenant_type = opts.tenant_type
  if (opts.tenant_id) payload.tenant_id = opts.tenant_id
  if (opts.target_id) payload.target_id = opts.target_id
  if (!payload.ip_address && req) {
    const ip = req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    if (ip) payload.ip_address = ip
  }
  try {
    await query(
      `
      INSERT INTO audit_logs (
        action_type, actor_user_id, actor_admin_role, tenant_type, tenant_id, target_id, payload_json, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        opts.action_type,
        actorUserId,
        opts.actor_admin_role || (req?.userData?.role === 'ADMIN' ? 'ADMIN' : null),
        tenantType,
        tenantId,
        opts.target_id || null,
        JSON.stringify(payload),
        requestId,
      ]
    )
  } catch (err) {
    if (err.code === '42P01') {
      logger.warn('audit_logs table missing, skipping write', { action_type: opts.action_type })
    } else {
      logger.error('writeAuditLog failed', { error: err.message, action_type: opts.action_type })
    }
  }
}

/**
 * Audit helper for mutation routes — call after successful handler logic.
 */
export async function auditTenantMutation(req, actionType, details = {}) {
  return writeAuditLog(req, {
    action_type: actionType,
    target_id: details.target_id || details.resource_id || null,
    payload_json: {
      resource_type: details.resource_type || null,
      ...details,
    },
  })
}
