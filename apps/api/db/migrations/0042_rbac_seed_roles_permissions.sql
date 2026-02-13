-- Migration: 0042_rbac_seed_roles_permissions.sql
-- Seed default roles, permissions, and role->permission mappings.
-- Does not assign users to roles (that is done when inviting/linking or via backfill script).

-- ========================================
-- PERMISSIONS (grouped by domain)
-- ========================================
INSERT INTO permission (code, name, domain, description) VALUES
  ('ORDERS_VIEW', 'View orders', 'ORDERS', 'View order list and details'),
  ('ORDERS_CREATE', 'Create orders', 'ORDERS', 'Create and place orders'),
  ('ORDERS_EDIT', 'Edit orders', 'ORDERS', 'Update or cancel orders'),
  ('ORDERS_MANAGE', 'Full order management', 'ORDERS', 'All order actions'),
  ('INVOICES_VIEW', 'View invoices', 'INVOICES', 'View invoice list and details'),
  ('INVOICES_CREATE', 'Create invoices', 'INVOICES', 'Create and send invoices'),
  ('INVOICES_EDIT', 'Edit invoices', 'INVOICES', 'Update invoices'),
  ('INVOICES_MANAGE', 'Full invoice management', 'INVOICES', 'All invoice actions'),
  ('INVENTORY_VIEW', 'View inventory', 'INVENTORY', 'View inventory levels'),
  ('INVENTORY_EDIT', 'Edit inventory', 'INVENTORY', 'Adjust stock and counts'),
  ('INVENTORY_MANAGE', 'Full inventory management', 'INVENTORY', 'All inventory actions'),
  ('RESERVATIONS_VIEW', 'View reservations', 'RESERVATIONS', 'View reservation list'),
  ('RESERVATIONS_CREATE', 'Create reservations', 'RESERVATIONS', 'Create reservations'),
  ('RESERVATIONS_EDIT', 'Edit reservations', 'RESERVATIONS', 'Update or cancel'),
  ('RESERVATIONS_MANAGE', 'Full reservation management', 'RESERVATIONS', 'All reservation actions'),
  ('STAFF_VIEW', 'View staff', 'STAFF', 'View staff list and details'),
  ('STAFF_INVITE', 'Invite staff', 'STAFF', 'Invite and add team members'),
  ('STAFF_EDIT', 'Edit staff', 'STAFF', 'Update roles and details'),
  ('STAFF_MANAGE', 'Full staff management', 'STAFF', 'All staff actions'),
  ('SETTINGS_VIEW', 'View settings', 'SETTINGS', 'View tenant settings'),
  ('SETTINGS_EDIT', 'Edit settings', 'SETTINGS', 'Change tenant settings'),
  ('SETTINGS_MANAGE', 'Full settings management', 'SETTINGS', 'All settings actions'),
  ('CHAT_VIEW', 'View chat', 'CHAT', 'View conversations'),
  ('CHAT_SEND', 'Send messages', 'CHAT', 'Send and reply in chat'),
  ('CHAT_MANAGE', 'Full chat access', 'CHAT', 'All chat actions'),
  ('SUBSCRIPTIONS_VIEW', 'View subscription', 'SUBSCRIPTIONS', 'View plan and usage'),
  ('SUBSCRIPTIONS_MANAGE', 'Manage subscription', 'SUBSCRIPTIONS', 'Change plan and billing'),
  ('CATALOG_VIEW', 'View catalog', 'CATALOG', 'View products and catalog'),
  ('CATALOG_EDIT', 'Edit catalog', 'CATALOG', 'Add or edit products'),
  ('CATALOG_MANAGE', 'Full catalog management', 'CATALOG', 'All catalog actions'),
  ('WAREHOUSES_VIEW', 'View warehouses', 'WAREHOUSES', 'View warehouse list'),
  ('WAREHOUSES_EDIT', 'Edit warehouses', 'WAREHOUSES', 'Add or edit warehouses'),
  ('WAREHOUSES_MANAGE', 'Full warehouse management', 'WAREHOUSES', 'All warehouse actions'),
  ('ADMIN_ACCESS', 'Admin access', 'ADMIN', 'Access admin dashboard'),
  ('ADMIN_TENANTS', 'Manage tenants', 'ADMIN', 'View and manage tenants'),
  ('ADMIN_PLANS', 'Manage plans', 'ADMIN', 'Manage subscription plans'),
  ('ADMIN_SUPPORT', 'Support tools', 'ADMIN', 'Chat join, impersonation, support'),
  ('ADMIN_FINANCE', 'Finance admin', 'ADMIN', 'Financial overview and overrides'),
  ('ADMIN_GROWTH', 'Growth admin', 'ADMIN', 'Analytics and growth tools')
ON CONFLICT (code) DO NOTHING;

