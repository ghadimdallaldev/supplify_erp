-- Supplier plans: branch account limits (linked locations), aligned with restaurant tiers.

UPDATE subscription_plan
SET
  limits = limits || '{"branches": 1}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"multi_branch": false}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET
  limits = limits || '{"branches": 2}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"multi_branch": false}'::jsonb,
  updated_at = now()
WHERE code = 'bronze' AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET
  limits = limits || '{"branches": 3}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"multi_branch": true}'::jsonb,
  updated_at = now()
WHERE code = 'silver' AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET
  limits = limits || '{"branches": 3}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"multi_branch": true}'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET
  limits = limits || '{"branches": -1}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"multi_branch": true}'::jsonb,
  updated_at = now()
WHERE code = 'platinum' AND tenant_type = 'SUPPLIER';

COMMENT ON COLUMN subscription_plan.limits IS 'JSONB limits; branches = total location accounts (primary + linked) for restaurants and suppliers.';
