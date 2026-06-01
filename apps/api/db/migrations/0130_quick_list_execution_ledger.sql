-- Execution ledger: at most one cron run per quick_list per calendar day (UTC).

CREATE TABLE IF NOT EXISTS quick_list_execution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quick_list_id UUID NOT NULL REFERENCES quick_list(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  execution_date DATE NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('executed', 'reminder', 'skipped', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quick_list_id, execution_date)
);

CREATE INDEX IF NOT EXISTS idx_quick_list_execution_restaurant
  ON quick_list_execution(restaurant_id, execution_date);

COMMENT ON TABLE quick_list_execution IS
  'Idempotency ledger for scheduled quick-list cron runs (one row per list per UTC day).';
