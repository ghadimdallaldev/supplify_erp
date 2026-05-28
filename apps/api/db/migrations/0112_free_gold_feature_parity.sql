-- Free and Gold share the same feature gates; only limits differ (Free keeps sandbox caps from 0094).
-- Approvals product surface removed: keep approvals_budgets disabled on all plans.

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
