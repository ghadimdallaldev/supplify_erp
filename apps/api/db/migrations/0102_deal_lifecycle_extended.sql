-- Extended deal lifecycle: approval audit, activation payment, analytics, order snapshots.

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS approved_by_admin_id UUID;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS rejected_by_admin_id UUID;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS activation_payment_reference TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_payment_status_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_payment_status_check
  CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed', 'refunded', 'cancelled'));

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_status_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_status_check
  CHECK (status IN (
    'draft',
    'pending_approval',
    'pending_admin_approval',
    'rejected',
    'approved_pending_payment',
    'scheduled',
    'active',
    'paused',
    'expired',
    'cancelled'
  ));

UPDATE promotions SET payment_status = 'not_required' WHERE payment_status IS NULL;

ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS deal_title VARCHAR(255);
ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS deal_type VARCHAR(50);
ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES supplier(id) ON DELETE SET NULL;
ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS discount_type VARCHAR(50);
ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12, 2);
ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS delivery_discount_applied NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS deal_config_snapshot JSONB;
ALTER TABLE promotion_usages ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE deal_interactions DROP CONSTRAINT IF EXISTS deal_interactions_interaction_type_check;
ALTER TABLE deal_interactions ADD CONSTRAINT deal_interactions_interaction_type_check
  CHECK (interaction_type IN (
    'view', 'click', 'order', 'coupon_used', 'message',
    'add_to_cart', 'apply_to_cart', 'remove_from_cart',
    'order_created', 'order_completed', 'message_supplier'
  ));

CREATE TABLE IF NOT EXISTS deal_restaurant_views (
  deal_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (deal_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_restaurant_views_deal ON deal_restaurant_views(deal_id);

INSERT INTO promotion_pricing_config (pricing_key, display_name, billing_type, amount, description)
VALUES (
  'deal_activation',
  'Deal activation fee',
  'flat_fee',
  0,
  'One-time fee to activate a supplier deal after admin approval (0 = no payment required)'
)
ON CONFLICT (pricing_key) DO NOTHING;

COMMENT ON COLUMN promotions.payment_status IS 'Activation payment state after admin approval';
COMMENT ON TABLE deal_restaurant_views IS 'Unique restaurant views per deal (deduped page refreshes for unique count)';
