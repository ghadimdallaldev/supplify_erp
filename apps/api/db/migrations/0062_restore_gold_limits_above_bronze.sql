-- Migration 0057 reduced Gold numeric caps for "proportionality" but left Bronze unchanged,
-- which made Bronze higher than Gold on several meters (orders, SKUs, storage). Tiers
-- must be strictly ordered: Free < Bronze < Gold < Platinum on comparable limits.

UPDATE subscription_plan
SET
  limits = '{
    "branches": 3,
    "users": 10,
    "orders_per_day": 500,
    "suppliers_per_restaurant": -1,
    "restaurant_inventory_skus": 10000,
    "chats_per_day": 200,
    "storage_mb": 5000
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  limits = '{
    "warehouses": 3,
    "users": 10,
    "supplier_products_skus": 10000,
    "chats_per_day": 200,
    "storage_mb": 5000
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'SUPPLIER';
