-- Supplier public sales, global consumer accounts, and public order ownership.

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user
  ADD CONSTRAINT app_user_role_check
  CHECK (role IN ('ADMIN', 'SUPPLIER', 'RESTAURANT', 'CONSUMER', 'PENDING', 'STAFF_PORTAL'));

ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_type_check;
ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_user_type_check
  CHECK (user_type IN ('SUPPLIER', 'RESTAURANT', 'CONSUMER', 'ADMIN'));

CREATE TABLE IF NOT EXISTS consumer_profile (
  app_user_id UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  phone TEXT,
  notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consumer_address (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  label TEXT,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  coords JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumer_address_owner
  ON consumer_address(app_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumer_address_one_default
  ON consumer_address(app_user_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS supplier_public_sales_config (
  supplier_id UUID PRIMARY KEY REFERENCES supplier(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  payment_methods TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  bank_transfer_instructions TEXT,
  pickup_warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_public_sales_payment_methods_check CHECK (
    payment_methods <@ ARRAY['CASH_ON_DELIVERY', 'CASH_ON_PICKUP', 'BANK_TRANSFER']::text[]
  )
);

CREATE TABLE IF NOT EXISTS supplier_public_delivery_warehouse (
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, warehouse_id)
);

ALTER TABLE customer_order
  ALTER COLUMN restaurant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'RESTAURANT',
  ADD COLUMN IF NOT EXISTS consumer_user_id UUID REFERENCES app_user(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS customer_contact_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS checkout_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(14,3) NOT NULL DEFAULT 0;

UPDATE customer_order
SET customer_type = 'RESTAURANT',
    subtotal_amount = total_amount,
    delivery_fee = 0
WHERE restaurant_id IS NOT NULL;

ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_customer_type_check;
ALTER TABLE customer_order
  ADD CONSTRAINT customer_order_customer_type_check
  CHECK (customer_type IN ('RESTAURANT', 'CONSUMER', 'GUEST'));

ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_owner_check;
ALTER TABLE customer_order
  ADD CONSTRAINT customer_order_owner_check CHECK (
    (customer_type = 'RESTAURANT' AND restaurant_id IS NOT NULL AND consumer_user_id IS NULL)
    OR (customer_type = 'CONSUMER' AND restaurant_id IS NULL AND consumer_user_id IS NOT NULL)
    OR (customer_type = 'GUEST' AND restaurant_id IS NULL AND consumer_user_id IS NULL)
  );

ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_checkout_payment_method_check;
ALTER TABLE customer_order
  ADD CONSTRAINT customer_order_checkout_payment_method_check CHECK (
    checkout_payment_method IS NULL
    OR checkout_payment_method IN ('CASH_ON_DELIVERY', 'CASH_ON_PICKUP', 'BANK_TRANSFER')
  );

CREATE OR REPLACE FUNCTION protect_customer_order_contact_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.customer_contact_snapshot IS DISTINCT FROM NEW.customer_contact_snapshot THEN
    RAISE EXCEPTION 'customer_contact_snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_order_contact_snapshot_immutable ON customer_order;
CREATE TRIGGER customer_order_contact_snapshot_immutable
  BEFORE UPDATE OF customer_contact_snapshot ON customer_order
  FOR EACH ROW
  EXECUTE FUNCTION protect_customer_order_contact_snapshot();

CREATE INDEX IF NOT EXISTS idx_customer_order_consumer
  ON customer_order(consumer_user_id, created_at DESC)
  WHERE consumer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_order_customer_type
  ON customer_order(customer_type, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_order_public_access (
  order_id UUID PRIMARY KEY REFERENCES customer_order(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE order_placement_idempotency
  ALTER COLUMN restaurant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_scope TEXT;

UPDATE order_placement_idempotency
SET actor_scope = 'RESTAURANT:' || restaurant_id::text
WHERE actor_scope IS NULL AND restaurant_id IS NOT NULL;

ALTER TABLE order_placement_idempotency ALTER COLUMN actor_scope SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_placement_idempotency_actor_key
  ON order_placement_idempotency(actor_scope, idempotency_key);

COMMENT ON TABLE supplier_public_sales_config IS
  'Fail-closed public sales configuration for a single supplier tenant.';
COMMENT ON COLUMN customer_order.customer_type IS
  'Order customer ownership: RESTAURANT, CONSUMER, or GUEST.';
COMMENT ON TABLE customer_order_public_access IS
  'Hashed opaque access tokens for guest order receipt and tracking.';
