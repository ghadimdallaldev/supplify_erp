-- Ensure Free restaurant plan allows single scheduled quick list (idempotent).

UPDATE subscription_plan
SET
  features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{quick_lists}',
    '"basic_single_schedule"'::jsonb
  ),
  updated_at = now()
WHERE code = 'free'
  AND tenant_type = 'RESTAURANT'
  AND (
    features->>'quick_lists' IS NULL
    OR features->>'quick_lists' IN ('false', 'basic_manual_only')
  );
