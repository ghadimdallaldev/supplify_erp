-- Organisation-level supplier relationships (marketplace visibility, Plan A Task 1).
--
-- 1. Every supplier belongs to a supplier organisation: orgless rows get a single-branch
--    organisation, and a trigger does the same for any future insert/unlink that leaves
--    organization_id NULL. supplier.organization_id becomes NOT NULL.
-- 2. supplier_follow / supplier_blocklist gain supplier_org_id (backfilled from the row's
--    supplier), duplicates per (restaurant, organisation) are merged (earliest kept), and a
--    follow that coexists with a block for the same organisation is dropped.
-- 3. UNIQUE (restaurant_id, supplier_org_id) + INDEX (supplier_org_id) on both tables.
--
-- supplier_id stays (writers fill it with the organisation's branch) until release 2.
-- Idempotent: re-running converges to the same state. One DO block, so a failure rolls back.
DO $migration$
DECLARE
  v_orgs_created integer := 0;
  v_follow_merged integer := 0;
  v_block_merged integer := 0;
  v_follow_blocked integer := 0;
BEGIN
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION supplier_ensure_organization() RETURNS trigger
    LANGUAGE plpgsql AS $body$
    DECLARE
      v_org uuid;
      v_base text;
    BEGIN
      IF NEW.organization_id IS NULL THEN
        v_base := left(
          trim(both '-' from regexp_replace(lower(coalesce(NEW.slug, NEW.name, 'supplier')),
                                            '[^a-z0-9]+', '-', 'g')),
          180);
        INSERT INTO supplier_organizations (name, slug)
        VALUES (coalesce(nullif(NEW.name, ''), 'Supplier'),
                coalesce(nullif(v_base, ''), 'supplier') || '-org-' ||
                  left(replace(gen_random_uuid()::text, '-', ''), 12))
        RETURNING id INTO v_org;
        NEW.organization_id := v_org;
        NEW.is_main_branch := true;
      END IF;
      RETURN NEW;
    END
    $body$
  $fn$;

  DROP TRIGGER IF EXISTS supplier_ensure_organization ON supplier;
  CREATE TRIGGER supplier_ensure_organization
    BEFORE INSERT OR UPDATE OF organization_id ON supplier
    FOR EACH ROW EXECUTE FUNCTION supplier_ensure_organization();

  -- Existing orgless suppliers: setting NULL again fires the trigger per row.
  UPDATE supplier SET organization_id = NULL WHERE organization_id IS NULL;
  GET DIAGNOSTICS v_orgs_created = ROW_COUNT;
  ALTER TABLE supplier ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE supplier_follow
    ADD COLUMN IF NOT EXISTS supplier_org_id uuid
      REFERENCES supplier_organizations(id) ON DELETE CASCADE;
  ALTER TABLE supplier_blocklist
    ADD COLUMN IF NOT EXISTS supplier_org_id uuid
      REFERENCES supplier_organizations(id) ON DELETE CASCADE;

  -- Writers that only know the branch (seeds, legacy paths) get the organisation filled in.
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION relationship_fill_supplier_org_id() RETURNS trigger
    LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW.supplier_org_id IS NULL THEN
        SELECT organization_id INTO NEW.supplier_org_id FROM supplier WHERE id = NEW.supplier_id;
      END IF;
      RETURN NEW;
    END
    $body$
  $fn$;
  DROP TRIGGER IF EXISTS supplier_follow_fill_org ON supplier_follow;
  CREATE TRIGGER supplier_follow_fill_org
    BEFORE INSERT ON supplier_follow
    FOR EACH ROW EXECUTE FUNCTION relationship_fill_supplier_org_id();
  DROP TRIGGER IF EXISTS supplier_blocklist_fill_org ON supplier_blocklist;
  CREATE TRIGGER supplier_blocklist_fill_org
    BEFORE INSERT ON supplier_blocklist
    FOR EACH ROW EXECUTE FUNCTION relationship_fill_supplier_org_id();

  UPDATE supplier_follow f SET supplier_org_id = s.organization_id
  FROM supplier s WHERE s.id = f.supplier_id AND f.supplier_org_id IS NULL;
  UPDATE supplier_blocklist b SET supplier_org_id = s.organization_id
  FROM supplier s WHERE s.id = b.supplier_id AND b.supplier_org_id IS NULL;

  DELETE FROM supplier_follow f
  USING (
    SELECT id, row_number() OVER (
      PARTITION BY restaurant_id, supplier_org_id ORDER BY created_at, id) AS rn
    FROM supplier_follow
  ) d
  WHERE d.id = f.id AND d.rn > 1;
  GET DIAGNOSTICS v_follow_merged = ROW_COUNT;

  DELETE FROM supplier_blocklist b
  USING (
    SELECT id, row_number() OVER (
      PARTITION BY restaurant_id, supplier_org_id ORDER BY created_at, id) AS rn
    FROM supplier_blocklist
  ) d
  WHERE d.id = b.id AND d.rn > 1;
  GET DIAGNOSTICS v_block_merged = ROW_COUNT;

  DELETE FROM supplier_follow f
  USING supplier_blocklist b
  WHERE b.restaurant_id = f.restaurant_id AND b.supplier_org_id = f.supplier_org_id;
  GET DIAGNOSTICS v_follow_blocked = ROW_COUNT;

  ALTER TABLE supplier_follow ALTER COLUMN supplier_org_id SET NOT NULL;
  ALTER TABLE supplier_blocklist ALTER COLUMN supplier_org_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_follow_restaurant_org
    ON supplier_follow (restaurant_id, supplier_org_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_blocklist_restaurant_org
    ON supplier_blocklist (restaurant_id, supplier_org_id);
  CREATE INDEX IF NOT EXISTS idx_supplier_follow_org ON supplier_follow (supplier_org_id);
  CREATE INDEX IF NOT EXISTS idx_supplier_blocklist_org ON supplier_blocklist (supplier_org_id);

  RAISE NOTICE 'org_level_relationships: orgs_created=% follow_merged=% block_merged=% follow_dropped_blocked=%',
    v_orgs_created, v_follow_merged, v_block_merged, v_follow_blocked;
END
$migration$;
