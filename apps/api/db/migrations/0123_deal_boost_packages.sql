-- Migration: 0123_deal_boost_packages.sql
-- Facebook-style boost packages: richer pricing config + purchase snapshots on campaigns

ALTER TABLE promotion_pricing_config
  ADD COLUMN IF NOT EXISTS package_type VARCHAR(20) NOT NULL DEFAULT 'boost'
    CHECK (package_type IN ('boost', 'activation')),
  ADD COLUMN IF NOT EXISTS estimated_reach_label VARCHAR(64),
  ADD COLUMN IF NOT EXISTS badge_label VARCHAR(64),
  ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE deal_promotions
  ADD COLUMN IF NOT EXISTS pricing_package_id UUID REFERENCES promotion_pricing_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_key VARCHAR(64),
  ADD COLUMN IF NOT EXISTS price_paid NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS package_display_name VARCHAR(255);

UPDATE promotion_pricing_config
SET package_type = 'activation'
WHERE pricing_key = 'deal_activation';

UPDATE promotion_pricing_config
SET
  display_name = 'Starter Boost',
  amount = 9.00,
  duration_days = 1,
  billing_type = 'flat_fee',
  description = 'Test visibility — basic placement in restaurant deal feeds for 1 day',
  estimated_reach_label = 'Basic visibility',
  badge_label = 'Test visibility',
  is_recommended = FALSE,
  sort_order = 10,
  package_type = 'boost',
  is_active = TRUE
WHERE pricing_key = 'boost_flat';

UPDATE promotion_pricing_config
SET
  display_name = 'Weekly Boost',
  amount = 39.00,
  duration_days = 7,
  billing_type = 'flat_fee',
  description = 'Higher placement in restaurant deal feeds for 7 days',
  estimated_reach_label = 'Higher placement for 7 days',
  badge_label = 'Most popular',
  is_recommended = TRUE,
  sort_order = 20,
  package_type = 'boost',
  is_active = TRUE
WHERE pricing_key = 'boost_7_day';

UPDATE promotion_pricing_config
SET
  display_name = 'Monthly Boost',
  amount = 99.00,
  duration_days = 30,
  billing_type = 'flat_fee',
  description = 'Maximum visibility in restaurant deal feeds for 30 days',
  estimated_reach_label = 'Maximum visibility for 30 days',
  badge_label = 'Best value',
  is_recommended = FALSE,
  sort_order = 30,
  package_type = 'boost',
  is_active = TRUE
WHERE pricing_key = 'boost_30_day';

UPDATE promotion_pricing_config
SET
  display_name = 'Deal activation',
  description = 'Free after admin approval — no charge to publish your deal',
  amount = 0,
  package_type = 'activation',
  estimated_reach_label = NULL,
  badge_label = 'Free after admin approval',
  sort_order = 0
WHERE pricing_key = 'deal_activation';

-- Backfill snapshots on existing campaigns from budget + pricing config when possible
UPDATE deal_promotions dp
SET
  price_paid = COALESCE(dp.price_paid, dp.budget),
  pricing_key = COALESCE(dp.pricing_key, ppc.pricing_key),
  duration_days = COALESCE(
    dp.duration_days,
    ppc.duration_days,
    CASE
      WHEN dp.ends_at IS NOT NULL AND dp.starts_at IS NOT NULL
      THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (dp.ends_at - dp.starts_at)) / 86400)::int)
      ELSE NULL
    END
  ),
  package_display_name = COALESCE(dp.package_display_name, ppc.display_name),
  pricing_package_id = COALESCE(dp.pricing_package_id, ppc.id)
FROM promotion_pricing_config ppc
WHERE dp.pricing_package_id IS NULL
  AND dp.budget = ppc.amount
  AND ppc.package_type = 'boost';

COMMENT ON COLUMN promotion_pricing_config.package_type IS 'boost = paid visibility package; activation = post-approval deal fee';
COMMENT ON COLUMN promotion_pricing_config.estimated_reach_label IS 'Qualitative reach copy shown to suppliers (not fake analytics)';
COMMENT ON COLUMN deal_promotions.price_paid IS 'Amount charged at purchase; unchanged when admin edits package price';
