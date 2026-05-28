-- Migration: 0124_deal_boost_publish_flow.sql
-- Boost package selected at submit; boost window on promotions; restaurants see only live boosted deals

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS boost_package_id UUID REFERENCES promotion_pricing_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS boost_pricing_key VARCHAR(64),
  ADD COLUMN IF NOT EXISTS boost_price_snapshot NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS boost_duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS boost_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boost_end_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_promotions_boost_window
  ON promotions (status, boost_start_at, boost_end_at)
  WHERE boost_start_at IS NOT NULL;

-- Backfill live boosts from active deal_promotions campaigns
UPDATE promotions p
SET
  boost_start_at = COALESCE(p.boost_start_at, dp.starts_at),
  boost_end_at = COALESCE(p.boost_end_at, dp.ends_at),
  boost_price_snapshot = COALESCE(p.boost_price_snapshot, dp.price_paid, dp.budget),
  boost_duration_days = COALESCE(
    p.boost_duration_days,
    dp.duration_days,
    CASE
      WHEN dp.ends_at IS NOT NULL AND dp.starts_at IS NOT NULL
      THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (dp.ends_at - dp.starts_at)) / 86400)::int)
      ELSE NULL
    END
  ),
  boost_pricing_key = COALESCE(p.boost_pricing_key, dp.pricing_key),
  boost_package_id = COALESCE(p.boost_package_id, dp.pricing_package_id)
FROM deal_promotions dp
WHERE dp.deal_id = p.id
  AND dp.status = 'active'
  AND dp.starts_at <= NOW()
  AND (dp.ends_at IS NULL OR dp.ends_at > NOW())
  AND p.status IN ('active', 'scheduled');

-- Link package id from pricing key when missing
UPDATE promotions p
SET boost_package_id = ppc.id
FROM promotion_pricing_config ppc
WHERE p.boost_package_id IS NULL
  AND p.boost_pricing_key IS NOT NULL
  AND ppc.pricing_key = p.boost_pricing_key;

-- Active deals without a boost window must not become restaurant-visible
UPDATE promotions p
SET
  status = 'paused',
  updated_at = NOW()
WHERE p.status IN ('active', 'scheduled')
  AND (p.boost_start_at IS NULL OR p.boost_end_at IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM deal_promotions dp
    WHERE dp.deal_id = p.id
      AND dp.status = 'active'
      AND dp.starts_at <= NOW()
      AND (dp.ends_at IS NULL OR dp.ends_at > NOW())
  );

COMMENT ON COLUMN promotions.boost_package_id IS 'Boost package selected at supplier submit (snapshot at submit/approval)';
COMMENT ON COLUMN promotions.boost_price_snapshot IS 'Price locked at submit; admin package edits do not change this deal';
COMMENT ON COLUMN promotions.boost_start_at IS 'Restaurant visibility boost start (set on approval/payment)';
COMMENT ON COLUMN promotions.boost_end_at IS 'Restaurant visibility boost end; deal hidden from restaurants after';
