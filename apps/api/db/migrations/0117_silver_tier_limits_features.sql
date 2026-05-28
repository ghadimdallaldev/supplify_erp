-- Migration: 0117_silver_tier_limits_features.sql
-- Tighten Silver (first paid tier) limits and features for RESTAURANT and SUPPLIER.
-- Pricing unchanged ($49/mo, $490/yr). Idempotent: full replace of limits/features JSON.

-- RESTAURANT Silver
UPDATE subscription_plan
SET
  limits = '{
    "branches": 1,
    "users": 3,
    "orders_per_day": 20,
    "suppliers_per_restaurant": 5,
    "restaurant_inventory_skus": 250,
    "chats_per_day": 30,
    "open_conversations": 5,
    "storage_mb": 500,
    "quick_lists": 10,
    "quick_list_items": 100,
    "scheduled_quick_lists": 3,
    "deal_redemptions_per_day": 10,
    "scheduled_order_grace_per_day": 0
  }'::jsonb,
  features = '{
    "chat": "multi_supplier",
    "order_calendar": true,
    "quick_lists": "automated_weekly",
    "receiving_quality": "photos_enabled",
    "disputes_returns": true,
    "finance_invoices": "record_payments",
    "inventory_management": "real_time",
    "supplier_deals": true,
    "supplier_deals_redeem": true,
    "supplier_reviews": true,
    "order_amendments": true,
    "notifications": "in_app_and_email",
    "push_notifications": true,
    "reports": "basic_kpis",
    "multi_branch": false,
    "custom_branding": false,
    "tenant_audit_log": false,
    "smart_reorder": false,
    "waste_tracking": "manual_entry",
    "waitlist_auto_promo": false,
    "advanced_roles": false,
    "api_integrations": false,
    "feature_flags_access": false,
    "fulfillment_tools": false,
    "support_sla": "standard_72h"
  }'::jsonb,
  price_per_month = 49.00,
  price_per_year = 490.00,
  updated_at = now()
WHERE code = 'silver'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;

-- SUPPLIER Silver
UPDATE subscription_plan
SET
  limits = '{
    "branches": 1,
    "users": 3,
    "supplier_products_skus": 250,
    "warehouses": 1,
    "chats_per_day": 30,
    "open_conversations": 5,
    "storage_mb": 500,
    "promotions": 3
  }'::jsonb,
  features = '{
    "chat": "multi_supplier",
    "order_calendar": true,
    "fulfillment": true,
    "fulfillment_tools": "manual_orders_invoices",
    "warehouses": true,
    "promotions": true,
    "disputes_returns": true,
    "inventory_management": "real_time",
    "order_amendments": true,
    "notifications": "in_app_and_email",
    "push_notifications": true,
    "reports": "basic_kpis",
    "multi_branch": false,
    "multi_warehouse": false,
    "custom_branding": false,
    "tenant_audit_log": false,
    "driver_management": false,
    "advanced_roles": false,
    "api_integrations": false,
    "feature_flags_access": false,
    "support_sla": "standard_72h"
  }'::jsonb,
  price_per_month = 49.00,
  price_per_year = 490.00,
  updated_at = now()
WHERE code = 'silver'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;
