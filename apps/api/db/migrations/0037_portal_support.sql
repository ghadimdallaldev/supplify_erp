-- Migration: Portal support for public reservations and staff sessions

ALTER TABLE reservation
ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS public_token_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS staff_portal_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  session_token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_portal_session_token ON staff_portal_session(session_token);
CREATE INDEX IF NOT EXISTS idx_staff_portal_session_expiry ON staff_portal_session(expires_at);

