-- Migration: 0038_orders_list_indexes.sql
-- Description: Indexes for orders list (restaurant + created_at) and order_item batch by order_id.
-- Improves GET /api/orders list and batch fetch of items by order IDs.
-- For production, consider running with CONCURRENTLY to avoid long table locks:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_order_restaurant_created ON customer_order(restaurant_id, created_at DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_item_order_id ON order_item(order_id);

CREATE INDEX IF NOT EXISTS idx_customer_order_restaurant_created ON customer_order(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_item_order_id ON order_item(order_id);
