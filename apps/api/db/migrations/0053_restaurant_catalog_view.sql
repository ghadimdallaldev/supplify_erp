-- Migration: 0053_restaurant_catalog_view.sql
-- Grant CATALOG_VIEW to restaurant roles so GET /api/products (list, categories, tags) returns 200 for restaurant users.

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'RESTAURANT_OWNER' AND p.code = 'CATALOG_VIEW'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'RESTAURANT_MANAGER' AND p.code = 'CATALOG_VIEW'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'RESTAURANT_STAFF' AND p.code = 'CATALOG_VIEW'
ON CONFLICT (role_id, permission_id) DO NOTHING;
