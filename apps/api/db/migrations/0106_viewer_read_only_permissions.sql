-- Viewer / Org Viewer (RESTAURANT + SUPPLIER tenants): strip write permissions.
-- Full *_VIEW set is re-applied from role-matrix via ensureTenantSystemRoles on API requests.

DELETE FROM tenant_role_permissions trp
USING tenant_roles tr
WHERE trp.role_id = tr.id
  AND tr.is_system = true
  AND tr.name = 'Viewer'
  AND trp.permission ~ '_(CREATE|EDIT|SEND|MANAGE)$';

DELETE FROM restaurant_org_role_permissions rorp
USING restaurant_org_roles ror
WHERE rorp.role_id = ror.id
  AND ror.is_system = true
  AND ror.name = 'Org Viewer'
  AND rorp.permission ~ '_(CREATE|EDIT|SEND|MANAGE)$';

DELETE FROM org_role_permissions orp
USING org_roles orgr
WHERE orp.role_id = orgr.id
  AND orgr.is_system = true
  AND orgr.name = 'Org Viewer'
  AND orp.permission ~ '_(CREATE|EDIT|SEND|MANAGE)$';
