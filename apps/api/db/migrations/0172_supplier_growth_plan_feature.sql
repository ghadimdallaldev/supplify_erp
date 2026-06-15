-- Migration: 0172_supplier_growth_plan_feature.sql
-- Gate supplier customer growth tools behind paid supplier tiers (silver+).

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"supplier_growth": true}'::jsonb,
  updated_at = now()
WHERE tenant_type = 'SUPPLIER'
  AND code IN ('silver', 'gold', 'platinum', 'enterprise')
  AND is_active = true
  AND COALESCE((features->>'supplier_growth')::boolean, false) = false;
