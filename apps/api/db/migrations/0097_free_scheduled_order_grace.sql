-- Free tier: one scheduled order per day may exceed the daily order cap (sandbox testing).

ALTER TABLE customer_order
  ADD COLUMN IF NOT EXISTS placement_source TEXT;

COMMENT ON COLUMN customer_order.placement_source IS
  'How the order was placed, e.g. scheduled_quick_list for automated quick-list runs';

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"scheduled_order_grace_per_day": 1}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"scheduled_order_grace_per_day": 0}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'RESTAURANT'
  AND (limits->>'scheduled_order_grace_per_day') IS NULL;
