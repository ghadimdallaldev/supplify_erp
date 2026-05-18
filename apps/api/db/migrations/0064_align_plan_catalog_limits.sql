-- Align subscription_plan limits with canonical tier matrix (UI + enforcement).
-- Fixes Gold restaurant_inventory_skus / supplier_products_skus (was 10000).

-- RESTAURANT — Bronze
UPDATE subscription_plan
SET
  limits = '{
    "branches": 2,
    "users": 3,
    "orders_per_day": 20,
    "suppliers_per_restaurant": 10,
    "restaurant_inventory_skus": 1000,
    "chats_per_day": 50,
    "storage_mb": 1000
  }'::jsonb,
  updated_at = now()
WHERE code = 'bronze' AND tenant_type = 'RESTAURANT';

-- RESTAURANT — Gold
UPDATE subscription_plan
SET
  limits = '{
    "branches": 3,
    "users": 10,
    "orders_per_day": 50,
    "suppliers_per_restaurant": -1,
    "restaurant_inventory_skus": 1000,
    "chats_per_day": 200,
    "storage_mb": 5000
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'RESTAURANT';

-- SUPPLIER — Bronze
UPDATE subscription_plan
SET
  limits = '{
    "warehouses": 1,
    "users": 3,
    "supplier_products_skus": 1000,
    "chats_per_day": 50,
    "storage_mb": 1000
  }'::jsonb,
  updated_at = now()
WHERE code = 'bronze' AND tenant_type = 'SUPPLIER';

-- SUPPLIER — Gold
UPDATE subscription_plan
SET
  limits = '{
    "warehouses": 3,
    "users": 10,
    "supplier_products_skus": 1000,
    "chats_per_day": 200,
    "storage_mb": 5000
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'SUPPLIER';
