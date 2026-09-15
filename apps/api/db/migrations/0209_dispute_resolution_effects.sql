-- One immutable, idempotent financial/fulfillment effect per dispute resolution.
CREATE TABLE IF NOT EXISTS dispute_resolution_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL UNIQUE REFERENCES disputes(id) ON DELETE CASCADE,
  effect_type VARCHAR(30) NOT NULL CHECK (effect_type IN ('credit_note', 'replacement', 'refund', 'no_action')),
  amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  reference TEXT,
  credit_note_id UUID REFERENCES credit_note(id) ON DELETE SET NULL,
  replacement_order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  effect_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_resolution_effects_type ON dispute_resolution_effects(effect_type);
COMMENT ON TABLE dispute_resolution_effects IS 'Immutable idempotency record for the single resolution effect of a dispute';