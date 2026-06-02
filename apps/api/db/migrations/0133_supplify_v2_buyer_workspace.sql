-- Supplify V2: buyer-only restaurant workspaces and supplier→restaurant invites (additive, backward-compatible)

ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS workspace_mode TEXT NOT NULL DEFAULT 'full'
    CHECK (workspace_mode IN ('full', 'buyer_only'));

ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS workspace_upgraded_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurant.workspace_mode IS 'full = paid/ops workspace; buyer_only = free buyer invited by supplier (V2)';
COMMENT ON COLUMN restaurant.workspace_upgraded_at IS 'When buyer_only upgraded to full workspace (V2 metrics)';

CREATE TABLE IF NOT EXISTS supplier_restaurant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  invited_name VARCHAR(255),
  invited_email VARCHAR(255) NOT NULL,
  restaurant_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES app_user(id),
  restaurant_id UUID REFERENCES restaurant(id) ON DELETE SET NULL,
  invited_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_restaurant_invitations_token
  ON supplier_restaurant_invitations(token);
CREATE INDEX IF NOT EXISTS idx_supplier_restaurant_invitations_supplier_status
  ON supplier_restaurant_invitations(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_restaurant_invitations_email
  ON supplier_restaurant_invitations(LOWER(invited_email));

CREATE TABLE IF NOT EXISTS supplier_restaurant_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'revoked')),
  invitation_id UUID REFERENCES supplier_restaurant_invitations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_restaurant_links_restaurant
  ON supplier_restaurant_links(restaurant_id, status);

INSERT INTO subscription_plan (
  code, name, display_name, tenant_type, type,
  price_per_month, price_per_year, is_active,
  limits, features
)
SELECT
  'buyer_free',
  'Buyer Free',
  'Restaurant Buyer (Free)',
  'RESTAURANT',
  'restaurant_only',
  0,
  0,
  true,
  '{
    "branches": 1,
    "users": 3,
    "orders_per_day": 50,
    "suppliers_per_restaurant": 1,
    "restaurant_inventory_skus": 0,
    "chats_per_day": 20,
    "storage_mb": 100
  }'::jsonb,
  '{
    "chat": true,
    "reports": false,
    "smart_reorder": true,
    "multi_branch": false,
    "quick_lists": "basic_manual_only",
    "inventory_management": false,
    "waste_tracking": false,
    "receiving_quality": false,
    "finance_invoices": "view_only",
    "supplier_deals": true,
    "notifications": "in_app_only",
    "order_calendar": false,
    "advanced_roles": false
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plan WHERE code = 'buyer_free' AND tenant_type = 'RESTAURANT'
);
