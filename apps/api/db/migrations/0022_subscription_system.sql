-- Migration: 0022_subscription_system.sql
-- Description: Complete subscription system with plans, subscriptions, feature flags, usage tracking, and audit logs

-- ========================================
-- SUBSCRIPTION PLANS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS subscription_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Plan details
  name TEXT NOT NULL UNIQUE, -- Free, Bronze, Gold, Platinum
  description TEXT,
  
  -- Pricing
  price_per_month NUMERIC(14,2) NOT NULL DEFAULT 0,
  price_per_year NUMERIC(14,2),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  
  -- Limits (JSONB for flexibility)
  limits JSONB NOT NULL DEFAULT '{}',
  -- Example: {"maxProducts": 50, "maxWarehouses": 2, "maxChatsPerDay": 100}
  
  -- Features (JSONB array of feature names)
  features JSONB NOT NULL DEFAULT '[]',
  -- Example: ["chat", "inventory", "analytics", "quickLists"]
  
  -- Trial
  trial_days INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT positive_price CHECK (price_per_month >= 0 AND (price_per_year IS NULL OR price_per_year >= 0))
);

COMMENT ON TABLE subscription_plan IS 'Subscription plans with pricing, limits, and features';
COMMENT ON COLUMN subscription_plan.limits IS 'JSONB object with limit keys: maxProducts, maxWarehouses, maxChatsPerDay, etc.';
COMMENT ON COLUMN subscription_plan.features IS 'JSONB array of feature names enabled in this plan';

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

CREATE INDEX idx_subscription_tenant ON subscription(tenant_id, tenant_type);
CREATE INDEX idx_subscription_status ON subscription(status);
CREATE INDEX idx_subscription_plan ON subscription(plan_id);

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
CREATE INDEX idx_override_tenant ON feature_flag_override(tenant_id, tenant_type);

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
CREATE INDEX idx_usage_tenant ON usage_meter(tenant_id, tenant_type);
CREATE INDEX idx_usage_overlimit ON usage_meter(is_over_limit) WHERE is_over_limit = true;

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
CREATE INDEX idx_audit_tenant ON admin_audit_log(target_tenant_id, target_tenant_type);
CREATE INDEX idx_audit_action ON admin_audit_log(action_type);
CREATE INDEX idx_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX idx_audit_date ON admin_audit_log(created_at DESC);

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

CREATE TRIGGER update_feature_flag_updated_at_trigger
BEFORE UPDATE ON feature_flag
FOR EACH ROW
EXECUTE FUNCTION update_feature_flag_updated_at();

-- ========================================
-- GRANT PERMISSIONS
-- ========================================
GRANT SELECT, INSERT, UPDATE, DELETE ON subscription_plan TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscription TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flag TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flag_override TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_meter TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_audit_log TO api_user;

-- ========================================
-- SEED DEFAULT PLANS
-- ========================================
INSERT INTO subscription_plan (name, description, price_per_month, limits, features, trial_days, display_order) VALUES
  ('Free', 'Basic features for small operations', 0,
   '{"maxProducts": 10, "maxWarehouses": 1, "maxChatsPerDay": 20, "maxOrdersPerDay": 5}',
   '[]', 0, 1),
  ('Bronze', 'Entry-level features', 29,
   '{"maxProducts": 50, "maxWarehouses": 2, "maxChatsPerDay": 100, "maxOrdersPerDay": 20}',
   '["chat", "inventory"]', 14, 2),
  ('Gold', 'Advanced features for growing businesses', 79,
   '{"maxProducts": 200, "maxWarehouses": 5, "maxChatsPerDay": 500, "maxOrdersPerDay": 100}',
   '["chat", "inventory", "analytics", "quickLists"]', 14, 3),
  ('Platinum', 'Enterprise features', 149,
   '{"maxProducts": -1, "maxWarehouses": -1, "maxChatsPerDay": -1, "maxOrdersPerDay": -1}',
   '["chat", "inventory", "analytics", "quickLists", "api", "webhooks", "support"]', 14, 4)
ON CONFLICT (name) DO NOTHING;

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

