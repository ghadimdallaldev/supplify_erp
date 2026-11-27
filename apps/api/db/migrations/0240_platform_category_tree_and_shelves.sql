-- Plan B Task 1: platform-only category tree (department -> category), supplier shelves,
-- category requests, data migration runs, and leaf-category integrity triggers.
--
-- The migrator runs statements one by one without a transaction, so everything that changes
-- existing data lives in ONE DO block (atomic). The functions before it are idempotent.

CREATE TABLE IF NOT EXISTS data_migration_run (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'verified', 'failed')),
  cursor JSONB,
  stats JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  error TEXT
);

COMMENT ON TABLE data_migration_run IS
  'Progress and verification record of resumable data migrations (e.g. category-backfill).';

-- Leaf validity: NULL passes; otherwise the id must be an active platform category with a
-- parent (level 2). Until the category backfill is verified, supplier-owned ids also pass, so
-- existing writes and the reorder-cadence job keep working (removed in release 2).
CREATE OR REPLACE FUNCTION assert_platform_leaf_category() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  col TEXT := TG_ARGV[0];
  v_id UUID := (to_jsonb(NEW) ->> col)::uuid;
  v_ok BOOLEAN;
  v_supplier_owned BOOLEAN;
BEGIN
  IF v_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> col)::uuid IS NOT DISTINCT FROM v_id THEN
    RETURN NEW;
  END IF;

  SELECT c.supplier_id IS NULL AND c.parent_category_id IS NOT NULL AND c.is_active,
         c.supplier_id IS NOT NULL
    INTO v_ok, v_supplier_owned
  FROM product_category c
  WHERE c.id = v_id;

  IF v_ok THEN
    RETURN NEW;
  END IF;

  IF v_supplier_owned AND NOT EXISTS (
    SELECT 1 FROM data_migration_run
    WHERE name = 'category-backfill' AND status = 'verified'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'category % is not a leaf platform category (%.%)', v_id, TG_TABLE_NAME, col
    USING ERRCODE = '23514';
END
$fn$;

DO $mig$
DECLARE
  v_split INTEGER := 0;
  r RECORD;
BEGIN
  -- 1. Columns ---------------------------------------------------------------------------
  ALTER TABLE product_category
    ADD COLUMN IF NOT EXISTS name_ar TEXT,
    ADD COLUMN IF NOT EXISTS name_fr TEXT,
    ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS icon_key TEXT;

  ALTER TABLE product
    ADD COLUMN IF NOT EXISTS category_needs_review BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS category_request_id UUID;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_id_supplier_id_key') THEN
    ALTER TABLE product ADD CONSTRAINT product_id_supplier_id_key UNIQUE (id, supplier_id);
  END IF;

  -- 2. Shelves ---------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS supplier_shelf (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    name_ar TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT supplier_shelf_id_supplier_key UNIQUE (id, supplier_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_shelf_active_name
    ON supplier_shelf (supplier_id, lower(btrim(name))) WHERE archived_at IS NULL;

  CREATE TABLE IF NOT EXISTS product_shelf (
    product_id UUID NOT NULL,
    shelf_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, shelf_id),
    CONSTRAINT product_shelf_product_fkey FOREIGN KEY (product_id, supplier_id)
      REFERENCES product (id, supplier_id) ON DELETE CASCADE,
    CONSTRAINT product_shelf_shelf_fkey FOREIGN KEY (shelf_id, supplier_id)
      REFERENCES supplier_shelf (id, supplier_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
  );
  CREATE INDEX IF NOT EXISTS idx_product_shelf_shelf ON product_shelf (shelf_id);

  -- 3. Category requests -----------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS category_request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
    proposed_name TEXT NOT NULL CHECK (length(btrim(proposed_name)) > 0),
    proposed_name_ar TEXT,
    normalized_name TEXT NOT NULL,
    proposed_parent_id UUID REFERENCES product_category(id) ON DELETE SET NULL,
    example_product_id UUID,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'merged', 'rejected')),
    resolved_category_id UUID REFERENCES product_category(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT category_request_example_product_fkey FOREIGN KEY (example_product_id, supplier_id)
      REFERENCES product (id, supplier_id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_category_request_pending_name
    ON category_request (supplier_id, normalized_name) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS idx_category_request_status
    ON category_request (status, created_at DESC);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_category_request_id_fkey') THEN
    ALTER TABLE product ADD CONSTRAINT product_category_request_id_fkey
      FOREIGN KEY (category_request_id) REFERENCES category_request(id) ON DELETE SET NULL;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_product_category_request
    ON product (category_request_id) WHERE category_request_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_product_needs_review
    ON product (supplier_id) WHERE category_needs_review;

  -- 4. Promotion targets: exactly one of product / category / shelf -----------------------
  ALTER TABLE promotion_targets ADD COLUMN IF NOT EXISTS shelf_id UUID;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotion_targets_shelf_id_fkey') THEN
    ALTER TABLE promotion_targets ADD CONSTRAINT promotion_targets_shelf_id_fkey
      FOREIGN KEY (shelf_id) REFERENCES supplier_shelf(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_promotion_targets_shelf
    ON promotion_targets (shelf_id) WHERE shelf_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_promotion_targets_category
    ON promotion_targets (category_id) WHERE category_id IS NOT NULL;

  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'promotion_targets'::regclass AND contype = 'c'
      AND conname <> 'promotion_targets_exactly_one_target'
  LOOP
    EXECUTE format('ALTER TABLE promotion_targets DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Rows with both product and category become two rows (never deleted).
  WITH both_ids AS (
    SELECT id, promotion_id, category_id FROM promotion_targets
    WHERE product_id IS NOT NULL AND category_id IS NOT NULL
  ), inserted AS (
    INSERT INTO promotion_targets (promotion_id, category_id)
    SELECT promotion_id, category_id FROM both_ids
    RETURNING 1
  )
  UPDATE promotion_targets t SET category_id = NULL
  FROM both_ids WHERE t.id = both_ids.id;
  GET DIAGNOSTICS v_split = ROW_COUNT;

  INSERT INTO data_migration_run (name, status, stats, finished_at)
  VALUES ('promotion-target-split', 'done', jsonb_build_object('split', v_split), now())
  ON CONFLICT (name) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotion_targets_exactly_one_target'
  ) THEN
    ALTER TABLE promotion_targets ADD CONSTRAINT promotion_targets_exactly_one_target
      CHECK (num_nonnulls(product_id, category_id, shelf_id) = 1);
  END IF;

  ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_applies_to_check;
  ALTER TABLE promotions ADD CONSTRAINT promotions_applies_to_check
    CHECK (applies_to IN ('all', 'specific_products', 'specific_categories', 'specific_shelves'));

  -- 5. Warehouse routing: shelf rules ---------------------------------------------------
  ALTER TABLE warehouse_routing_rule ADD COLUMN IF NOT EXISTS shelf_id UUID;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_routing_rule_shelf_id_fkey'
  ) THEN
    ALTER TABLE warehouse_routing_rule ADD CONSTRAINT warehouse_routing_rule_shelf_id_fkey
      FOREIGN KEY (shelf_id) REFERENCES supplier_shelf(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_warehouse_routing_rule_shelf
    ON warehouse_routing_rule (shelf_id) WHERE shelf_id IS NOT NULL;
  ALTER TABLE warehouse_routing_rule DROP CONSTRAINT IF EXISTS warehouse_routing_rule_rule_type_check;
  ALTER TABLE warehouse_routing_rule ADD CONSTRAINT warehouse_routing_rule_rule_type_check
    CHECK (rule_type IN ('product', 'category', 'shelf', 'zone', 'stock_available', 'default'));

  -- 6. Category references: CASCADE -> NO ACTION (no silent deletion). Deferred to commit:
  -- a supplier delete cascades into both sides (shelves/categories and the referencing rows),
  -- and a non-deferred check fires inside the first cascade, before the second removes the rows.
  ALTER TABLE promotion_targets DROP CONSTRAINT IF EXISTS promotion_targets_category_id_fkey;
  ALTER TABLE promotion_targets ADD CONSTRAINT promotion_targets_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES product_category(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
  ALTER TABLE warehouse_routing_rule DROP CONSTRAINT IF EXISTS warehouse_routing_rule_category_id_fkey;
  ALTER TABLE warehouse_routing_rule ADD CONSTRAINT warehouse_routing_rule_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES product_category(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
  ALTER TABLE restaurant_order_cadence DROP CONSTRAINT IF EXISTS restaurant_order_cadence_category_id_fkey;
  ALTER TABLE restaurant_order_cadence ADD CONSTRAINT restaurant_order_cadence_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES product_category(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

  -- 7. Departments, then re-parent the 16 existing platform rows (ids, names kept) --------
  INSERT INTO product_category (name, slug, display_order)
  SELECT d.name, d.slug, d.ord
  FROM (VALUES
    ('Fresh produce', 'dept-fresh-produce', 1),
    ('Meat & poultry', 'dept-meat-poultry', 2),
    ('Seafood', 'dept-seafood', 3),
    ('Dairy, eggs & cheese', 'dept-dairy-eggs-cheese', 4),
    ('Bakery & pastry', 'dept-bakery-pastry', 5),
    ('Pantry & dry goods', 'dept-pantry-dry-goods', 6),
    ('Oils, fats & vinegar', 'dept-oils-fats-vinegar', 7),
    ('Spices & seasonings', 'dept-spices-seasonings', 8),
    ('Sauces & condiments', 'dept-sauces-condiments', 9),
    ('Canned & preserved', 'dept-canned-preserved', 10),
    ('Frozen', 'dept-frozen', 11),
    ('Snacks, nuts & sweets', 'dept-snacks-nuts-sweets', 12),
    ('Beverages', 'dept-beverages', 13),
    ('Cleaning & hygiene', 'dept-cleaning-hygiene', 14),
    ('Packaging & disposables', 'dept-packaging-disposables', 15),
    ('Kitchen equipment & smallwares', 'dept-kitchen-equipment', 16),
    ('Uniforms & textiles', 'dept-uniforms-textiles', 17),
    ('Other', 'dept-other', 99)
  ) AS d(name, slug, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM product_category c WHERE c.slug = d.slug AND c.supplier_id IS NULL
  );

  UPDATE product_category c
  SET parent_category_id = dept.id, updated_at = now()
  FROM (VALUES
    ('vegetables', 'dept-fresh-produce'),
    ('meat-poultry', 'dept-meat-poultry'),
    ('seafood', 'dept-seafood'),
    ('dairy', 'dept-dairy-eggs-cheese'),
    ('bakery-bread', 'dept-bakery-pastry'),
    ('grains-legumes', 'dept-pantry-dry-goods'),
    ('oils-fats', 'dept-oils-fats-vinegar'),
    ('spices-seasonings', 'dept-spices-seasonings'),
    ('condiments-sauces', 'dept-sauces-condiments'),
    ('canned-preserved', 'dept-canned-preserved'),
    ('frozen-foods', 'dept-frozen'),
    ('snacks-nuts', 'dept-snacks-nuts-sweets'),
    ('beverages', 'dept-beverages'),
    ('cleaning-supplies', 'dept-cleaning-hygiene'),
    ('paper-disposables', 'dept-packaging-disposables'),
    ('other', 'dept-other')
  ) AS m(slug, dept_slug)
  JOIN product_category dept ON dept.slug = m.dept_slug AND dept.supplier_id IS NULL
  WHERE c.slug = m.slug AND c.supplier_id IS NULL
    AND c.parent_category_id IS DISTINCT FROM dept.id;

  -- 8. Unique indexes on the platform tree (after the re-parent) ---------------------------
  CREATE UNIQUE INDEX IF NOT EXISTS idx_product_category_platform_slug
    ON product_category (slug) WHERE supplier_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_product_category_platform_parent_name
    ON product_category (
      COALESCE(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)
    ) WHERE supplier_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_product_category_aliases
    ON product_category USING GIN (aliases);
  CREATE INDEX IF NOT EXISTS idx_product_category_parent
    ON product_category (parent_category_id);

  -- 9. Leaf triggers on every referencing column ----------------------------------------
  DROP TRIGGER IF EXISTS trg_product_leaf_category ON product;
  CREATE TRIGGER trg_product_leaf_category
    BEFORE INSERT OR UPDATE OF category_id ON product
    FOR EACH ROW EXECUTE FUNCTION assert_platform_leaf_category('category_id');

  DROP TRIGGER IF EXISTS trg_promotion_targets_leaf_category ON promotion_targets;
  CREATE TRIGGER trg_promotion_targets_leaf_category
    BEFORE INSERT OR UPDATE OF category_id ON promotion_targets
    FOR EACH ROW EXECUTE FUNCTION assert_platform_leaf_category('category_id');

  DROP TRIGGER IF EXISTS trg_warehouse_routing_rule_leaf_category ON warehouse_routing_rule;
  CREATE TRIGGER trg_warehouse_routing_rule_leaf_category
    BEFORE INSERT OR UPDATE OF category_id ON warehouse_routing_rule
    FOR EACH ROW EXECUTE FUNCTION assert_platform_leaf_category('category_id');

  DROP TRIGGER IF EXISTS trg_restaurant_order_cadence_leaf_category ON restaurant_order_cadence;
  CREATE TRIGGER trg_restaurant_order_cadence_leaf_category
    BEFORE INSERT OR UPDATE OF category_id ON restaurant_order_cadence
    FOR EACH ROW EXECUTE FUNCTION assert_platform_leaf_category('category_id');

  IF v_split > 0 THEN
    RAISE NOTICE 'promotion_targets split into two rows: %', v_split;
  END IF;
END
$mig$;

COMMENT ON TABLE supplier_shelf IS
  'Supplier-owned storefront sections (branch supplier row). Never shown in cross-supplier browse.';
COMMENT ON COLUMN product.category_needs_review IS
  'True when the platform category was not matched automatically and needs supplier review.';
