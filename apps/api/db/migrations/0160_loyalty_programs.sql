-- Migration: 0160_loyalty_programs.sql
-- Track D: B2B supplier→restaurant loyalty and B2C diner loyalty (minimal consumer stubs)

-- ---------------------------------------------------------------------------
-- D1: B2B supplier → restaurant loyalty
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS supplier_loyalty_program (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL UNIQUE REFERENCES supplier(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Loyalty Program',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  earn_points_per_currency NUMERIC(10, 4) NOT NULL DEFAULT 1,
  redeem_currency_per_point NUMERIC(10, 4) NOT NULL DEFAULT 0.01,
  min_redeem_points INTEGER NOT NULL DEFAULT 100 CHECK (min_redeem_points >= 0),
  max_redeem_percent NUMERIC(5, 2) NOT NULL DEFAULT 50
    CHECK (max_redeem_percent >= 0 AND max_redeem_percent <= 100),
  rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_loyalty_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_redeemed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, restaurant_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_ledger_entry_type') THEN
    CREATE TYPE loyalty_ledger_entry_type AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE', 'REVERSAL');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  entry_type loyalty_ledger_entry_type NOT NULL,
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  monetary_value NUMERIC(14, 3),
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_loyalty_program_supplier
  ON supplier_loyalty_program(supplier_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_loyalty_balance_restaurant
  ON restaurant_loyalty_balance(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_loyalty_balance_supplier
  ON restaurant_loyalty_balance(supplier_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_restaurant_supplier
  ON loyalty_ledger(restaurant_id, supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order
  ON loyalty_ledger(order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE supplier_loyalty_program IS 'B2B loyalty program config per supplier';
COMMENT ON TABLE restaurant_loyalty_balance IS 'Points balance per restaurant for each supplier program';
COMMENT ON TABLE loyalty_ledger IS 'Immutable B2B loyalty point movements';
