-- Migration: 0103_customer_order_placed_at_index.sql
-- Speed up admin overview and reporting filters on placed_at

CREATE INDEX IF NOT EXISTS idx_customer_order_placed_at
  ON customer_order(placed_at DESC)
  WHERE placed_at IS NOT NULL;
