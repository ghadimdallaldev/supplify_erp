-- Waitlist auto-promotion: cancellation tracking and offer lifecycle

ALTER TABLE reservation
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE reservation_waitlist
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS offer_token UUID;

-- Backfill queue positions for existing rows
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY restaurant_id
      ORDER BY requested_at ASC, id ASC
    ) AS pos
  FROM reservation_waitlist
  WHERE position IS NULL
)
UPDATE reservation_waitlist w
SET position = ranked.pos
FROM ranked
WHERE w.id = ranked.id;

ALTER TABLE reservation_waitlist
  DROP CONSTRAINT IF EXISTS reservation_waitlist_offer_status_check;

ALTER TABLE reservation_waitlist
  ADD CONSTRAINT reservation_waitlist_offer_status_check
  CHECK (offer_status IN ('none', 'offered', 'accepted', 'declined', 'expired'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_waitlist_offer_token
  ON reservation_waitlist(offer_token)
  WHERE offer_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservation_waitlist_promotion
  ON reservation_waitlist(restaurant_id, party_size, status, position)
  WHERE status IN ('WAITING', 'NOTIFIED');

CREATE INDEX IF NOT EXISTS idx_reservation_waitlist_expired_offers
  ON reservation_waitlist(offer_expires_at)
  WHERE offer_status = 'offered';
