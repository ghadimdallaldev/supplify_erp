-- Paid featured supplier placement (separate from deal boosts)

CREATE TABLE IF NOT EXISTS supplier_featured_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  pricing_key VARCHAR(64),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  payment_status TEXT NOT NULL DEFAULT 'waived'
    CHECK (payment_status IN ('pending', 'paid', 'waived', 'failed')),
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_featured_placements_active
  ON supplier_featured_placements (status, starts_at, ends_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_featured_placements_supplier
  ON supplier_featured_placements (supplier_id, created_at DESC);

INSERT INTO promotion_pricing_config (pricing_key, display_name, billing_type, amount, duration_days, description, package_type)
VALUES (
  'featured_supplier_7_day',
  'Featured supplier — 7 days',
  'flat_fee',
  49,
  7,
  'Appear at the top of restaurant supplier discovery for 7 days',
  'featured_listing'
)
ON CONFLICT (pricing_key) DO NOTHING;

INSERT INTO promotion_pricing_config (pricing_key, display_name, billing_type, amount, duration_days, description, package_type)
VALUES (
  'featured_supplier_30_day',
  'Featured supplier — 30 days',
  'flat_fee',
  149,
  30,
  'Appear at the top of restaurant supplier discovery for 30 days',
  'featured_listing'
)
ON CONFLICT (pricing_key) DO NOTHING;
