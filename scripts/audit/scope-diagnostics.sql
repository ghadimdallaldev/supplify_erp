-- Read-only diagnostics. Samples contain identifiers only; ownership is never inferred.
SELECT 'warehouse_owner_conflict' AS finding, id::text AS entity_id
FROM warehouse WHERE COALESCE(tenant_id, supplier_id) IS NULL
  OR (tenant_id IS NOT NULL AND supplier_id IS NOT NULL AND tenant_id <> supplier_id);
SELECT 'foreign_warehouse_product' AS finding, wi.id::text AS entity_id
FROM warehouse_inventory wi JOIN warehouse w ON w.id = wi.warehouse_id
JOIN product p ON p.id = wi.product_id WHERE p.supplier_id IS DISTINCT FROM COALESCE(w.tenant_id, w.supplier_id);
SELECT 'invalid_stock_balance' AS finding, id::text AS entity_id FROM warehouse_inventory
WHERE quantity_available IS NULL OR quantity_reserved IS NULL OR quantity_on_hand IS NULL
  OR quantity_available < 0 OR quantity_reserved < 0 OR quantity_on_hand < 0
  OR quantity_available + quantity_reserved > quantity_on_hand;
SELECT 'foreign_named_role' AS finding, ur.id::text AS entity_id
FROM tenant_user_roles ur JOIN tenant_roles r ON r.id = ur.role_id
WHERE r.tenant_id IS DISTINCT FROM ur.tenant_id OR r.tenant_type IS DISTINCT FROM ur.tenant_type;
SELECT 'foreign_org_role' AS finding, ur.id::text AS entity_id
FROM org_user_roles ur JOIN org_roles r ON r.id = ur.role_id
WHERE r.organization_id IS DISTINCT FROM ur.organization_id;
SELECT 'foreign_restaurant_org_role' AS finding, ur.id::text AS entity_id
FROM restaurant_org_user_roles ur JOIN restaurant_org_roles r ON r.id = ur.role_id
WHERE r.organization_id IS DISTINCT FROM ur.organization_id;
SELECT 'inactive_warehouse_active_assignment' AS finding, a.id::text AS entity_id
FROM order_warehouse_assignment a JOIN warehouse w ON w.id = a.warehouse_id
WHERE w.is_active IS NOT TRUE AND a.status NOT IN ('delivered', 'failed', 'superseded');
SELECT 'foreign_order_item_product' AS finding, oi.id::text AS entity_id
FROM order_item oi JOIN product p ON p.id = oi.product_id
WHERE p.supplier_id IS DISTINCT FROM oi.supplier_id;
SELECT 'foreign_order_delivery_location' AS finding, co.id::text AS entity_id
FROM customer_order co JOIN branch b ON b.id = co.branch_id WHERE b.tenant_id IS DISTINCT FROM co.restaurant_id;
SELECT 'foreign_order_warehouse' AS finding, a.id::text AS entity_id
FROM order_warehouse_assignment a JOIN warehouse w ON w.id = a.warehouse_id
WHERE EXISTS (SELECT 1 FROM order_item oi WHERE oi.order_id = a.order_id
  AND (a.order_item_id IS NULL OR oi.id = a.order_item_id)
  AND oi.supplier_id IS DISTINCT FROM COALESCE(w.tenant_id, w.supplier_id));
SELECT 'dangling_workspace_home' AS finding, m.id::text AS entity_id FROM user_workspace_membership m
LEFT JOIN supplier s ON s.id = m.home_tenant_id AND m.workspace_type = 'SUPPLIER'
LEFT JOIN restaurant r ON r.id = m.home_tenant_id AND m.workspace_type = 'RESTAURANT'
WHERE m.status = 'active' AND COALESCE(s.id, r.id) IS NULL;
SELECT 'unsafe_legacy_link' AS finding, id::text AS entity_id FROM tenant_account_link
WHERE parent_tenant_id = child_tenant_id OR parent_tenant_type <> child_tenant_type;
