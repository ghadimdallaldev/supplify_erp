-- Migration: 0119_gold_tier_limits_features.sql
-- Rebalance Gold (RESTAURANT + SUPPLIER) limits and features after Silver 0117.
-- Pricing unchanged ($149/mo, $1490/yr). Idempotent: full replace of limits/features JSON.
-- Does not modify free, silver, platinum, or enterprise rows.

-- RESTAURANT Gold
UPDATE subscription_plan
SET
  limits = '{
    "branches": 3,
    "users": 15,
    "orders_per_day": 100,
    "suppliers_per_restaurant": 30,
    "restaurant_inventory_skus": 3000,
    "chats_per_day": 500,
    "open_conversations": 30,
    "storage_mb": 10240,
    "quick_lists": 50,
    "quick_list_items": 500,
    "scheduled_quick_lists": 15,
    "deal_redemptions_per_day": 50,
    "scheduled_order_grace_per_day": 0
  }'::jsonb,
  features = '{
    "chat": "group_chat_files",
    "order_calendar": true,
    "quick_lists": "full_schedule",
    "receiving_quality": "quality_scoring",
    "disputes_returns": true,
    "finance_invoices": "expense_analytics",
    "inventory_management": "multi_branch_tracking",
    "supplier_deals": true,
    "supplier_deals_redeem": true,
    "supplier_reviews": true,
    "order_amendments": true,
    "notifications": "email_and_whatsapp",
    "push_notifications": true,
    "reports": "usage_cost_dashboards",
    "multi_branch": true,
    "custom_branding": "logo_colors",
    "tenant_audit_log": true,
    "smart_reorder": "full_90day_trends",
    "waste_tracking": "analytics_dashboard",
    "waitlist_auto_promo": true,
    "advanced_roles": true,
    "api_integrations": "api_key_access",
    "feature_flags_access": "addon_toggles",
    "fulfillment_tools": false,
    "support_sla": "priority_24h"
  }'::jsonb,
  price_per_month = 149.00,
  price_per_year = 1490.00,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;

-- SUPPLIER Gold
UPDATE subscription_plan
SET
  limits = '{
    "branches": 3,
    "warehouses": 3,
    "users": 15,
    "supplier_products_skus": 3000,
    "chats_per_day": 500,
    "open_conversations": 30,
    "storage_mb": 10240,
    "promotions": 25
  }'::jsonb,
  features = '{
    "chat": "group_chat_files",
    "order_calendar": true,
    "fulfillment": true,
    "fulfillment_tools": "warehouse_pick_pack",
    "warehouses": true,
    "promotions": true,
    "disputes_returns": true,
    "inventory_management": "multi_branch_tracking",
    "order_amendments": true,
    "notifications": "email_and_whatsapp",
    "push_notifications": true,
    "reports": "usage_cost_dashboards",
    "multi_branch": true,
    "multi_warehouse": true,
    "custom_branding": "logo_colors",
    "tenant_audit_log": true,
    "driver_management": true,
    "advanced_roles": true,
    "api_integrations": "api_key_access",
    "feature_flags_access": "addon_toggles",
    "support_sla": "priority_24h"
  }'::jsonb,
  price_per_month = 149.00,
  price_per_year = 1490.00,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;

-- Strip legacy approvals_budgets if present (product removed in 0114)
UPDATE subscription_plan
SET
  features = features - 'approvals_budgets',
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER')
  AND features ? 'approvals_budgets';
