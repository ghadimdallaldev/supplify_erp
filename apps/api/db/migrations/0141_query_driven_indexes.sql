-- Migration: 0141_query_driven_indexes.sql
-- Query-driven indexes from API performance audit (auth, RBAC, orders, chat, audit).

-- Auth / tenant context: workspace assignment lookup on every authenticated request
CREATE INDEX IF NOT EXISTS idx_tenant_user_roles_user_type_assigned
  ON tenant_user_roles (user_id, tenant_type, assigned_at DESC);

-- Tenant resolution fallback by contact email (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_supplier_contact_email_norm
  ON supplier (LOWER(TRIM(contact_email)))
  WHERE contact_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_contact_email_norm
  ON restaurant (LOWER(TRIM(contact_email)))
  WHERE contact_email IS NOT NULL;

-- Login user sync: case-insensitive email lookup alongside keycloak_sub
CREATE INDEX IF NOT EXISTS idx_app_user_email_lower
  ON app_user (LOWER(email));

-- Restaurant orders list filtered by status
CREATE INDEX IF NOT EXISTS idx_customer_order_restaurant_status_created
  ON customer_order (restaurant_id, status, created_at DESC);

-- Subscription daily order limit metering (UTC calendar day; timestamptz::date is not immutable)
CREATE INDEX IF NOT EXISTS idx_customer_order_restaurant_placed_day
  ON customer_order (restaurant_id, ((placed_at AT TIME ZONE 'UTC')::date))
  WHERE status = 'PLACED' AND placed_at IS NOT NULL;

-- Fulfillment dispatch: EXISTS probe on order_id + warehouse_id
CREATE INDEX IF NOT EXISTS idx_order_warehouse_assignment_order_warehouse
  ON order_warehouse_assignment (order_id, warehouse_id);

-- Tenant audit log listing
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON audit_logs (tenant_type, tenant_id, created_at DESC);

-- Chat inbox sort by last message
CREATE INDEX IF NOT EXISTS idx_conversation_supplier_last_message
  ON conversation (supplier_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversation_restaurant_last_message
  ON conversation (restaurant_id, last_message_at DESC NULLS LAST);

-- Restaurant inventory movement history
CREATE INDEX IF NOT EXISTS idx_inventory_movement_restaurant_created
  ON inventory_movement_log (restaurant_id, created_at DESC);

-- RBAC role list (active roles only)
CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant_active
  ON tenant_roles (tenant_id, tenant_type, is_system DESC, name)
  WHERE is_active = true;

-- Product import SKU dedup within supplier
CREATE INDEX IF NOT EXISTS idx_product_supplier_sku_lower
  ON product (supplier_id, lower(sku))
  WHERE sku IS NOT NULL;

-- Orders calendar with branch filter
CREATE INDEX IF NOT EXISTS idx_customer_order_restaurant_branch_coalesce
  ON customer_order (restaurant_id, branch_id, COALESCE(placed_at, created_at) DESC)
  WHERE branch_id IS NOT NULL;
