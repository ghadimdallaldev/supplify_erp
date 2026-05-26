-- Sync system role display names and ensure Promotions Manager exists (permissions synced by API seed).

UPDATE tenant_roles
SET name = 'Restaurant Manager',
    description = 'Daily operations: orders, receiving, disputes; no billing/roles admin'
WHERE tenant_type = 'RESTAURANT' AND is_system = true AND name = 'Manager';

UPDATE tenant_roles
SET name = 'Receiving Staff',
    description = 'Receive deliveries and open receiving disputes'
WHERE tenant_type = 'RESTAURANT' AND is_system = true AND name = 'Inventory Clerk';

UPDATE tenant_roles
SET name = 'Supplier Manager',
    description = 'Orders, fulfillment, catalog; no billing/roles admin'
WHERE tenant_type = 'SUPPLIER' AND is_system = true AND name = 'Manager';

UPDATE tenant_roles
SET name = 'Order Fulfillment Staff',
    description = 'Fulfillment updates only; cannot decline orders'
WHERE tenant_type = 'SUPPLIER' AND is_system = true AND name = 'Warehouse Staff';
