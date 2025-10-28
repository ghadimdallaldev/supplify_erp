-- Migration: 0022_subscription_system.sql
-- Description: Complete subscription system with plans, subscriptions, feature flags, usage tracking, and audit logs

-- ========================================
-- SUBSCRIPTION PLANS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS subscription_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Plan details
  name TEXT NOT NULL UNIQUE, -- Free, Bronze, Gold, Platinum
  code TEXT NOT NULL UNIQUE, -- free, bronze, gold, platinum (for programmatic access)
  description TEXT,
  
  -- Pricing
  price_per_month NUMERIC(14,2) NOT NULL DEFAULT 0,
  price_per_year NUMERIC(14,2),
  
  -- Plan type
  type TEXT NOT NULL DEFAULT 'restaurant_and_supplier' CHECK (type IN ('restaurant_only', 'supplier_only', 'restaurant_and_supplier')),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  
  -- Limits (JSONB for flexibility)
  limits JSONB NOT NULL DEFAULT '{}',
  -- Example: {"products": 50, "warehouses": 2, "chats_per_day": 100}
  
  -- Features (JSONB object of feature capabilities)
  features JSONB NOT NULL DEFAULT '{}',
  -- Example: {"chat": "enabled", "inventory": "real_time", "analytics": "basic"}
  
  -- Trial
  trial_days INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT positive_price CHECK (price_per_month >= 0 AND (price_per_year IS NULL OR price_per_year >= 0))
);

COMMENT ON TABLE subscription_plan IS 'Subscription plans with pricing, limits, and features';
COMMENT ON COLUMN subscription_plan.code IS 'Unique plan code (free, bronze, gold, platinum) for programmatic access';
COMMENT ON COLUMN subscription_plan.type IS 'Plan applies to: restaurant_only, supplier_only, or both';
COMMENT ON COLUMN subscription_plan.limits IS 'JSONB object with limit keys: products, warehouses, chats_per_day, etc. (-1 = unlimited)';
COMMENT ON COLUMN subscription_plan.features IS 'JSONB object with feature capabilities: {"chat": "enabled", "inventory": "real_time"}';

-- ========================================
-- SUBSCRIPTIONS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant (supplier or restaurant)
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  
  -- Plan
  plan_id UUID REFERENCES subscription_plan(id),
  plan_name TEXT NOT NULL, -- Denormalized for quick access
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('TRIALING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'PAST_DUE')),
  
  -- Dates
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  
  -- Billing
  billing_cycle TEXT CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
  next_billing_date TIMESTAMPTZ,
  
  -- Audit
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_dates CHECK (
    (status = 'TRIALING' AND trial_ends_at IS NOT NULL) OR
    (status != 'TRIALING')
  )
);

COMMENT ON TABLE subscription IS 'Active subscriptions linking tenants to plans';
COMMENT ON COLUMN subscription.status IS 'TRIALING, ACTIVE, SUSPENDED, CANCELLED, PAST_DUE';
COMMENT ON COLUMN subscription.tenant_id IS 'References supplier.id or restaurant.id';
COMMENT ON COLUMN subscription.tenant_type IS 'Type of tenant: SUPPLIER or RESTAURANT';

CREATE INDEX IF NOT EXISTS idx_subscription_tenant ON subscription(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_subscription_status ON subscription(status);
CREATE INDEX IF NOT EXISTS idx_subscription_plan ON subscription(plan_id);

-- ========================================
-- FEATURE FLAGS (Global & Tenant)
-- ========================================
CREATE TABLE IF NOT EXISTS feature_flag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Feature details
  feature_key TEXT NOT NULL UNIQUE, -- e.g., 'chat', 'inventory', 'analytics'
  feature_name TEXT NOT NULL, -- Display name
  description TEXT,
  
  -- Global default
  is_enabled_globally BOOLEAN DEFAULT false,
  
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE feature_flag IS 'Global feature flags (master list)';
COMMENT ON COLUMN feature_flag.feature_key IS 'Unique identifier: chat, inventory, analytics, quickLists, etc.';

-- Tenant-specific overrides
CREATE TABLE IF NOT EXISTS feature_flag_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  
  feature_flag_id UUID REFERENCES feature_flag(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL, -- Denormalized for quick access
  
  is_enabled BOOLEAN NOT NULL, -- Override value
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tenant_id, tenant_type, feature_key)
);

COMMENT ON TABLE feature_flag_override IS 'Per-tenant feature flag overrides';
CREATE INDEX IF NOT EXISTS idx_override_tenant ON feature_flag_override(tenant_id, tenant_type);

