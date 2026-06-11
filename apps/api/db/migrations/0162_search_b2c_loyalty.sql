-- Migration: 0162_search_b2c_loyalty.sql
-- Search/favorites (renumbered from 0158) + B2C loyalty + review FK

-- ---------------------------------------------------------------------------
-- Track A: Full-text search, search history, product favorites
-- ---------------------------------------------------------------------------

ALTER TABLE product
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(name_ar, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(sku, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(tags::text, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_product_search_vector ON product USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER', 'ADMIN')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'supplier', 'order', 'global')),
  query TEXT NOT NULL CHECK (char_length(trim(query)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, tenant_type, entity_type, query)
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_tenant
  ON search_history (user_id, tenant_id, tenant_type, entity_type, created_at DESC);

CREATE TABLE IF NOT EXISTS product_favorite (
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_product_favorite_restaurant_user
  ON product_favorite (restaurant_id, user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Track D2: B2C diner loyalty (after consumer_order / consumer_member from 0161)
-- ---------------------------------------------------------------------------

ALTER TABLE consumer_member
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  ADD COLUMN IF NOT EXISTS lifetime_earned INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_redeemed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS consumer_loyalty_program (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL UNIQUE REFERENCES restaurant(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Rewards',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  earn_points_per_currency NUMERIC(10, 4) NOT NULL DEFAULT 1,
  redeem_currency_per_point NUMERIC(10, 4) NOT NULL DEFAULT 0.01,
  min_redeem_points INTEGER NOT NULL DEFAULT 50 CHECK (min_redeem_points >= 0),
  rules_json JSONB NOT NULL DEFAULT '{
    "fulfillment_multipliers": {
      "TAKEAWAY": 1,
      "DELIVERY": 1.25,
      "DINE_IN": 1.5
    }
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consumer_loyalty_entry_type') THEN
    CREATE TYPE consumer_loyalty_entry_type AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE', 'REVERSAL');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS consumer_loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  consumer_member_id UUID NOT NULL REFERENCES consumer_member(id) ON DELETE CASCADE,
  consumer_order_id UUID REFERENCES consumer_order(id) ON DELETE SET NULL,
  entry_type consumer_loyalty_entry_type NOT NULL,
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  fulfillment_type TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumer_loyalty_ledger_member
  ON consumer_loyalty_ledger(consumer_member_id, created_at DESC);

-- FK for restaurant reviews (0159) once consumer_order exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_reviews_consumer_order_id_fkey'
  ) THEN
    ALTER TABLE restaurant_reviews
      ADD CONSTRAINT restaurant_reviews_consumer_order_id_fkey
      FOREIGN KEY (consumer_order_id) REFERENCES consumer_order(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END
$$;
