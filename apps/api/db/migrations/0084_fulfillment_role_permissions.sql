-- Backfill FULFILLMENT_* on supplier branch and org system roles (routes require FULFILLMENT_VIEW)

INSERT INTO tenant_role_permissions (role_id, permission)
SELECT tr.id, 'FULFILLMENT_VIEW'
FROM tenant_roles tr
WHERE tr.tenant_type = 'SUPPLIER'
  AND tr.is_system = true
  AND tr.name IN ('Owner', 'Manager', 'Warehouse Staff', 'Sales Rep', 'Viewer')
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO tenant_role_permissions (role_id, permission)
SELECT tr.id, 'FULFILLMENT_MANAGE'
FROM tenant_roles tr
WHERE tr.tenant_type = 'SUPPLIER'
  AND tr.is_system = true
  AND tr.name IN ('Owner', 'Manager', 'Warehouse Staff')
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO org_role_permissions (role_id, permission, branch_scope)
SELECT r.id, 'FULFILLMENT_VIEW',
  CASE WHEN r.name = 'Regional Manager' THEN 'assigned'::varchar ELSE 'all'::varchar END
FROM org_roles r
WHERE r.is_system = true
  AND r.name IN ('Org Owner', 'Org Manager', 'Regional Manager', 'Org Viewer')
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO org_role_permissions (role_id, permission, branch_scope)
SELECT r.id, 'FULFILLMENT_MANAGE',
  CASE WHEN r.name = 'Regional Manager' THEN 'assigned'::varchar ELSE 'all'::varchar END
FROM org_roles r
WHERE r.is_system = true
  AND r.name IN ('Org Owner', 'Org Manager', 'Regional Manager')
ON CONFLICT (role_id, permission) DO NOTHING;
