-- Migration: 0092_restaurant_tenant_catalog_view.sql
-- Restaurant tenant roles (Owner/Manager/Purchaser/Viewer) need CATALOG_VIEW to browse supplier catalog when placing orders.

INSERT INTO tenant_role_permissions (role_id, permission)
SELECT tr.id, 'CATALOG_VIEW'
FROM tenant_roles tr
WHERE tr.tenant_type = 'RESTAURANT'
  AND tr.is_system = true
  AND tr.name IN ('Owner', 'Manager', 'Purchaser', 'Viewer')
ON CONFLICT (role_id, permission) DO NOTHING;
