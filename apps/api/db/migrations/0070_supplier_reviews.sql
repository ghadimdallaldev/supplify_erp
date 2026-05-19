-- Migration: 0070_supplier_reviews.sql
-- Description: Supplier reviews and aggregated rating summaries

CREATE TABLE IF NOT EXISTS supplier_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  quality_rating SMALLINT CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5),
  delivery_rating SMALLINT CHECK (delivery_rating IS NULL OR delivery_rating BETWEEN 1 AND 5),
  value_rating SMALLINT CHECK (value_rating IS NULL OR value_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS supplier_rating_summaries (
  supplier_id UUID PRIMARY KEY REFERENCES supplier(id) ON DELETE CASCADE,
  review_count INTEGER NOT NULL DEFAULT 0,
  avg_overall NUMERIC(4, 2) NOT NULL DEFAULT 0,
  avg_quality NUMERIC(4, 2),
  avg_delivery NUMERIC(4, 2),
  avg_value NUMERIC(4, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_reviews_supplier ON supplier_reviews(supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_reviews_restaurant ON supplier_reviews(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_reviews_reviewer ON supplier_reviews(reviewer_user_id);

CREATE OR REPLACE FUNCTION refresh_supplier_rating_summary(p_supplier_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO supplier_rating_summaries (
    supplier_id,
    review_count,
    avg_overall,
    avg_quality,
    avg_delivery,
    avg_value,
    updated_at
  )
  SELECT
    p_supplier_id,
    COUNT(*)::integer,
    COALESCE(ROUND(AVG(overall_rating)::numeric, 2), 0),
    ROUND(AVG(quality_rating)::numeric, 2),
    ROUND(AVG(delivery_rating)::numeric, 2),
    ROUND(AVG(value_rating)::numeric, 2),
    now()
  FROM supplier_reviews
  WHERE supplier_id = p_supplier_id
  ON CONFLICT (supplier_id) DO UPDATE SET
    review_count = EXCLUDED.review_count,
    avg_overall = EXCLUDED.avg_overall,
    avg_quality = EXCLUDED.avg_quality,
    avg_delivery = EXCLUDED.avg_delivery,
    avg_value = EXCLUDED.avg_value,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_supplier_reviews_refresh_summary()
RETURNS TRIGGER AS $$
DECLARE
  sid UUID;
BEGIN
  sid := COALESCE(NEW.supplier_id, OLD.supplier_id);
  PERFORM refresh_supplier_rating_summary(sid);
  IF TG_OP = 'UPDATE' AND OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN
    PERFORM refresh_supplier_rating_summary(OLD.supplier_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplier_reviews_refresh_summary ON supplier_reviews;
CREATE TRIGGER supplier_reviews_refresh_summary
  AFTER INSERT OR UPDATE OR DELETE ON supplier_reviews
  FOR EACH ROW
  EXECUTE FUNCTION trg_supplier_reviews_refresh_summary();
