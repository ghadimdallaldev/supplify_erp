-- Migration: 0095_deal_promotions_system.sql
-- Monetizable supplier deals: extended deal fields, paid promotions, interactions, pricing config

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(64);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_order_quantity INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS cta_type VARCHAR(30) NOT NULL DEFAULT 'order_now';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS target_restaurant_types JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS target_areas JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS stock_quantity INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS requires_admin_approval BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_cta_type_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_cta_type_check
  CHECK (cta_type IN ('order_now', 'use_coupon', 'message_supplier', 'view_products'));

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_status_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_status_check
  CHECK (status IN ('draft', 'active', 'paused', 'expired', 'pending_approval'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_supplier_coupon_code
  ON promotions(supplier_id, lower(coupon_code))
  WHERE coupon_code IS NOT NULL AND coupon_code <> '';

CREATE TABLE IF NOT EXISTS deal_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  budget NUMERIC(12, 2) NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  target_audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  messages_count INTEGER NOT NULL DEFAULT 0,
  coupon_uses INTEGER NOT NULL DEFAULT 0,
  billing_type VARCHAR(30) NOT NULL DEFAULT 'flat_fee'
    CHECK (billing_type IN ('flat_fee', 'per_day', 'per_impression', 'subscription_addon')),
  billing_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (billing_status IN ('pending', 'paid', 'failed', 'refunded', 'waived')),
  payment_reference TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_promotions_deal ON deal_promotions(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_promotions_supplier_status
  ON deal_promotions(supplier_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS deal_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  deal_promotion_id UUID REFERENCES deal_promotions(id) ON DELETE SET NULL,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  interaction_type VARCHAR(30) NOT NULL
    CHECK (interaction_type IN ('view', 'click', 'order', 'coupon_used', 'message')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_interactions_deal ON deal_interactions(deal_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_deal_interactions_restaurant ON deal_interactions(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_interactions_supplier ON deal_interactions(supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS promotion_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_key VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  billing_type VARCHAR(30) NOT NULL DEFAULT 'flat_fee'
    CHECK (billing_type IN ('flat_fee', 'per_day', 'per_impression', 'subscription_addon')),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  duration_days INTEGER,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO promotion_pricing_config (pricing_key, display_name, billing_type, amount, duration_days, description)
VALUES
  ('boost_7_day', '7-day deal boost', 'per_day', 49.00, 7, 'Promote your deal to restaurants for 7 days'),
  ('boost_30_day', '30-day deal boost', 'per_day', 149.00, 30, 'Promote your deal to restaurants for 30 days'),
  ('boost_flat', 'Single deal promotion', 'flat_fee', 29.00, NULL, 'One-time promotion fee per boosted deal')
ON CONFLICT (pricing_key) DO NOTHING;

COMMENT ON TABLE deal_promotions IS 'Paid visibility/boost campaigns for supplier deals';
COMMENT ON TABLE deal_interactions IS 'Restaurant interactions with deals for analytics';
COMMENT ON TABLE promotion_pricing_config IS 'Admin-configurable pricing for deal boosts';
