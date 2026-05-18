-- Order Calendar: included on paid tiers, not on Free (setup/testing plan)

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"order_calendar": false}'::jsonb,
  updated_at = now()
WHERE code = 'free';

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"order_calendar": true}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum');
