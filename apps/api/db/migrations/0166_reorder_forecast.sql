-- Cached deterministic reorder forecasts per restaurant / branch / product.

CREATE TABLE IF NOT EXISTS reorder_forecast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  model_tier TEXT NOT NULL CHECK (model_tier IN ('gold', 'platinum')),
  model_version TEXT NOT NULL DEFAULT 'v1',
  forecast_daily_usage NUMERIC(14, 6),
  forecast_reorder_qty NUMERIC(14, 3),
  reorder_by_date DATE,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  urgency TEXT NOT NULL DEFAULT 'LOW' CHECK (urgency IN ('URGENT', 'HIGH', 'MEDIUM', 'LOW')),
  explanation TEXT,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  backtest JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stale_after TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

COMMENT ON TABLE reorder_forecast IS 'Deterministic smart-reorder forecasts; branch_id NULL = restaurant-wide aggregate';
COMMENT ON COLUMN reorder_forecast.signals IS 'Structured inputs: usage windows, seasonality, trend, data source mix';
COMMENT ON COLUMN reorder_forecast.backtest IS 'Holdout comparison vs actual usage over recent window';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reorder_forecast_scope
  ON reorder_forecast (restaurant_id, product_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_reorder_forecast_restaurant_computed
  ON reorder_forecast (restaurant_id, computed_at DESC);

-- Dirty markers for incremental refresh after receiving, adjustments, waste, orders.
CREATE TABLE IF NOT EXISTS reorder_forecast_dirty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  product_id UUID REFERENCES product(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'data_change',
  dirty_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reorder_forecast_dirty IS 'Products/branches needing forecast recompute; product_id NULL = whole restaurant';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reorder_forecast_dirty_scope
  ON reorder_forecast_dirty (
    restaurant_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_reorder_forecast_dirty_at
  ON reorder_forecast_dirty (dirty_at);
