-- Lower Gold plan limits so upgrades feel proportional (not enterprise-scale on mid tier).

UPDATE subscription_plan
SET
  limits = '{
    "branches": 2,
    "users": 5,
    "orders_per_day": 50,
    "suppliers_per_restaurant": 10,
    "restaurant_inventory_skus": 500,
    "chats_per_day": 50,
    "storage_mb": 500
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  limits = '{
    "warehouses": 2,
    "users": 5,
    "supplier_products_skus": 500,
    "chats_per_day": 50,
    "storage_mb": 500
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'SUPPLIER';
