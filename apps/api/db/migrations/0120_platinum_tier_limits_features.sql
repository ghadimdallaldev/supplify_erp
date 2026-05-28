-- Migration: 0120_platinum_tier_limits_features.sql
-- Normalize Platinum (RESTAURANT + SUPPLIER) limits and features after Gold 0119.
-- Pricing unchanged ($349/mo, $3490/yr). Storage 30 GB (30720 MB).
-- Idempotent: full replace of limits/features JSON.
-- Does not modify free, silver, gold, or enterprise rows.

-- RESTAURANT Platinum
UPDATE subscription_plan
SET
  limits = '{
    "branches": -1,
    "users": -1,
    "orders_per_day": -1,
    "suppliers_per_restaurant": -1,
    "restaurant_inventory_skus": -1,
    "chats_per_day": -1,
    "open_conversations": -1,
    "storage_mb": 30720,
    "quick_lists": -1,
    "quick_list_items": -1,
    "scheduled_quick_lists": -1,
    "deal_redemptions_per_day": -1,
    "scheduled_order_grace_per_day": 0
  }'::jsonb,
  features = '{
    "chat": "real_time_media_read_receipts",
    "order_calendar": true,
    "quick_lists": "ai_smart_automation",
    "receiving_quality": "supplier_performance_reports",
    "disputes_returns": true,
    "finance_invoices": "advanced_finance_dashboard",
    "inventory_management": "lot_expiry_tracking",
    "supplier_deals": true,
    "supplier_deals_redeem": true,
    "supplier_reviews": true,
    "order_amendments": true,
    "notifications": "email_whatsapp_webhook",
    "push_notifications": true,
    "reports": "advanced_forecasting_custom_reports",
    "multi_branch": "central_purchasing",
    "custom_branding": "white_label_domain",
    "tenant_audit_log": true,
    "smart_reorder": "ai_forecast_seasonality",
    "waste_tracking": "cost_percentage_vs_sales",
    "waitlist_auto_promo": true,
    "advanced_roles": true,
    "api_integrations": "full_api_webhooks",
    "feature_flags_access": "all_experimental",
    "fulfillment_tools": false,
    "support_sla": "dedicated_same_day"
  }'::jsonb,
  price_per_month = 349.00,
  price_per_year = 3490.00,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;

-- SUPPLIER Platinum
UPDATE subscription_plan
SET
  limits = '{
    "branches": -1,
    "warehouses": -1,
    "users": -1,
    "supplier_products_skus": -1,
    "chats_per_day": -1,
    "open_conversations": -1,
    "storage_mb": 30720,
    "promotions": -1
  }'::jsonb,
  features = '{
    "chat": "real_time_media_read_receipts",
    "order_calendar": true,
    "fulfillment": true,
    "fulfillment_tools": "routing_full_suite",
    "warehouses": true,
    "promotions": true,
    "disputes_returns": true,
    "inventory_management": "lot_expiry_tracking",
    "order_amendments": true,
    "notifications": "email_whatsapp_webhook",
    "push_notifications": true,
    "reports": "advanced_forecasting_custom_reports",
    "multi_branch": true,
    "multi_warehouse": true,
    "custom_branding": "white_label_domain",
    "tenant_audit_log": true,
    "driver_management": true,
    "advanced_roles": true,
    "api_integrations": "full_api_webhooks",
    "feature_flags_access": "all_experimental",
    "support_sla": "dedicated_same_day"
  }'::jsonb,
  price_per_month = 349.00,
  price_per_year = 3490.00,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;

-- Strip legacy approvals_budgets if present (product removed in 0114)
UPDATE subscription_plan
SET
  features = features - 'approvals_budgets',
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER')
  AND features ? 'approvals_budgets';
