-- Reorder assistance snooze / not-needed suppressions

CREATE TABLE IF NOT EXISTS reorder_suggestion_suppression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('product', 'cadence', 'supplier_product')),
  scope_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('snooze', 'not_needed')),
  snooze_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reorder_suppression_unique
  ON reorder_suggestion_suppression (restaurant_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_reorder_suppression_active_snooze
  ON reorder_suggestion_suppression (restaurant_id, snooze_until)
  WHERE action = 'snooze' AND snooze_until IS NOT NULL;

COMMENT ON TABLE reorder_suggestion_suppression IS 'Restaurant snooze/dismiss for reorder assistance suggestions';
