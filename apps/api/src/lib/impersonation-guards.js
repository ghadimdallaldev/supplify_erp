/**
 * Guards for admin impersonation: block high-risk mutations while allowing support/debug flows.
 */
import { getEffectiveTenant } from './impersonation.js'
import { writeAuditLog } from './audit.js'

export const IMPERSONATION_RESTRICTED_ACTIONS = {
  BILLING_MUTATION: 'billing_mutation',
  TENANT_DELETE: 'tenant_delete',
  SUBSCRIPTION_CHANGE: 'subscription_change',
  BULK_DELETE: 'bulk_delete',
  NOTIFICATION_SEND: 'notification_send',
}

/**
 * Middleware: reject request when an admin is impersonating a tenant (read-only for dangerous domains).
 * @param {string} actionType - key from IMPERSONATION_RESTRICTED_ACTIONS
 */
export function rejectImpersonationMutation(actionType) {
  return async (req, res, next) => {
    const effective = getEffectiveTenant(req)
    if (!effective) return next()

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

    return res.status(403).json({
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
  }
}
