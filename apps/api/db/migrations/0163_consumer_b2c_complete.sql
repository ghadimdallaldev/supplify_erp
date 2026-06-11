-- Migration: 0163_consumer_b2c_complete.sql
-- Phase 4: Consumer B2C auth, loyalty redeem columns, order status lifecycle

-- ---------------------------------------------------------------------------
-- consumer_member: username/password auth per restaurant
-- ---------------------------------------------------------------------------

ALTER TABLE consumer_member
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS welcome_bonus_awarded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE consumer_member
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE consumer_member
  DROP CONSTRAINT IF EXISTS consumer_member_restaurant_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumer_member_restaurant_email
  ON consumer_member (restaurant_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumer_member_restaurant_username
  ON consumer_member (restaurant_id, lower(username))
  WHERE username IS NOT NULL;

-- ---------------------------------------------------------------------------
-- consumer_order: loyalty redeem + status lifecycle
-- ---------------------------------------------------------------------------

ALTER TABLE consumer_order
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0
    CHECK (loyalty_points_redeemed >= 0),
  ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (loyalty_discount_amount >= 0);

UPDATE consumer_order
SET status = CASE status
  WHEN 'PENDING' THEN 'RECEIVED'
  WHEN 'CONFIRMED' THEN 'RECEIVED'
  WHEN 'PREPARING' THEN 'PREPARING'
  WHEN 'READY' THEN 'SHIPPED'
  WHEN 'COMPLETED' THEN 'DELIVERED'
  WHEN 'CANCELLED' THEN 'CANCELLED'
  ELSE 'RECEIVED'
END
WHERE status NOT IN ('RECEIVED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

UPDATE consumer_order_status_history
SET status = CASE status
  WHEN 'PENDING' THEN 'RECEIVED'
  WHEN 'CONFIRMED' THEN 'RECEIVED'
  WHEN 'PREPARING' THEN 'PREPARING'
  WHEN 'READY' THEN 'SHIPPED'
  WHEN 'COMPLETED' THEN 'DELIVERED'
  WHEN 'CANCELLED' THEN 'CANCELLED'
  ELSE status
END
WHERE status NOT IN ('RECEIVED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

ALTER TABLE consumer_order
  DROP CONSTRAINT IF EXISTS consumer_order_status_check;

ALTER TABLE consumer_order
  ADD CONSTRAINT consumer_order_status_check
  CHECK (status IN ('RECEIVED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'));

ALTER TABLE consumer_order
  ALTER COLUMN status SET DEFAULT 'RECEIVED';

-- ---------------------------------------------------------------------------
-- consumer_loyalty_program: welcome bonus + redeem cap
-- ---------------------------------------------------------------------------

ALTER TABLE consumer_loyalty_program
  ADD COLUMN IF NOT EXISTS welcome_bonus_points INTEGER NOT NULL DEFAULT 0
    CHECK (welcome_bonus_points >= 0),
  ADD COLUMN IF NOT EXISTS max_redeem_percent NUMERIC(5, 2) NOT NULL DEFAULT 50
    CHECK (max_redeem_percent >= 0 AND max_redeem_percent <= 100);
