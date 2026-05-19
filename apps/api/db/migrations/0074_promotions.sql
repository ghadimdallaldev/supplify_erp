-- Migration: 0074_promotions.sql
-- Supplier promotions, targeting, and order usage tracking

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'percentage_discount', 'fixed_discount', 'free_shipping', 'buy_x_get_y', 'featured_listing'
  )),
  discount_value NUMERIC(10, 2),
  min_order_amount NUMERIC(12, 2),
  max_discount_cap NUMERIC(12, 2),
  buy_quantity INTEGER,
  get_quantity INTEGER,
  applies_to VARCHAR(20) NOT NULL DEFAULT 'all'
    CHECK (applies_to IN ('all', 'specific_products', 'specific_categories')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotion_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_category(id) ON DELETE CASCADE,
  CHECK (product_id IS NOT NULL OR category_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS promotion_restaurant_targets (
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS promotion_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  discount_applied NUMERIC(12, 2) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promotion_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_supplier_status_dates
  ON promotions(supplier_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_status_featured
  ON promotions(status, is_featured) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_promotion_targets_promotion
  ON promotion_targets(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_promotion
  ON promotion_usages(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_order
  ON promotion_usages(order_id);
