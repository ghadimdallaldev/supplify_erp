-- Price intelligence must not treat a currency change as a price change.
ALTER TABLE supplier_price_events
  ADD COLUMN IF NOT EXISTS currency TEXT;

CREATE INDEX IF NOT EXISTS idx_supplier_price_events_currency
  ON supplier_price_events (restaurant_id, product_id, currency, detected_at DESC);
