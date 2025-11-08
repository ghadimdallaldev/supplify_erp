-- Reservation and table management system
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_timestamp'
  ) THEN
    -- helper function for updating timestamp columns if not already defined
    CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
    RETURNS TRIGGER AS $BODY$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $BODY$ LANGUAGE plpgsql;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS reservation_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  layout JSONB DEFAULT '{}'::jsonb,
  position JSONB DEFAULT '{"x":0,"y":0}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_table_restaurant ON reservation_table(restaurant_id, is_active);

CREATE TABLE IF NOT EXISTS reservation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  tables UUID[] DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('PENDING','CONFIRMED','SEATED','COMPLETED','CANCELLED','WAITLIST')),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  party_size INTEGER NOT NULL CHECK (party_size > 0),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  waitlist BOOLEAN DEFAULT FALSE,
  auto_confirmed BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_restaurant_time ON reservation(restaurant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reservation_branch_time ON reservation(branch_id, scheduled_at);

CREATE TABLE IF NOT EXISTS reservation_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  party_size INTEGER NOT NULL CHECK (party_size > 0),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  preferred_time TIMESTAMPTZ,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','NOTIFIED','SEATED','CANCELLED')),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reservation_waitlist_restaurant ON reservation_waitlist(restaurant_id, status);

CREATE OR REPLACE VIEW reservation_daily_metrics AS
SELECT
  r.restaurant_id,
  date_trunc('day', r.scheduled_at) AS day,
  COUNT(*) FILTER (WHERE r.status = 'CONFIRMED') AS confirmed_count,
  COUNT(*) FILTER (WHERE r.status = 'WAITLIST') AS waitlist_count,
  COUNT(*) FILTER (WHERE r.status = 'CANCELLED') AS cancelled_count,
  SUM(r.party_size) AS total_covers,
  AVG(r.party_size) AS avg_party_size
FROM reservation r
GROUP BY r.restaurant_id, date_trunc('day', r.scheduled_at);

DROP TRIGGER IF EXISTS reservation_table_updated_at ON reservation_table;
CREATE TRIGGER reservation_table_updated_at
  BEFORE UPDATE ON reservation_table
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at_timestamp();

DROP TRIGGER IF EXISTS reservation_updated_at ON reservation;
CREATE TRIGGER reservation_updated_at
  BEFORE UPDATE ON reservation
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at_timestamp();

