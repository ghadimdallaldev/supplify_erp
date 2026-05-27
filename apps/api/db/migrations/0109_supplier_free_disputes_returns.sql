-- Supplier Free: enable disputes & returns (respond to restaurant disputes in sandbox).
-- Restaurants on Free already have disputes_returns from 0094_free_tier_testing_sandbox.sql.
-- Paid tiers unchanged. Volume caps remain on orders, products, chat, etc.

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"disputes_returns": true}'::jsonb,
  updated_at = now()
WHERE code = 'free'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;
