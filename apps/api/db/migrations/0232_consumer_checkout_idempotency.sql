CREATE TABLE IF NOT EXISTS consumer_checkout_attempt (
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  payload_hash TEXT NOT NULL,
  consumer_order_id UUID NOT NULL REFERENCES consumer_order(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (restaurant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_consumer_checkout_attempt_order
  ON consumer_checkout_attempt (consumer_order_id);
