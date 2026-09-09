-- Reservation excellence: NO_SHOW, guest CRM-lite, blackouts, review linkage, reminder markers

ALTER TABLE reservation DROP CONSTRAINT IF EXISTS reservation_status_check;
ALTER TABLE reservation
  ADD CONSTRAINT reservation_status_check
  CHECK (status IN ('PENDING','CONFIRMED','SEATED','COMPLETED','CANCELLED','WAITLIST','NO_SHOW'));

CREATE TABLE IF NOT EXISTS reservation_guest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  phone_normalized TEXT,
  email_normalized TEXT,
  allergies TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  visit_count INTEGER NOT NULL DEFAULT 0,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_guest_phone
  ON reservation_guest (restaurant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_guest_email
  ON reservation_guest (restaurant_id, email_normalized)
  WHERE email_normalized IS NOT NULL AND email_normalized <> '';

CREATE INDEX IF NOT EXISTS idx_reservation_guest_restaurant
  ON reservation_guest (restaurant_id, updated_at DESC);

ALTER TABLE reservation
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES reservation_guest(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occasion TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'staff'
    CHECK (booking_source IN ('staff','public','walk_in')),
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_invite_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_required NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS deposit_status TEXT
    CHECK (deposit_status IS NULL OR deposit_status IN ('none','due','paid','waived','refunded'));

CREATE INDEX IF NOT EXISTS idx_reservation_guest_id ON reservation (guest_id);
CREATE INDEX IF NOT EXISTS idx_reservation_reminders
  ON reservation (status, scheduled_at)
  WHERE status IN ('PENDING','CONFIRMED') AND reminder_24h_sent_at IS NULL;

CREATE TABLE IF NOT EXISTS reservation_blackout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE CASCADE,
  blackout_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_blackout_restaurant_date_null_branch
  ON reservation_blackout (restaurant_id, blackout_date)
  WHERE branch_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_blackout_restaurant_branch_date
  ON reservation_blackout (restaurant_id, branch_id, blackout_date)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservation_blackout_restaurant_date
  ON reservation_blackout (restaurant_id, blackout_date);

ALTER TABLE restaurant_reviews
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservation(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_reply TEXT,
  ADD COLUMN IF NOT EXISTS staff_replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staff_replied_by UUID REFERENCES app_user(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_reviews_reservation
  ON restaurant_reviews (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_restaurant_reservation
  ON restaurant_reviews (restaurant_id, created_at DESC)
  WHERE reservation_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_reviews_source_check'
  ) THEN
    ALTER TABLE restaurant_reviews
      ADD CONSTRAINT restaurant_reviews_source_check
      CHECK (consumer_order_id IS NOT NULL OR reservation_id IS NOT NULL);
  END IF;
END $$;
