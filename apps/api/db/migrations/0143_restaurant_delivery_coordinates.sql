-- Delivery destination coordinates for ETA and driver navigation.
-- branch: per operational location (customer_order.branch_id)
-- restaurant: tenant-level fallback when branch_id is null or branch coords unset

ALTER TABLE branch
  ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_location_label TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address_notes TEXT;

ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_location_label TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address_notes TEXT;

COMMENT ON COLUMN branch.delivery_latitude IS 'GPS latitude for delivery drop-off at this branch';
COMMENT ON COLUMN branch.delivery_longitude IS 'GPS longitude for delivery drop-off at this branch';
COMMENT ON COLUMN restaurant.delivery_latitude IS 'Default GPS latitude when order has no branch or branch coords';
