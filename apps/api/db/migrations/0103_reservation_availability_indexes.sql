-- Support faster availability and manage-token lookups
CREATE INDEX IF NOT EXISTS idx_reservation_restaurant_status
  ON reservation (restaurant_id, status);

CREATE INDEX IF NOT EXISTS idx_reservation_public_token
  ON reservation (public_token)
  WHERE public_token IS NOT NULL;