-- ========================================
-- USAGE TRACKING & QUOTAS
-- ========================================
CREATE TABLE IF NOT EXISTS usage_meter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  
  -- Meter details
  meter_type TEXT NOT NULL, -- products, warehouses, chatsPerDay, ordersPerDay, etc.
  current_value INTEGER DEFAULT 0,
  
  -- Period tracking
  period_type TEXT CHECK (period_type IN ('DAILY', 'MONTHLY', 'Billing Cycle')),
  period_start_date DATE,
  period_end_date DATE,
  
  -- Limit from plan
  limit_value INTEGER, -- NULL = unlimited
  
  -- Status
  is_over_limit BOOLEAN DEFAULT false,
  
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tenant_id, tenant_type, meter_type, period_start_date)
);

COMMENT ON TABLE usage_meter IS 'Tracks usage against plan limits per tenant';
COMMENT ON COLUMN usage_meter.limit_value IS 'NULL means unlimited for this tenant/plan';
CREATE INDEX IF NOT EXISTS idx_usage_tenant ON usage_meter(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_usage_overlimit ON usage_meter(is_over_limit) WHERE is_over_limit = true;

-- ========================================
-- AUDIT LOGS
-- ========================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Actor
  admin_user_id UUID NOT NULL, -- References app_user(id)
  admin_name TEXT, -- Denormalized for quick access
  
  -- Action
  action_type TEXT NOT NULL, -- subscription.suspended, feature_flag.changed, plan.updated, etc.
  action_description TEXT,
  
  -- Target
  target_tenant_id UUID,
  target_tenant_type TEXT,
  target_entity_type TEXT, -- subscription, plan, feature_flag, etc.
  target_entity_id UUID,
  
  -- Details
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  
  -- Context
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE admin_audit_log IS 'Audit trail for all admin actions';
COMMENT ON COLUMN admin_audit_log.action_type IS 'Examples: subscription.suspended, plan.updated, feature_flag.changed';
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON admin_audit_log(target_tenant_id, target_tenant_type);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON admin_audit_log(created_at DESC);

-- ========================================
-- BILLING & INVOICES (Already exists, but adding subscription link)
-- ========================================
-- Link existing invoice table to subscriptions
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscription(id);

COMMENT ON COLUMN invoice.subscription_id IS 'Links invoice to subscription for billing tracking';

-- ========================================
-- TRIGGERS
-- ========================================
CREATE OR REPLACE FUNCTION update_subscription_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_subscription_plan_updated_at_trigger ON subscription_plan;
CREATE TRIGGER update_subscription_plan_updated_at_trigger
BEFORE UPDATE ON subscription_plan
FOR EACH ROW
EXECUTE FUNCTION update_subscription_plan_updated_at();

CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_subscription_updated_at_trigger ON subscription;
CREATE TRIGGER update_subscription_updated_at_trigger
BEFORE UPDATE ON subscription
FOR EACH ROW
EXECUTE FUNCTION update_subscription_updated_at();

CREATE OR REPLACE FUNCTION update_feature_flag_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_feature_flag_updated_at_trigger ON feature_flag;
CREATE TRIGGER update_feature_flag_updated_at_trigger
BEFORE UPDATE ON feature_flag
FOR EACH ROW
EXECUTE FUNCTION update_feature_flag_updated_at();

-- ========================================
-- GRANT PERMISSIONS (Commented out - role will be created separately if needed)
-- ========================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON subscription_plan TO api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON subscription TO api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flag TO api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flag_override TO api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON usage_meter TO api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON admin_audit_log TO api_user;

-- ========================================
-- SEED DEFAULT PLANS (Comprehensive Supplify Plan Structure)
-- ========================================
INSERT INTO subscription_plan (id, code, name, description, price_per_month, price_per_year, type, limits, features, trial_days, is_active, display_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'free', 'Free', 'Basic plan for small businesses', 0, 0, 'restaurant_and_supplier',
   '{
     "restaurants": 1,
     "suppliers_per_restaurant": 2,
     "products": 50,
     "warehouses": 0,
     "branches": 0,
     "users": 1,
     "storage_mb": 100,
     "orders_per_day": 10,
     "chats_per_day": 10
   }',
   '{
     "quick_lists": "basic_manual_only",
     "smart_reorder": false,
     "inventory_management": "basic",
     "waste_tracking": false,
     "receiving_quality": "manual_only",
     "finance_invoices": "view_only",
     "chat": "1_supplier_only",
     "reports": false,
     "approvals_budgets": false,
     "multi_branch": false,
     "fulfillment_tools": "basic_orders",
     "feature_flags_access": false,
     "notifications": "in_app_only",
     "api_integrations": false,
     "support_sla": "community",
     "custom_branding": false
   }', 0, true, 1),
  
  ('00000000-0000-0000-0000-000000000002', 'bronze', 'Bronze', 'Growing businesses with more needs', 49, 490, 'restaurant_and_supplier',
   '{
     "restaurants": 3,
     "suppliers_per_restaurant": 10,
     "products": 1000,
     "warehouses": 1,
     "branches": 1,
     "users": 3,
     "storage_mb": 1000,
     "orders_per_day": 100,
     "chats_per_day": 50
   }',
   '{
     "quick_lists": "automated_weekly",
     "smart_reorder": "limited_7day_history",
     "inventory_management": "real_time",
     "waste_tracking": "manual_entry",
     "receiving_quality": "photos_enabled",
     "finance_invoices": "record_payments",
     "chat": "multi_supplier",
     "reports": "basic_kpis",
     "approvals_budgets": "single_level",
     "multi_branch": false,
     "fulfillment_tools": "manual_orders_invoices",
     "feature_flags_access": "default_plan_features",
     "notifications": "in_app_and_email",
     "api_integrations": "exports_only",
     "support_sla": "standard_72h",
     "custom_branding": false
   }', 14, true, 2),
  
  ('00000000-0000-0000-0000-000000000003', 'gold', 'Gold', 'Advanced features for established businesses', 149, 1490, 'restaurant_and_supplier',
   '{
     "restaurants": 10,
     "suppliers_per_restaurant": -1,
     "products": 10000,
     "warehouses": 3,
     "branches": 3,
     "users": 10,
     "storage_mb": 5000,
     "orders_per_day": 500,
     "chats_per_day": 200
   }',
   '{
     "quick_lists": "full_schedule",
     "smart_reorder": "full_90day_trends",
     "inventory_management": "multi_branch_tracking",
     "waste_tracking": "analytics_dashboard",
     "receiving_quality": "quality_scoring",
     "finance_invoices": "expense_analytics",
     "chat": "group_chat_files",
     "reports": "usage_cost_dashboards",
     "approvals_budgets": "approval_budget_caps",
     "multi_branch": true,
     "fulfillment_tools": "warehouse_pick_pack",
     "feature_flags_access": "addon_toggles",
     "notifications": "email_and_sms",
     "api_integrations": "api_key_access",
     "support_sla": "priority_24h",
     "custom_branding": "logo_colors"
   }', 14, true, 3),
  
  ('00000000-0000-0000-0000-000000000004', 'platinum', 'Platinum', 'Enterprise-grade solution with unlimited scale', 349, 3490, 'restaurant_and_supplier',
   '{
     "restaurants": -1,
     "suppliers_per_restaurant": -1,
     "products": -1,
     "warehouses": -1,
     "branches": -1,
     "users": -1,
     "storage_mb": 20000,
     "orders_per_day": -1,
     "chats_per_day": -1
   }',
   '{
     "quick_lists": "ai_smart_automation",
     "smart_reorder": "ai_forecast_seasonality",
     "inventory_management": "lot_expiry_tracking",
     "waste_tracking": "cost_percentage_vs_sales",
     "receiving_quality": "supplier_performance_reports",
     "finance_invoices": "advanced_finance_dashboard",
     "chat": "real_time_media_read_receipts",
     "reports": "advanced_forecasting_custom_reports",
     "approvals_budgets": "multi_level_approvals",
     "multi_branch": "central_purchasing",
     "fulfillment_tools": "routing_full_suite",
     "feature_flags_access": "all_experimental",
     "notifications": "email_sms_webhook",
     "api_integrations": "full_api_webhooks",
     "support_sla": "dedicated_same_day",
     "custom_branding": "white_label_domain"
   }', 30, true, 4)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_per_month = EXCLUDED.price_per_month,
  price_per_year = EXCLUDED.price_per_year,
  type = EXCLUDED.type,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  trial_days = EXCLUDED.trial_days,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

-- Seed feature flags
INSERT INTO feature_flag (feature_key, feature_name, description, is_enabled_globally) VALUES
  ('chat', 'Chat System', 'Real-time messaging with suppliers/restaurants', true),
  ('inventory', 'Inventory Management', 'Track and manage inventory', true),
  ('analytics', 'Analytics & Reports', 'Detailed analytics and reporting', true),
  ('quickLists', 'Quick Lists', 'Create and manage quick lists', true),
  ('api', 'API Access', 'Programmatic API access', false),
  ('webhooks', 'Webhooks', 'Receive webhook notifications', false),
  ('support', 'Priority Support', 'Priority customer support', false)
ON CONFLICT (feature_key) DO NOTHING;

