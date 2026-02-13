-- Migration: 0051_enterprise_plan.sql
-- Enterprise plan: not publicly selectable, unlimited/very high limits, assignable by admin only.

ALTER TABLE subscription_plan
  ADD COLUMN IF NOT EXISTS requires_admin_assignment BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN subscription_plan.requires_admin_assignment IS 'If true, plan is only assignable by admin (no self-serve); e.g. ENTERPRISE';

-- ENTERPRISE RESTAURANT
INSERT INTO subscription_plan (code, name, description, price_per_month, price_per_year, type, tenant_type, limits, features, trial_days, is_active, display_order, requires_admin_assignment)
SELECT 'enterprise', 'Enterprise', 'Custom terms, SLA, and scale', 0, 0, 'restaurant_and_supplier', 'RESTAURANT',
  '{"branches": -1, "users": -1, "orders_per_day": -1, "suppliers_per_restaurant": -1, "restaurant_inventory_skus": -1, "chats_per_day": -1, "storage_mb": 100000}'::jsonb,
  '{"chat": true, "smart_reorder": true, "reports": true, "multi_branch": true, "quick_lists": "ai_smart_automation", "inventory_management": "lot_expiry_tracking", "waste_tracking": "cost_percentage_vs_sales", "receiving_quality": "supplier_performance_reports", "finance_invoices": "advanced_finance_dashboard", "notifications": "email_sms_webhook", "api_integrations": true, "support_sla": "dedicated_same_day", "custom_branding": true}'::jsonb,
  0, true, 50, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plan WHERE code = 'enterprise' AND tenant_type = 'RESTAURANT');

-- ENTERPRISE SUPPLIER
INSERT INTO subscription_plan (code, name, description, price_per_month, price_per_year, type, tenant_type, limits, features, trial_days, is_active, display_order, requires_admin_assignment)
SELECT 'enterprise', 'Enterprise', 'Custom terms, SLA, and scale', 0, 0, 'restaurant_and_supplier', 'SUPPLIER',
  '{"warehouses": -1, "users": -1, "supplier_products_skus": -1, "chats_per_day": -1, "storage_mb": 100000}'::jsonb,
  '{"chat": true, "smart_reorder": true, "reports": true, "fulfillment_tools": "routing_full_suite", "notifications": "email_sms_webhook", "api_integrations": true, "support_sla": "dedicated_same_day", "custom_branding": true}'::jsonb,
  0, true, 150, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plan WHERE code = 'enterprise' AND tenant_type = 'SUPPLIER');
