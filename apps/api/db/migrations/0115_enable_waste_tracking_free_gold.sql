-- Enable waste tracking for all restaurant subscription tiers (0094 had disabled it on Free).

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"waste_tracking": "analytics_dashboard"}'::jsonb,
  updated_at = now()
WHERE tenant_type = 'RESTAURANT'
  AND code IN ('free', 'bronze', 'gold', 'platinum');
