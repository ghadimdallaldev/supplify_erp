-- Migration: 0130_contract_pricing_productization.sql
-- Snapshot contract pricing metadata on order lines

ALTER TABLE order_item
  ADD COLUMN IF NOT EXISTS pricing_source TEXT
    CHECK (pricing_source IS NULL OR pricing_source IN ('DEFAULT_PRICE', 'CONTRACT_PRICE', 'PROMOTION_PRICE', 'DISCOUNT_APPLIED')),
  ADD COLUMN IF NOT EXISTS contract_price_id UUID REFERENCES restaurant_pricing(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_catalog_price NUMERIC(12,3);

COMMENT ON COLUMN order_item.pricing_source IS 'How unit_price was resolved at order time';
COMMENT ON COLUMN order_item.contract_price_id IS 'restaurant_pricing row used when pricing_source = CONTRACT_PRICE';
COMMENT ON COLUMN order_item.default_catalog_price IS 'Catalog price before contract override at order time';

CREATE INDEX IF NOT EXISTS idx_order_item_contract_price ON order_item(contract_price_id)
  WHERE contract_price_id IS NOT NULL;
