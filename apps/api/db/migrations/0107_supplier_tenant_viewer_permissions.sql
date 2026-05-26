-- Ensure supplier Viewer system roles have catalog/inventory read access (parity with restaurant Viewer / 0092).

INSERT INTO tenant_role_permissions (role_id, permission)
SELECT tr.id, perm.code
FROM tenant_roles tr
CROSS JOIN (
  VALUES
    ('CATALOG_VIEW'),
    ('INVENTORY_VIEW'),
    ('FULFILLMENT_VIEW'),
    ('WAREHOUSES_VIEW'),
    ('PROMOTIONS_VIEW'),
    ('RECEIVING_VIEW'),
    ('SETTINGS_VIEW'),
    ('STAFF_VIEW'),
    ('SUBSCRIPTIONS_VIEW'),
    ('PAYMENTS_VIEW'),
    ('CHAT_VIEW')
) AS perm(code)
WHERE tr.tenant_type = 'SUPPLIER'
  AND tr.is_system = true
  AND tr.name = 'Viewer'
ON CONFLICT (role_id, permission) DO NOTHING;
