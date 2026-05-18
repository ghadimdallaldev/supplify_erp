-- Rebalance restaurant plan limits (Free/Bronze/Gold).
-- branches = total location accounts (primary + linked branch accounts).

-- Free: primary location counts as the one branch slot
UPDATE subscription_plan
SET
  limits = limits || '{"branches": 1}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

-- Bronze: 2 locations (primary + 1 linked), 20 orders/day
UPDATE subscription_plan
SET
  limits = limits || '{"branches": 2, "orders_per_day": 20}'::jsonb,
  updated_at = now()
WHERE code = 'bronze' AND tenant_type = 'RESTAURANT';

-- Gold: 50 orders/day (branches remain 3 from 0062)
UPDATE subscription_plan
SET
  limits = limits || '{"orders_per_day": 50}'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'RESTAURANT';

COMMENT ON COLUMN subscription_plan.limits IS 'JSONB limits; branches = total accounts (primary + linked). chats_per_day = chat messages sent per day.';
