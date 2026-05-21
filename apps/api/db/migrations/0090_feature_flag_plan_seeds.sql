-- Migration: 0090_feature_flag_plan_seeds.sql
-- Register feature flags and plan defaults for previously ungated capabilities.

INSERT INTO feature_flag (feature_key, feature_name, description, global_override) VALUES
  ('supplier_reviews', 'Supplier Reviews', 'Star ratings and reviews for suppliers', NULL),
  ('promotions', 'Promotions & Deals', 'Supplier promotional discounts and featured listings', NULL),
  ('push_notifications', 'Push Notifications', 'Browser push notifications for real-time alerts', NULL),
  ('order_amendments', 'Order Amendments', 'Change requests on placed orders', NULL),
  ('tenant_audit_log', 'Activity Log', 'Team activity audit log for tenant owners', NULL),
  ('waitlist_auto_promo', 'Waitlist Auto-Promotion', 'Automatic waitlist promotion on reservation cancellation', NULL)
ON CONFLICT (feature_key) DO NOTHING;

-- supplier_reviews (RESTAURANT): Bronze+
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"supplier_reviews": true}'::jsonb,
    updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum')
  AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{supplier_reviews}', 'false'::jsonb, true),
    updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

-- promotions (SUPPLIER): Bronze+
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"promotions": true}'::jsonb,
    updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum')
  AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{promotions}', 'false'::jsonb, true),
    updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';

-- push_notifications (RESTAURANT + SUPPLIER): all plans
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"push_notifications": true}'::jsonb,
    updated_at = now()
WHERE code IN ('free', 'bronze', 'gold', 'platinum')
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER');

-- order_amendments (RESTAURANT + SUPPLIER): all plans
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"order_amendments": true}'::jsonb,
    updated_at = now()
WHERE code IN ('free', 'bronze', 'gold', 'platinum')
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER');

-- tenant_audit_log (RESTAURANT + SUPPLIER): Gold+
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"tenant_audit_log": true}'::jsonb,
    updated_at = now()
WHERE code IN ('gold', 'platinum')
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER');

UPDATE subscription_plan
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{tenant_audit_log}', 'false'::jsonb, true),
    updated_at = now()
WHERE code IN ('free', 'bronze')
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER');

-- waitlist_auto_promo (RESTAURANT): Bronze+
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"waitlist_auto_promo": true}'::jsonb,
    updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum')
  AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{waitlist_auto_promo}', 'false'::jsonb, true),
    updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';
