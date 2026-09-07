-- Migration: 0196_public_catalog_product_indexes.sql
-- Public supplier catalog: name-ordered/searched listing and category filter/DISTINCT.

CREATE INDEX IF NOT EXISTS idx_product_supplier_name
  ON product (supplier_id, name);

CREATE INDEX IF NOT EXISTS idx_product_supplier_category
  ON product (supplier_id, category);
