-- Free tier: allow scheduling one quick list (sandbox evaluation).

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"scheduled_quick_lists": 1}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"quick_lists": "basic_single_schedule"}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"scheduled_quick_lists": -1}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'RESTAURANT'
  AND (limits->>'scheduled_quick_lists') IS NULL;
