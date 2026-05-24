-- Free sandbox: restaurants redeem 1 deal/day; suppliers create 1 promotion/deal.

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"deal_redemptions_per_day": 1}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{
    "supplier_deals": true,
    "supplier_deals_redeem": true
  }'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"deal_redemptions_per_day": -1}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'RESTAURANT'
  AND (limits->>'deal_redemptions_per_day') IS NULL;

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"promotions": 1}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"promotions": true}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"promotions": -1}'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{"promotions": true}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'SUPPLIER'
  AND (limits->>'promotions') IS NULL;
