-- Live vs preorder windows for consumer (B2C) ordering per branch

ALTER TABLE branch_fulfillment_config
  ADD COLUMN IF NOT EXISTS live_order_start TEXT NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS live_order_end TEXT NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS allow_preorders_outside_live_hours BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN branch_fulfillment_config.live_order_start IS 'HH:mm when same-day (live) ordering opens, e.g. 12:00';
COMMENT ON COLUMN branch_fulfillment_config.live_order_end IS 'HH:mm when live ordering closes; 00:00 means until midnight';
COMMENT ON COLUMN branch_fulfillment_config.allow_preorders_outside_live_hours IS 'When false, ordering link accepts no orders outside the live window';
