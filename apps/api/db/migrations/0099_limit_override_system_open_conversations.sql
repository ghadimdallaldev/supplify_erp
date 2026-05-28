-- Admin limit overrides (tier + tenant), open conversation caps on Free tier.

-- Tenant overrides: active flag + disable instead of hard delete
ALTER TABLE tenant_limit_override
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_override_active
  ON tenant_limit_override(tenant_id, tenant_type, limit_type)
  WHERE is_active = TRUE;

-- Tier/plan-level overrides
CREATE TABLE IF NOT EXISTS plan_limit_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES subscription_plan(id) ON DELETE CASCADE,
  limit_type TEXT NOT NULL,
  override_value INTEGER NOT NULL,
  expiration_date TIMESTAMPTZ,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, limit_type)
);

CREATE INDEX IF NOT EXISTS idx_plan_override_plan ON plan_limit_override(plan_id, limit_type);
CREATE INDEX IF NOT EXISTS idx_plan_override_expiration
  ON plan_limit_override(expiration_date)
  WHERE expiration_date IS NOT NULL;

DROP TRIGGER IF EXISTS update_plan_override_updated_at_trigger ON plan_limit_override;
CREATE TRIGGER update_plan_override_updated_at_trigger
  BEFORE UPDATE ON plan_limit_override
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE plan_limit_override IS 'Admin-granted limit increases at subscription plan/tier level';

-- Free tier: one non-archived conversation per tenant
UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"open_conversations": 1}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type IN ('RESTAURANT', 'SUPPLIER');

-- Supplier deal counts toward plan cap (non-expired deals)
UPDATE subscription_plan
SET limits = COALESCE(limits, '{}'::jsonb) || '{"promotions": 0}'::jsonb, updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET limits = COALESCE(limits, '{}'::jsonb) || '{"promotions": 10}'::jsonb, updated_at = now()
WHERE code = 'bronze' AND tenant_type = 'SUPPLIER'
  AND (limits->>'promotions') IS NULL;

UPDATE subscription_plan
SET limits = COALESCE(limits, '{}'::jsonb) || '{"promotions": -1}'::jsonb, updated_at = now()
WHERE code IN ('gold', 'platinum') AND tenant_type = 'SUPPLIER'
  AND (limits->>'promotions') IS NULL;

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"open_conversations": -1}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum')
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER')
  AND (limits->>'open_conversations') IS NULL;
