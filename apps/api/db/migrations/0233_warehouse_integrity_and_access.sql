-- One atomic migration statement: the existing migrator executes statements separately.
DO $audit_migration$
DECLARE initial_install BOOLEAN := to_regclass('public.supplier_warehouse_access') IS NULL;
BEGIN
-- Additive scope extension. No existing ownership or operational history is reassigned.
CREATE TABLE IF NOT EXISTS supplier_warehouse_access (
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('all', 'assigned')),
  granted_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, supplier_id)
);
CREATE TABLE IF NOT EXISTS supplier_warehouse_access_location (
  user_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id),
  PRIMARY KEY (user_id, supplier_id, warehouse_id),
  FOREIGN KEY (user_id, supplier_id) REFERENCES supplier_warehouse_access(user_id, supplier_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS supplier_warehouse_access_location_warehouse ON supplier_warehouse_access_location(warehouse_id);

-- Preserve existing grants, including org-wide and assigned-branch org roles. Permissions
-- still decide which actions these users may perform. No grants for revoked/foreign workspaces.
IF initial_install THEN
INSERT INTO supplier_warehouse_access (user_id, supplier_id, mode)
SELECT DISTINCT grants.user_id, grants.supplier_id, 'all'
FROM (
  SELECT ur.user_id, ur.tenant_id AS supplier_id FROM tenant_user_roles ur
    JOIN tenant_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id AND r.tenant_type = ur.tenant_type
    WHERE ur.tenant_type = 'SUPPLIER'
  UNION SELECT ur.user_id, ur.tenant_id FROM user_role ur JOIN role r ON r.id = ur.role_id AND r.tenant_type = ur.tenant_type
    WHERE ur.tenant_type = 'SUPPLIER' AND ur.tenant_id IS NOT NULL
  UNION SELECT ou.user_id, s.id FROM org_user_roles ou
    JOIN org_roles org_role ON org_role.id = ou.role_id AND org_role.organization_id = ou.organization_id
    JOIN supplier s ON s.organization_id = ou.organization_id
    WHERE EXISTS (SELECT 1 FROM org_role_permissions rp WHERE rp.role_id = ou.role_id AND (
      rp.branch_scope = 'all' OR EXISTS (SELECT 1 FROM org_user_branch_access ba
        WHERE ba.user_id = ou.user_id AND ba.supplier_id = s.id AND ba.organization_id = s.organization_id)))
) grants
JOIN app_user u ON u.id = grants.user_id AND COALESCE(u.is_active, TRUE)
JOIN supplier s ON s.id = grants.supplier_id
LEFT JOIN user_workspace_membership m ON m.user_id = u.id
WHERE m.user_id IS NULL OR (m.status = 'active' AND m.workspace_type = 'SUPPLIER' AND (
  m.home_tenant_id = s.id OR (m.organization_id IS NOT NULL AND m.organization_id = s.organization_id)
  OR EXISTS (SELECT 1 FROM tenant_account_link l WHERE l.parent_tenant_id = m.home_tenant_id
    AND l.child_tenant_id = s.id AND l.parent_tenant_type = 'SUPPLIER' AND l.child_tenant_type = 'SUPPLIER')
)) ON CONFLICT DO NOTHING;
END IF;

-- NOT VALID protects new writes without guessing how to repair pre-existing anomalies.
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_owner_consistent' AND conrelid = 'warehouse'::regclass) THEN
ALTER TABLE warehouse ADD CONSTRAINT warehouse_owner_consistent CHECK (COALESCE(tenant_id, supplier_id) IS NOT NULL AND (tenant_id IS NULL OR supplier_id IS NULL OR tenant_id = supplier_id)) NOT VALID;
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stock_nonnegative' AND conrelid = 'warehouse_inventory'::regclass) THEN
ALTER TABLE warehouse_inventory ADD CONSTRAINT warehouse_stock_nonnegative CHECK (quantity_available >= 0 AND quantity_reserved >= 0 AND quantity_on_hand >= 0) NOT VALID;
END IF;

CREATE OR REPLACE FUNCTION enforce_warehouse_stock_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id UUID; active BOOLEAN; product_owner UUID;
BEGIN
  -- Shares the lifecycle lock, including writers outside the HTTP order path.
  SELECT COALESCE(tenant_id, supplier_id), is_active INTO owner_id, active
    FROM warehouse WHERE id = NEW.warehouse_id FOR SHARE;
  IF owner_id IS NULL OR active IS NOT TRUE THEN
    RAISE EXCEPTION 'Warehouse is missing or inactive' USING ERRCODE = '23514';
  END IF;
  SELECT supplier_id INTO product_owner FROM product WHERE id = NEW.product_id;
  IF product_owner IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'Product and warehouse must belong to the same supplier' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS warehouse_stock_ownership ON warehouse_inventory;
CREATE TRIGGER warehouse_stock_ownership BEFORE INSERT OR UPDATE ON warehouse_inventory
  FOR EACH ROW EXECUTE FUNCTION enforce_warehouse_stock_ownership();

CREATE OR REPLACE FUNCTION enforce_warehouse_access_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM warehouse w WHERE w.id = NEW.warehouse_id
    AND COALESCE(w.tenant_id, w.supplier_id) = NEW.supplier_id) THEN
    RAISE EXCEPTION 'Warehouse access must remain within its supplier' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS warehouse_access_ownership ON supplier_warehouse_access_location;
