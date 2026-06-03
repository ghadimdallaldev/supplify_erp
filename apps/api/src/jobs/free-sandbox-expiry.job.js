import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { LOCK_REASON_FREE_SANDBOX_EXPIRED } from '../lib/billing/constants.js'
import { invalidateTenantSubscriptionCache } from '../lib/subscription.js'
import { notifyBillingAccountLocked } from '../services/notification.service.js'

/**
 * Lock free-plan workspaces whose sandbox period has ended.
 */
export async function runFreeSandboxExpiryJob() {
  const { rows } = await query(
    `
    UPDATE subscription s
    SET
      account_locked_at = COALESCE(s.account_locked_at, now()),
      lock_reason = $1,
      updated_at = now()
    FROM subscription_plan sp
    WHERE s.plan_id = sp.id
      AND sp.code = 'free'
      AND s.status IN ('TRIALING', 'ACTIVE')
      AND s.free_sandbox_expires_at IS NOT NULL
      AND s.free_sandbox_expires_at < now()
      AND (s.lock_reason IS DISTINCT FROM $1 OR s.account_locked_at IS NULL)
    RETURNING s.tenant_id, s.tenant_type
    `,
    [LOCK_REASON_FREE_SANDBOX_EXPIRED]
  )

  for (const row of rows) {
    await invalidateTenantSubscriptionCache(row.tenant_id, row.tenant_type).catch(() => {})
    notifyBillingAccountLocked({
      tenantId: row.tenant_id,
      tenantType: row.tenant_type,
      reason: 'free sandbox trial expired',
    }).catch(() => {})
  }

  if (rows.length > 0) {
    logger.info('Free sandbox expiry job locked workspaces', { count: rows.length })
  }

  return { locked: rows.length }
}
