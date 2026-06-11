-- Migration: 0156_supplier_smart_reorder_plan_features.sql
-- Supplier Gold/Platinum were missing smart_reorder while restaurant tiers include it.
-- Supplier reorder follow-up and at-risk cadence APIs gate on this feature key.

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"smart_reorder": "full_90day_trends"}'::jsonb,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'smart_reorder');

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"smart_reorder": "ai_forecast_seasonality"}'::jsonb,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'smart_reorder');
