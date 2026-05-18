import { query } from '../db.js'
import { LOCK_REASON_PENDING_ACTIVATION } from './constants.js'

/**
 * New tenants start locked until first successful paid checkout or admin activation.
 */
export async function createPendingActivationSubscription(
  executor,
  tenantId,
  tenantType,
  planCode = 'free'
) {
  const run = executor.query ? executor.query.bind(executor) : query
  await run(
    `
    INSERT INTO subscription (
      tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle,
      current_period_start, current_period_end,
      account_locked_at, lock_reason
    )
    SELECT $1, $2, sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + INTERVAL '1 month',
      now(), $3
    FROM subscription_plan sp
    WHERE sp.code = $4 AND sp.tenant_type = $2 AND sp.is_active = true
    LIMIT 1
    `,
    [tenantId, tenantType, LOCK_REASON_PENDING_ACTIVATION, planCode]
  )
}