CREATE TRIGGER warehouse_access_ownership BEFORE INSERT OR UPDATE ON supplier_warehouse_access_location
  FOR EACH ROW EXECUTE FUNCTION enforce_warehouse_access_ownership();

CREATE OR REPLACE FUNCTION prevent_warehouse_owner_reassignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(OLD.tenant_id, OLD.supplier_id) IS DISTINCT FROM COALESCE(NEW.tenant_id, NEW.supplier_id) THEN
    RAISE EXCEPTION 'Warehouse ownership cannot be reassigned across supplier tenants' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS warehouse_owner_immutable ON warehouse;
CREATE TRIGGER warehouse_owner_immutable BEFORE UPDATE OF tenant_id, supplier_id ON warehouse
  FOR EACH ROW EXECUTE FUNCTION prevent_warehouse_owner_reassignment();

CREATE OR REPLACE FUNCTION enforce_active_order_tenants() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.restaurant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM restaurant WHERE id = NEW.restaurant_id
    AND COALESCE(is_branch_active, TRUE) FOR SHARE) THEN
    RAISE EXCEPTION 'Restaurant branch is missing or inactive' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_active_tenants ON customer_order;
CREATE TRIGGER order_active_tenants BEFORE INSERT ON customer_order
  FOR EACH ROW EXECUTE FUNCTION enforce_active_order_tenants();

CREATE OR REPLACE FUNCTION initialize_supplier_warehouse_access() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assigned_only BOOLEAN;
BEGIN
  IF NEW.tenant_type = 'SUPPLIER' AND NEW.tenant_id IS NOT NULL THEN
    SELECT (NOT r.is_system OR r.name IN ('Warehouse Manager', 'Order Fulfillment Staff', 'Warehouse Staff', 'Fulfillment Staff'))
      INTO assigned_only FROM tenant_roles r WHERE r.id = NEW.role_id;
    INSERT INTO supplier_warehouse_access (user_id, supplier_id, mode)
    VALUES (NEW.user_id, NEW.tenant_id, CASE WHEN assigned_only THEN 'assigned' ELSE 'all' END) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS supplier_staff_warehouse_access ON tenant_user_roles;
CREATE TRIGGER supplier_staff_warehouse_access AFTER INSERT OR UPDATE OF tenant_id, tenant_type ON tenant_user_roles
  FOR EACH ROW EXECUTE FUNCTION initialize_supplier_warehouse_access();

CREATE OR REPLACE FUNCTION enforce_tenant_role_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant_roles r WHERE r.id = NEW.role_id
    AND r.tenant_id = NEW.tenant_id AND r.tenant_type = NEW.tenant_type) THEN
    RAISE EXCEPTION 'Role belongs to another tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tenant_role_scope ON tenant_user_roles;
CREATE TRIGGER tenant_role_scope BEFORE INSERT OR UPDATE ON tenant_user_roles
  FOR EACH ROW EXECUTE FUNCTION enforce_tenant_role_scope();

