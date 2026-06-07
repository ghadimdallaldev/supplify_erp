-- Migration: 0142_order_create_hot_path_indexes.sql
-- Query-driven indexes for POST /api/orders product pricing and contract lookup.

-- Batch contract pricing: restaurant_id + supplier/product filters with active contracts
CREATE INDEX IF NOT EXISTS idx_restaurant_pricing_restaurant_supplier_product_active
  ON restaurant_pricing (restaurant_id, supplier_id, product_id, updated_at DESC)
  WHERE is_active = true;

-- Current catalog price lookup (DISTINCT ON product_id ORDER BY valid_from DESC)
CREATE INDEX IF NOT EXISTS idx_price_product_valid_from_desc
  ON price (product_id, valid_from DESC);
