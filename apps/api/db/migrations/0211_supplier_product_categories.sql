-- Supplier-owned catalog categories. Existing rows remain shared defaults.

ALTER TABLE product_category
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES supplier(id) ON DELETE CASCADE;

-- 0026 created global unique constraints. Categories now need to be unique per supplier.
ALTER TABLE product_category DROP CONSTRAINT IF EXISTS product_category_name_key;
ALTER TABLE product_category DROP CONSTRAINT IF EXISTS product_category_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_category_supplier_name_unique
  ON product_category (supplier_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_product_category_supplier_slug
  ON product_category (supplier_id, slug);
CREATE INDEX IF NOT EXISTS idx_product_category_supplier_id
  ON product_category (supplier_id);

COMMENT ON COLUMN product_category.supplier_id IS
  'NULL for platform shared categories; otherwise the supplier that owns the category.';