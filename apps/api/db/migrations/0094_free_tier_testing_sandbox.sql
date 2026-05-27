-- Free tier = single-supplier sandbox for evaluation (access core flows, minimal counts).

-- RESTAURANT Free
UPDATE subscription_plan
SET
  limits = '{
    "branches": 1,
    "users": 1,
    "orders_per_day": 3,
    "suppliers_per_restaurant": 1,
    "restaurant_inventory_skus": 10,
    "chats_per_day": 10,
    "storage_mb": 50,
    "quick_lists": 1,
    "quick_list_items": 1
  }'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{
    "chat": true,
    "quick_lists": "basic_manual_only",
    "disputes_returns": true,
    "supplier_deals": false,
    "smart_reorder": false,
    "reports": false,
    "multi_branch": false,
    "inventory_management": "basic",
    "waste_tracking": false,
    "receiving_quality": "manual_only",
    "finance_invoices": "view_only",
    "notifications": "in_app_only",
    "api_integrations": false,
    "support_sla": "community",
    "custom_branding": false,
    "approvals_budgets": false,
    "order_calendar": false,
    "supplier_reviews": false,
    "order_amendments": false,
    "waitlist_auto_promo": false
  }'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

-- SUPPLIER Free (minimal catalog + chat for paired testing)
UPDATE subscription_plan
SET
  limits = '{
    "warehouses": 0,
    "users": 1,
    "supplier_products_skus": 10,
    "chats_per_day": 10,
    "storage_mb": 50,
    "branches": 1
  }'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{
    "chat": true,
    "promotions": false,
    "reports": false,
    "fulfillment_tools": "basic_orders",
    "disputes_returns": true,
    "notifications": "in_app_only",
    "api_integrations": false,
    "support_sla": "community",
    "custom_branding": false,
    "order_calendar": false,
    "order_amendments": false
  }'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';

-- Paid restaurant tiers: supplier deals / full quick-list automation
UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"supplier_deals": true}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"quick_lists": 50, "quick_list_items": 500}'::jsonb,
  updated_at = now()
WHERE code = 'bronze' AND tenant_type = 'RESTAURANT'
  AND (limits->>'quick_lists') IS NULL;

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"quick_lists": -1, "quick_list_items": -1}'::jsonb,
  updated_at = now()
WHERE code IN ('gold', 'platinum') AND tenant_type = 'RESTAURANT'
  AND (limits->>'quick_lists') IS NULL;

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"promotions": true}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'SUPPLIER'
  AND (features->>'promotions') IS NULL;

INSERT INTO feature_flag (feature_key, feature_name, description, global_override, updated_at)
VALUES (
  'supplier_deals',
  'Supplier deals',
  'View supplier promotions and apply deals at checkout',
  NULL,
  now()
)
ON CONFLICT (feature_key) DO NOTHING;
