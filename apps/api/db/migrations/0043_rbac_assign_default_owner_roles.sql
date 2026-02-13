-- Migration: 0043_rbac_assign_default_owner_roles.sql
-- Assign RESTAURANT_OWNER / SUPPLIER_OWNER to users who are the contact_email for that tenant.
-- Idempotent: uses ON CONFLICT DO NOTHING on user_role.

INSERT INTO user_role (user_id, role_id, tenant_id, tenant_type)
SELECT u.id, r.id, rest.id, 'RESTAURANT'
FROM app_user u
JOIN restaurant rest ON rest.contact_email = u.email
JOIN role r ON r.code = 'RESTAURANT_OWNER' AND r.tenant_type = 'RESTAURANT'
WHERE u.role = 'RESTAURANT'
ON CONFLICT (user_id, role_id, tenant_id, tenant_type) DO NOTHING;

INSERT INTO user_role (user_id, role_id, tenant_id, tenant_type)
SELECT u.id, r.id, sup.id, 'SUPPLIER'
FROM app_user u
JOIN supplier sup ON sup.contact_email = u.email
JOIN role r ON r.code = 'SUPPLIER_OWNER' AND r.tenant_type = 'SUPPLIER'
WHERE u.role = 'SUPPLIER'
ON CONFLICT (user_id, role_id, tenant_id, tenant_type) DO NOTHING;

-- Admins: assign SUPER_ADMIN to existing ADMIN users (global admin, no tenant_id)
INSERT INTO user_role (user_id, role_id, tenant_id, tenant_type)
SELECT u.id, r.id, NULL, 'ADMIN'
FROM app_user u
JOIN role r ON r.code = 'SUPER_ADMIN' AND r.tenant_type = 'ADMIN'
WHERE u.role = 'ADMIN'
ON CONFLICT (user_id, role_id, tenant_id, tenant_type) DO NOTHING;
