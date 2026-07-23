-- Supplier-paid sponsorship lifecycle: offer → accept → invoice → pay → schedule/activate → complete.
-- Extends supplier_sponsorship from 0169; does not alter historical migration files.

-- Expand status constraint
ALTER TABLE supplier_sponsorship DROP CONSTRAINT IF EXISTS supplier_sponsorship_status_check;
ALTER TABLE supplier_sponsorship
  ADD CONSTRAINT supplier_sponsorship_status_check
  CHECK (status IN (
    'draft',
    'offered',
    'accepted',
    'payment_pending',
    'payment_failed',
    'scheduled',
    'active',
    'completed',
    'expired',
    'cancelled',
    'refunded',
    'reversed',
    'pending'
  ));

-- Map legacy unused pending rows (if any) toward offered semantics for new code paths
UPDATE supplier_sponsorship SET status = 'offered' WHERE status = 'pending';

ALTER TABLE supplier_sponsorship
  ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES supplier_growth_invitation(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_plan_id UUID REFERENCES subscription_plan(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS sponsored_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_behavior TEXT,
  ADD COLUMN IF NOT EXISTS offered_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supplier_payment_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_ref TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_activation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payer_type TEXT DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE supplier_sponsorship
  DROP CONSTRAINT IF EXISTS supplier_sponsorship_billing_interval_check;
ALTER TABLE supplier_sponsorship
  ADD CONSTRAINT supplier_sponsorship_billing_interval_check
  CHECK (billing_interval = 'MONTHLY');

ALTER TABLE supplier_sponsorship
  DROP CONSTRAINT IF EXISTS supplier_sponsorship_amount_nonneg;
ALTER TABLE supplier_sponsorship
  ADD CONSTRAINT supplier_sponsorship_amount_nonneg
  CHECK (sponsored_amount IS NULL OR sponsored_amount >= 0);

ALTER TABLE supplier_sponsorship
  DROP CONSTRAINT IF EXISTS supplier_sponsorship_tax_nonneg;
ALTER TABLE supplier_sponsorship
  ADD CONSTRAINT supplier_sponsorship_tax_nonneg
  CHECK (tax_amount >= 0);

ALTER TABLE supplier_sponsorship
  DROP CONSTRAINT IF EXISTS supplier_sponsorship_distinct_tenants;
ALTER TABLE supplier_sponsorship
  ADD CONSTRAINT supplier_sponsorship_distinct_tenants
  CHECK (restaurant_id IS NULL OR supplier_id <> restaurant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_sponsorship_idempotency
  ON supplier_sponsorship (supplier_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_sponsorship_live_restaurant
  ON supplier_sponsorship (restaurant_id)
  WHERE restaurant_id IS NOT NULL
    AND status IN (
      'offered', 'accepted', 'payment_pending', 'payment_failed', 'scheduled', 'active'
    );

CREATE INDEX IF NOT EXISTS idx_sponsorship_offer_expires
  ON supplier_sponsorship (offer_expires_at)
  WHERE status = 'offered';

CREATE INDEX IF NOT EXISTS idx_sponsorship_scheduled_activation
  ON supplier_sponsorship (scheduled_activation_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_sponsorship_payment_pending
  ON supplier_sponsorship (updated_at)
  WHERE status IN ('payment_pending', 'payment_failed');

CREATE INDEX IF NOT EXISTS idx_sponsorship_active_period_end
  ON supplier_sponsorship (period_end)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sponsorship_supplier_status
  ON supplier_sponsorship (supplier_id, status, created_at DESC);

-- Allow offer rows before period is known
ALTER TABLE supplier_sponsorship
  ALTER COLUMN period_start DROP NOT NULL,
  ALTER COLUMN period_end DROP NOT NULL;

-- Merge extended growth-program defaults into platform_setting (preserve existing keys)
UPDATE platform_setting
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'sponsorshipEnabled', true,
  'offerExpiryDays', 14,
  'referralDiscountAppliesTo', 'first_restaurant_funded',
  'requireRestaurantPaymentMethodBeforeActivation', false,
  'supplierPaymentAfterAcceptance', true,
  'maxSponsoredAmount', null,
  'supportedBillingIntervals', '["MONTHLY"]'::jsonb,
  'paymentPendingStaleDays', 7
),
updated_at = now()
WHERE key = 'referral_program_config';
