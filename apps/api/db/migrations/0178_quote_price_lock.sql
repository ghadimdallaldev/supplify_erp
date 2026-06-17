-- Quote response price lock at order checkout

ALTER TABLE order_item DROP CONSTRAINT IF EXISTS order_item_pricing_source_check;

ALTER TABLE order_item
  ADD CONSTRAINT order_item_pricing_source_check CHECK (
    pricing_source IS NULL OR pricing_source IN (
      'DEFAULT_PRICE',
      'CONTRACT_PRICE',
      'PROMOTION_PRICE',
      'DISCOUNT_APPLIED',
      'QUOTE_PRICE'
    )
  );

ALTER TABLE order_item
  ADD COLUMN IF NOT EXISTS quote_response_item_id UUID;

COMMENT ON COLUMN order_item.quote_response_item_id IS 'quote_response_items row when pricing_source = QUOTE_PRICE';

CREATE INDEX IF NOT EXISTS idx_order_item_quote_response_item
  ON order_item (quote_response_item_id) WHERE quote_response_item_id IS NOT NULL;
