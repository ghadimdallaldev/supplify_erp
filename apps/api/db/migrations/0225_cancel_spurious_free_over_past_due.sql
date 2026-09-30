-- Cancel Free pending-activation ACTIVE rows that were minted on top of an
-- existing commercial subscription (PAST_DUE / SUSPENDED / paid ACTIVE / TRIALING).
-- Keeps the commercially relevant row as the billing/feature source of truth.

UPDATE subscription AS bogus
SET
  status = 'CANCELLED',
  cancelled_at = COALESCE(bogus.cancelled_at, now()),
  updated_at = now()
FROM subscription AS commercial
WHERE bogus.tenant_id = commercial.tenant_id
  AND bogus.tenant_type = commercial.tenant_type
  AND bogus.id <> commercial.id
  AND bogus.status = 'ACTIVE'
  AND COALESCE(bogus.lock_reason, '') = 'pending_activation'
  AND EXISTS (
    SELECT 1
    FROM subscription_plan sp
    WHERE sp.id = bogus.plan_id
      AND LOWER(COALESCE(sp.code, '')) = 'free'
  )
  AND commercial.status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')
  AND (
    commercial.status IN ('PAST_DUE', 'SUSPENDED', 'TRIALING')
    OR COALESCE(commercial.lock_reason, '') <> 'pending_activation'
  );