CREATE OR REPLACE FUNCTION enforce_order_item_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header_supplier UUID; product_supplier UUID;
BEGIN
  -- Supplier ownership is carried by order_item, not a customer_order.supplier_id column.
  -- Serialize line insertion so concurrent requests cannot create a mixed-supplier order.
  PERFORM id FROM customer_order WHERE id = NEW.order_id FOR UPDATE;
  SELECT supplier_id INTO header_supplier FROM order_item
    WHERE order_id = NEW.order_id AND id <> NEW.id LIMIT 1;
  SELECT supplier_id INTO product_supplier FROM product WHERE id = NEW.product_id;
  IF product_supplier IS DISTINCT FROM NEW.supplier_id OR
     (header_supplier IS NOT NULL AND header_supplier IS DISTINCT FROM NEW.supplier_id) THEN
    RAISE EXCEPTION 'Order item, product and supplier ownership do not agree' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supplier WHERE id = NEW.supplier_id
    AND COALESCE(is_branch_active, TRUE) FOR SHARE) THEN
    RAISE EXCEPTION 'Supplier branch is inactive' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_item_ownership ON order_item;
CREATE TRIGGER order_item_ownership BEFORE INSERT OR UPDATE OF product_id, supplier_id, order_id ON order_item
  FOR EACH ROW EXECUTE FUNCTION enforce_order_item_ownership();

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stock_count_consistent' AND conrelid = 'warehouse_inventory'::regclass) THEN
  ALTER TABLE warehouse_inventory ADD CONSTRAINT warehouse_stock_count_consistent CHECK (
    quantity_available IS NOT NULL AND quantity_reserved IS NOT NULL AND quantity_on_hand IS NOT NULL
    AND quantity_available + quantity_reserved <= quantity_on_hand
  ) NOT VALID;
END IF;

CREATE OR REPLACE FUNCTION enforce_org_role_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'org_user_roles' THEN
    SELECT EXISTS (SELECT 1 FROM org_roles r WHERE r.id = NEW.role_id AND r.organization_id = NEW.organization_id) INTO valid;
  ELSE
    SELECT EXISTS (SELECT 1 FROM restaurant_org_roles r WHERE r.id = NEW.role_id AND r.organization_id = NEW.organization_id) INTO valid;
  END IF;
  IF NOT valid THEN RAISE EXCEPTION 'Role belongs to another organization' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS supplier_org_role_scope ON org_user_roles;
CREATE TRIGGER supplier_org_role_scope BEFORE INSERT OR UPDATE ON org_user_roles FOR EACH ROW EXECUTE FUNCTION enforce_org_role_scope();
DROP TRIGGER IF EXISTS restaurant_org_role_scope ON restaurant_org_user_roles;
CREATE TRIGGER restaurant_org_role_scope BEFORE INSERT OR UPDATE ON restaurant_org_user_roles FOR EACH ROW EXECUTE FUNCTION enforce_org_role_scope();

CREATE OR REPLACE FUNCTION enforce_org_branch_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_org UUID;
BEGIN
  IF TG_TABLE_NAME = 'org_user_branch_access' THEN
    SELECT organization_id INTO actual_org FROM supplier WHERE id = NEW.supplier_id FOR SHARE;
  ELSE
    SELECT organization_id INTO actual_org FROM restaurant WHERE id = NEW.restaurant_id FOR SHARE;
  END IF;
  IF actual_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Branch access belongs to another organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS supplier_org_branch_scope ON org_user_branch_access;
CREATE TRIGGER supplier_org_branch_scope BEFORE INSERT OR UPDATE ON org_user_branch_access FOR EACH ROW EXECUTE FUNCTION enforce_org_branch_scope();
DROP TRIGGER IF EXISTS restaurant_org_branch_scope ON restaurant_org_user_branch_access;
CREATE TRIGGER restaurant_org_branch_scope BEFORE INSERT OR UPDATE ON restaurant_org_user_branch_access FOR EACH ROW EXECUTE FUNCTION enforce_org_branch_scope();

END $audit_migration$;
