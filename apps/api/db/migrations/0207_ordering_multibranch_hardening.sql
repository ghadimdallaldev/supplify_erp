-- Ordering hardening: canonical supplier organization ownership, immutable
-- delivery context, assignment provenance, and database-backed placement
-- idempotency. All additions are nullable/backwards compatible with legacy rows.

ALTER TABLE customer_order
  ADD COLUMN IF NOT EXISTS supplier_organization_id UUID
    REFERENCES supplier_organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_location_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS requested_delivery_method TEXT,
  ADD COLUMN IF NOT EXISTS requested_delivery_time TEXT;

CREATE INDEX IF NOT EXISTS idx_customer_order_supplier_org
  ON customer_order(supplier_organization_id, created_at DESC)
  WHERE supplier_organization_id IS NOT NULL;

ALTER TABLE order_warehouse_assignment
  ADD COLUMN IF NOT EXISTS assignment_source TEXT,
  ADD COLUMN IF NOT EXISTS assignment_reason JSONB,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Existing assignments predate the canonical order-level assignment contract.
-- Preserve that provenance; only assignments created after this migration
-- receive the automatic default.
UPDATE order_warehouse_assignment
SET assignment_source = 'legacy'
WHERE assignment_source IS NULL;

ALTER TABLE order_warehouse_assignment
  ALTER COLUMN assignment_source SET DEFAULT 'automatic',
  ALTER COLUMN assignment_source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_warehouse_assignment_source_check'
  ) THEN
    ALTER TABLE order_warehouse_assignment
      ADD CONSTRAINT order_warehouse_assignment_source_check
      CHECK (assignment_source IN ('automatic', 'manual', 'legacy'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_warehouse_assignment_active_warehouse
  ON order_warehouse_assignment(warehouse_id, status)
  WHERE status NOT IN ('failed', 'delivered');

CREATE TABLE IF NOT EXISTS order_placement_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (restaurant_id, idempotency_key),
  CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CHECK (status IN ('IN_PROGRESS', 'SUCCEEDED'))
);

CREATE INDEX IF NOT EXISTS idx_order_placement_idempotency_cleanup
  ON order_placement_idempotency(created_at);

COMMENT ON COLUMN customer_order.supplier_organization_id IS
  'Canonical supplier organization for new orders; nullable for legacy orders.';
COMMENT ON COLUMN customer_order.delivery_location_snapshot IS
  'Immutable delivery location context captured when the order is created.';
COMMENT ON TABLE order_placement_idempotency IS
  'Unique restaurant-scoped order placement keys and replayable successful responses.';
-- Backfill only unambiguous historical orders. Multi-supplier legacy orders
-- remain NULL because their ownership cannot be inferred safely.
UPDATE customer_order co
SET supplier_organization_id = s.organization_id
FROM (
  -- PG has no min(uuid); pick the sole supplier_id (HAVING guarantees one distinct).
  SELECT order_id, (array_agg(supplier_id))[1] AS supplier_id
  FROM order_item
  GROUP BY order_id
  HAVING COUNT(DISTINCT supplier_id) = 1
) oi
JOIN supplier s ON s.id = oi.supplier_id
WHERE co.id = oi.order_id AND co.supplier_organization_id IS NULL;

-- Transfer is a capability in the existing RBAC model, not a new role hierarchy.
INSERT INTO permission (code, name, domain, description)
VALUES (
  'FULFILLMENT_TRANSFER',
  'Transfer fulfillment',
  'FULFILLMENT',
  'Reassign an order to an eligible fulfillment location within the authorized supplier scope'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
JOIN permission p ON p.code = 'FULFILLMENT_TRANSFER'
WHERE r.code IN ('SUPPLIER_OWNER', 'SUPPLIER_MANAGER')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tenant_role_permissions (role_id, permission)
SELECT tr.id, 'FULFILLMENT_TRANSFER'
FROM tenant_roles tr
WHERE tr.tenant_type = 'SUPPLIER'
  AND tr.is_system = true
  AND tr.name IN ('Owner', 'Supplier Manager', 'Manager', 'Warehouse Manager')
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO org_role_permissions (role_id, permission, branch_scope)
SELECT r.id, 'FULFILLMENT_TRANSFER',
  CASE WHEN r.name = 'Regional Manager' THEN 'assigned'::varchar ELSE 'all'::varchar END
FROM org_roles r
WHERE r.is_system = true
  AND r.name IN ('Org Owner', 'Org Manager', 'Regional Manager')
ON CONFLICT (role_id, permission) DO NOTHING;
