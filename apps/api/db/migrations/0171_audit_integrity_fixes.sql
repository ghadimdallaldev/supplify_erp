-- Migration: 0171_audit_integrity_fixes.sql
-- Remaining audit DB integrity fixes: delivery_zone XOR ownership, referral/subscription
-- partial uniques, prospect matching indexes, sponsorship billing FK.

-- ========================================
-- 1) delivery_zone XOR ownership constraint
-- Supplier warehouse zones: supplier_id + warehouse_id set, branch_id NULL
-- B2C consumer zones: branch_id set, supplier_id + warehouse_id NULL
-- ========================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery_zone'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'delivery_zone' AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE delivery_zone ALTER COLUMN branch_id DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'delivery_zone' AND column_name = 'supplier_id'
    ) THEN
      ALTER TABLE delivery_zone ALTER COLUMN supplier_id DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'delivery_zone' AND column_name = 'warehouse_id'
    ) THEN
      ALTER TABLE delivery_zone ALTER COLUMN warehouse_id DROP NOT NULL;
    END IF;

    ALTER TABLE delivery_zone DROP CONSTRAINT IF EXISTS delivery_zone_owner_xor_check;

    ALTER TABLE delivery_zone ADD CONSTRAINT delivery_zone_owner_xor_check CHECK (
      (
        supplier_id IS NOT NULL
        AND warehouse_id IS NOT NULL
        AND branch_id IS NULL
      )
      OR (
        branch_id IS NOT NULL
        AND supplier_id IS NULL
        AND warehouse_id IS NULL
      )
    );
  END IF;
END $$;

-- ========================================
-- 2) Referral attribution: one active attribution per restaurant
-- ========================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_active_restaurant
  ON supplier_referral_attribution (restaurant_id)
  WHERE converted_at IS NULL AND first_paid_discount_used = false;

-- ========================================
-- 3) Subscription: one non-terminal subscription per tenant
-- ========================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_active_tenant
  ON subscription (tenant_id, tenant_type)
  WHERE status NOT IN ('CANCELLED', 'EXPIRED');

-- ========================================
-- 4) Prospect matching: normalized phone digits + name lookup index
-- (0169 defines restaurant_name, not name; mirrors supplier-customer-matching.service.js)
-- ========================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'supplier_customer_prospect'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'supplier_customer_prospect'
        AND column_name = 'phone_digits'
    ) THEN
      ALTER TABLE supplier_customer_prospect
        ADD COLUMN phone_digits TEXT GENERATED ALWAYS AS (
          NULLIF(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')
        ) STORED;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_prospect_phone_digits
  ON supplier_customer_prospect (phone_digits)
  WHERE phone_digits IS NOT NULL AND length(phone_digits) >= 7;

CREATE INDEX IF NOT EXISTS idx_supplier_prospect_restaurant_name_lower
  ON supplier_customer_prospect (lower(restaurant_name));

-- ========================================
-- 5) supplier_sponsorship → billing_invoice FK
-- ========================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'supplier_sponsorship'
      AND column_name = 'supplier_billing_invoice_id'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_invoice'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sponsorship_billing_invoice'
  ) THEN
    ALTER TABLE supplier_sponsorship
      ADD CONSTRAINT fk_sponsorship_billing_invoice
      FOREIGN KEY (supplier_billing_invoice_id)
      REFERENCES billing_invoice (id)
      ON DELETE SET NULL;
  END IF;
END $$;
