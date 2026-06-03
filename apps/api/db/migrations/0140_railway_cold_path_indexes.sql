-- Migration: 0140_railway_cold_path_indexes.sql
-- Cold first-open paths: products, pricing, staff, orders/reports date filters.

CREATE INDEX IF NOT EXISTS idx_product_supplier_created
  ON product (supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_category_id_supplier
  ON product (category_id, supplier_id)
  WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_pricing_restaurant_active
  ON restaurant_pricing (restaurant_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_staff_document_restaurant_uploaded
  ON staff_document (restaurant_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_order_restaurant_placed
  ON customer_order (restaurant_id, placed_at DESC);

-- supplier_id is on order_item, not customer_order (see 0001_init.sql)
CREATE INDEX IF NOT EXISTS idx_order_item_supplier_order
  ON order_item (supplier_id, order_id);

CREATE INDEX IF NOT EXISTS idx_disputes_restaurant_created
  ON disputes (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disputes_supplier_created
  ON disputes (supplier_id, created_at DESC);
