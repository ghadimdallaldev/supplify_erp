-- Free tier is setup/testing only: quick lists require Bronze+ (automated weekly on Bronze).
UPDATE subscription_plan
SET
  features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{quick_lists}',
    'false'::jsonb
  ),
  updated_at = now()
WHERE code = 'free'
  AND tenant_type = 'RESTAURANT'
  AND features->>'quick_lists' = 'basic_manual_only';
