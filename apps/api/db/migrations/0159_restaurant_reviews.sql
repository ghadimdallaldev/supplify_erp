-- Migration: 0159_restaurant_reviews.sql
-- Description: Consumer restaurant reviews and aggregated rating summaries

-- consumer_order_id FK added in 0162 after consumer ordering migration.
CREATE TABLE IF NOT EXISTS restaurant_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  consumer_order_id UUID,
  reviewer_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  food_rating SMALLINT CHECK (food_rating IS NULL OR food_rating BETWEEN 1 AND 5),
  service_rating SMALLINT CHECK (service_rating IS NULL OR service_rating BETWEEN 1 AND 5),
  ambiance_rating SMALLINT CHECK (ambiance_rating IS NULL OR ambiance_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (consumer_order_id)
);

CREATE TABLE IF NOT EXISTS restaurant_rating_summaries (
  restaurant_id UUID PRIMARY KEY REFERENCES restaurant(id) ON DELETE CASCADE,
  review_count INTEGER NOT NULL DEFAULT 0,
  avg_overall NUMERIC(4, 2) NOT NULL DEFAULT 0,
  avg_food NUMERIC(4, 2),
  avg_service NUMERIC(4, 2),
  avg_ambiance NUMERIC(4, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_restaurant ON restaurant_reviews(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_consumer_order ON restaurant_reviews(consumer_order_id);
CREATE OR REPLACE FUNCTION refresh_restaurant_rating_summary(p_restaurant_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO restaurant_rating_summaries (
    restaurant_id,
    review_count,
    avg_overall,
    avg_food,
    avg_service,
    avg_ambiance,
    updated_at
  )
  SELECT
    p_restaurant_id,
    COUNT(*)::integer,
    COALESCE(ROUND(AVG(overall_rating)::numeric, 2), 0),
    ROUND(AVG(food_rating)::numeric, 2),
    ROUND(AVG(service_rating)::numeric, 2),
    ROUND(AVG(ambiance_rating)::numeric, 2),
    now()
  FROM restaurant_reviews
  WHERE restaurant_id = p_restaurant_id
  ON CONFLICT (restaurant_id) DO UPDATE SET
    review_count = EXCLUDED.review_count,
    avg_overall = EXCLUDED.avg_overall,
    avg_food = EXCLUDED.avg_food,
    avg_service = EXCLUDED.avg_service,
    avg_ambiance = EXCLUDED.avg_ambiance,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_restaurant_reviews_refresh_summary()
RETURNS TRIGGER AS $$
DECLARE
  rid UUID;
BEGIN
  rid := COALESCE(NEW.restaurant_id, OLD.restaurant_id);
  PERFORM refresh_restaurant_rating_summary(rid);
  IF TG_OP = 'UPDATE' AND OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id THEN
    PERFORM refresh_restaurant_rating_summary(OLD.restaurant_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS restaurant_reviews_refresh_summary ON restaurant_reviews;
CREATE TRIGGER restaurant_reviews_refresh_summary
  AFTER INSERT OR UPDATE OR DELETE ON restaurant_reviews
  FOR EACH ROW
  EXECUTE FUNCTION trg_restaurant_reviews_refresh_summary();
