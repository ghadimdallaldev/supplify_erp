/**
 * Guards for admin impersonation: read-only while impersonating (all mutations blocked).
 */
import { getEffectiveTenant } from './impersonation.js'
import { writeAuditLog } from './audit.js'

export const IMPERSONATION_RESTRICTED_ACTIONS = {
  BILLING_MUTATION: 'billing_mutation',
  TENANT_DELETE: 'tenant_delete',
  SUBSCRIPTION_CHANGE: 'subscription_change',
  BULK_DELETE: 'bulk_delete',
  NOTIFICATION_SEND: 'notification_send',
  /** Any non-safe HTTP method while impersonating */
  MUTATION: 'mutation',
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Paths that must remain writable while impersonating (exit impersonation, logout).
 */
export function isImpersonationWriteAllowlisted(path) {
  const p = (path || '').split('?')[0]
  return (
    p === '/api/admin-dashboard/impersonate/stop' ||
    p.endsWith('/impersonate/stop') ||
    p === '/auth/logout' ||
    p.endsWith('/auth/logout')
  )
}

async function sendImpersonationRestricted(req, res, actionType) {
  const effective = getEffectiveTenant(req)
  if (!effective) return false

  await writeAuditLog(req, {
    action_type: 'impersonation.blocked_action',
    tenant_type: effective.tenantType,
    tenant_id: effective.tenantId,
    payload_json: {
      action_type: actionType,
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      impersonation_session_id: req.impersonationContext?.sessionId ?? null,
    },
  }).catch(() => {})

  res.status(403).json({
    ok: false,
    data: null,
    error: {
      name: 'IMPERSONATION_RESTRICTED',
      message:
        'This action is blocked while impersonating a tenant. Exit impersonation or use the admin dashboard.',
      actionType,
    },
    requestId: req.requestId,
  })
  return true
}

/**
 * Middleware: reject request when an admin is impersonating a tenant.
 * @param {string} actionType - key from IMPERSONATION_RESTRICTED_ACTIONS
 */
export function rejectImpersonationMutation(actionType) {
  return async (req, res, next) => {
    const blocked = await sendImpersonationRestricted(req, res, actionType)
    if (blocked) return
    return next()
  }
}

/**
 * After requireAuth has set req.userData: block POST/PUT/PATCH/DELETE while impersonating.
 * @returns {Promise<boolean>} true if response was already sent (caller must return)
 */
export async function assertImpersonationAllowsMutation(req, res) {
  if (SAFE_METHODS.has((req.method || '').toUpperCase())) return false
  const path = req.originalUrl?.split('?')[0] || req.path || ''
  if (isImpersonationWriteAllowlisted(path)) return false
  if (!getEffectiveTenant(req)) return false
  return sendImpersonationRestricted(req, res, IMPERSONATION_RESTRICTED_ACTIONS.MUTATION)
}
