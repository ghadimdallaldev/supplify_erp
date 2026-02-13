-- Migration: 0049_reduce_free_plan_revenue_focus.sql
-- Reduces Free plan limits and features so Free is setup/testing only;
-- Gold feels like the default serious plan, Platinum like "never think about limits".

-- ========================================
-- 1) Free plan RESTAURANT: strict limits, no reports/smart_reorder
-- ========================================
UPDATE subscription_plan
SET
  limits = '{
    "branches": 0,
    "users": 1,
    "orders_per_day": 3,
    "suppliers_per_restaurant": 1,
    "restaurant_inventory_skus": 15,
    "chats_per_day": 3,
    "storage_mb": 50
  }'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{
    "chat": true,
    "smart_reorder": false,
    "reports": false,
    "multi_branch": false,
    "quick_lists": "basic_manual_only",
    "inventory_management": "basic",
    "waste_tracking": false,
    "receiving_quality": "manual_only",
    "finance_invoices": "view_only",
    "notifications": "in_app_only",
    "api_integrations": false,
    "support_sla": "community",
    "custom_branding": false
  }'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

-- ========================================
-- 2) Free plan SUPPLIER: strict limits, no reports/smart_reorder
-- ========================================
UPDATE subscription_plan
SET
  limits = '{
    "warehouses": 0,
    "users": 1,
    "supplier_products_skus": 15,
    "chats_per_day": 3,
    "storage_mb": 50
  }'::jsonb,
  features = COALESCE(features, '{}'::jsonb) || '{
    "chat": true,
    "smart_reorder": false,
    "reports": false,
    "fulfillment_tools": "basic_orders",
    "notifications": "in_app_only",
    "api_integrations": false,
    "support_sla": "community",
    "custom_branding": false
  }'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';

COMMENT ON COLUMN subscription_plan.limits IS 'JSONB limits; Free plan is setup/testing only to encourage upgrade to Gold/Platinum';
