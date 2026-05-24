-- Free suppliers: allow limited deals for sandbox/testing (Bronze+ for more).

UPDATE subscription_plan
SET
  features = jsonb_set(COALESCE(features, '{}'::jsonb), '{promotions}', 'true'::jsonb, true),
  limits = COALESCE(limits, '{}'::jsonb) || '{"promotions": 1}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';
