-- Migration: 0175_free_trial_supplier_growth_parity.sql
-- Free Trial (plan code `free`) must keep Gold feature parity (0112/0145).
-- 0172 added supplier_growth only on silver+; restore on gold and re-sync free.

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"supplier_growth": true}'::jsonb,
  updated_at = now()
WHERE tenant_type = 'SUPPLIER'
  AND code IN ('gold', 'platinum', 'enterprise')
  AND is_active = true
  AND COALESCE((features->>'supplier_growth')::boolean, false) = false;

UPDATE subscription_plan sp_free
SET
  features = sp_gold.features,
  updated_at = now()
FROM subscription_plan sp_gold
WHERE sp_free.code = 'free'
  AND sp_free.tenant_type = 'RESTAURANT'
  AND sp_gold.code = 'gold'
  AND sp_gold.tenant_type = 'RESTAURANT';

UPDATE subscription_plan sp_free
SET
  features = sp_gold.features,
  updated_at = now()
FROM subscription_plan sp_gold
WHERE sp_free.code = 'free'
  AND sp_free.tenant_type = 'SUPPLIER'
  AND sp_gold.code = 'gold'
  AND sp_gold.tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"approvals_budgets": false}'::jsonb,
  updated_at = now()
WHERE tenant_type IN ('RESTAURANT', 'SUPPLIER');