-- ========================================
-- ROLES
-- ========================================
INSERT INTO role (id, code, name, tenant_type, description) VALUES
  ('a0000001-0001-4000-8000-000000000001', 'RESTAURANT_OWNER', 'Restaurant Owner', 'RESTAURANT', 'Full access to restaurant tenant'),
  ('a0000001-0001-4000-8000-000000000002', 'RESTAURANT_MANAGER', 'Restaurant Manager', 'RESTAURANT', 'Manage operations, staff, and orders'),
  ('a0000001-0001-4000-8000-000000000003', 'RESTAURANT_STAFF', 'Restaurant Staff', 'RESTAURANT', 'Day-to-day operations'),
  ('a0000002-0001-4000-8000-000000000001', 'SUPPLIER_OWNER', 'Supplier Owner', 'SUPPLIER', 'Full access to supplier tenant'),
  ('a0000002-0001-4000-8000-000000000002', 'SUPPLIER_MANAGER', 'Supplier Manager', 'SUPPLIER', 'Manage catalog, orders, fulfillment'),
  ('a0000002-0001-4000-8000-000000000003', 'SUPPLIER_STAFF', 'Supplier Staff', 'SUPPLIER', 'Fulfillment and support'),
  ('a0000003-0001-4000-8000-000000000001', 'SUPER_ADMIN', 'Super Admin', 'ADMIN', 'Full platform access'),
  ('a0000003-0001-4000-8000-000000000002', 'SUPPORT_ADMIN', 'Support Admin', 'ADMIN', 'Support and impersonation'),
  ('a0000003-0001-4000-8000-000000000003', 'FINANCE_ADMIN', 'Finance Admin', 'ADMIN', 'Financial and billing'),
  ('a0000003-0001-4000-8000-000000000004', 'GROWTH_ADMIN', 'Growth Admin', 'ADMIN', 'Analytics and growth')
ON CONFLICT (code) DO NOTHING;

-- ========================================
-- ROLE -> PERMISSION MAPPINGS
-- ========================================
-- Restaurant Owner: all restaurant permissions
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'RESTAURANT_OWNER'
  AND p.domain IN ('ORDERS', 'INVOICES', 'INVENTORY', 'RESERVATIONS', 'STAFF', 'SETTINGS', 'CHAT', 'SUBSCRIPTIONS')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Restaurant Manager: all except SETTINGS_MANAGE and SUBSCRIPTIONS_MANAGE
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'RESTAURANT_MANAGER'
  AND p.code IN (
    'ORDERS_VIEW','ORDERS_CREATE','ORDERS_EDIT','ORDERS_MANAGE',
    'INVOICES_VIEW','INVOICES_CREATE','INVOICES_EDIT','INVOICES_MANAGE',
    'INVENTORY_VIEW','INVENTORY_EDIT','INVENTORY_MANAGE',
    'RESERVATIONS_VIEW','RESERVATIONS_CREATE','RESERVATIONS_EDIT','RESERVATIONS_MANAGE',
    'STAFF_VIEW','STAFF_INVITE','STAFF_EDIT','STAFF_MANAGE',
    'SETTINGS_VIEW','SETTINGS_EDIT',
    'CHAT_VIEW','CHAT_SEND','CHAT_MANAGE',
    'SUBSCRIPTIONS_VIEW'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Restaurant Staff: view + limited edit (orders, inventory, chat)
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'RESTAURANT_STAFF'
  AND p.code IN (
    'ORDERS_VIEW','ORDERS_CREATE','ORDERS_EDIT',
    'INVOICES_VIEW',
    'INVENTORY_VIEW','INVENTORY_EDIT',
    'RESERVATIONS_VIEW','RESERVATIONS_CREATE','RESERVATIONS_EDIT',
    'STAFF_VIEW',
    'SETTINGS_VIEW',
    'CHAT_VIEW','CHAT_SEND'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Supplier Owner: all supplier permissions
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'SUPPLIER_OWNER'
  AND p.domain IN ('ORDERS', 'INVOICES', 'INVENTORY', 'CATALOG', 'WAREHOUSES', 'STAFF', 'SETTINGS', 'CHAT', 'SUBSCRIPTIONS')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Supplier Manager: all except SETTINGS_MANAGE and SUBSCRIPTIONS_MANAGE
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'SUPPLIER_MANAGER'
  AND p.code IN (
    'ORDERS_VIEW','ORDERS_EDIT','ORDERS_MANAGE',
    'INVOICES_VIEW','INVOICES_CREATE','INVOICES_EDIT','INVOICES_MANAGE',
    'INVENTORY_VIEW','INVENTORY_EDIT','INVENTORY_MANAGE',
    'CATALOG_VIEW','CATALOG_EDIT','CATALOG_MANAGE',
    'WAREHOUSES_VIEW','WAREHOUSES_EDIT','WAREHOUSES_MANAGE',
    'STAFF_VIEW','STAFF_INVITE','STAFF_EDIT','STAFF_MANAGE',
    'SETTINGS_VIEW','SETTINGS_EDIT',
    'CHAT_VIEW','CHAT_SEND','CHAT_MANAGE',
    'SUBSCRIPTIONS_VIEW'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Supplier Staff: view + limited edit
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'SUPPLIER_STAFF'
  AND p.code IN (
    'ORDERS_VIEW','ORDERS_EDIT',
    'INVOICES_VIEW',
    'INVENTORY_VIEW','INVENTORY_EDIT',
    'CATALOG_VIEW',
    'WAREHOUSES_VIEW',
    'STAFF_VIEW',
    'SETTINGS_VIEW',
    'CHAT_VIEW','CHAT_SEND'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Super Admin: all admin permissions
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'SUPER_ADMIN' AND p.domain = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Support Admin: ADMIN_ACCESS, ADMIN_TENANTS, ADMIN_SUPPORT
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'SUPPORT_ADMIN'
  AND p.code IN ('ADMIN_ACCESS', 'ADMIN_TENANTS', 'ADMIN_SUPPORT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Finance Admin: ADMIN_ACCESS, ADMIN_TENANTS, ADMIN_FINANCE
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'FINANCE_ADMIN'
  AND p.code IN ('ADMIN_ACCESS', 'ADMIN_TENANTS', 'ADMIN_FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Growth Admin: ADMIN_ACCESS, ADMIN_GROWTH
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'GROWTH_ADMIN'
  AND p.code IN ('ADMIN_ACCESS', 'ADMIN_GROWTH')
ON CONFLICT (role_id, permission_id) DO NOTHING;
