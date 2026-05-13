-- Admin feature toggles: global defaults + per-tenant overrides (layered on subscription plans).
-- Resolution order: tenant override → global override → plan features.

CREATE TABLE IF NOT EXISTS feature_flag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  description TEXT,
  -- NULL = no global override (use each tenant's plan). true/false = force globally.
  global_override BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE feature_flag IS 'Master list of features; global_override forces on/off for all tenants when set';
COMMENT ON COLUMN feature_flag.global_override IS 'NULL=inherit from plan; true=force on; false=force off';

CREATE TABLE IF NOT EXISTS feature_flag_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_type, feature_key)
);

COMMENT ON TABLE feature_flag_override IS 'Per-tenant feature overrides (highest priority)';
CREATE INDEX IF NOT EXISTS idx_feature_flag_override_tenant
  ON feature_flag_override (tenant_id, tenant_type);

INSERT INTO feature_flag (feature_key, feature_name, description, global_override) VALUES
  ('chat', 'Chat', 'Messaging between restaurants and suppliers', NULL),
  ('reports', 'Reports & analytics', 'Dashboards and invoice analytics', NULL),
  ('smart_reorder', 'Smart reorder', 'AI-assisted reorder suggestions', NULL),
  ('multi_branch', 'Multi-branch', 'Multiple restaurant branches', NULL),
  ('receiving_quality', 'Receiving & quality', 'Receiving workflows and quality checks', NULL),
  ('finance_invoices', 'Finance & invoices', 'Invoice and payment features', NULL),
  ('quick_lists', 'Quick lists', 'Saved order lists and scheduling', NULL),
  ('inventory_management', 'Inventory management', 'Stock and inventory tools', NULL),
  ('waste_tracking', 'Waste tracking', 'Waste logging and analytics', NULL),
  ('approvals_budgets', 'Approvals & budgets', 'Approval flows and budget caps', NULL),
  ('notifications', 'Notifications', 'Email/SMS/in-app notifications', NULL),
  ('api_integrations', 'API integrations', 'API keys and external integrations', NULL),
  ('support_sla', 'Support SLA', 'Support tier and SLA', NULL),
  ('custom_branding', 'Custom branding', 'Logo and white-label options', NULL),
  ('fulfillment_tools', 'Fulfillment tools', 'Supplier fulfillment and routing', NULL),
  ('feature_flags_access', 'Feature flag admin', 'Admin access to feature toggles', NULL)
ON CONFLICT (feature_key) DO NOTHING;
