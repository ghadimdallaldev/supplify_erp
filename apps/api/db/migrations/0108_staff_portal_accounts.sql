-- Operational staff portal accounts (separate from platform/team users)

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
  CHECK (role IN ('ADMIN', 'SUPPLIER', 'RESTAURANT', 'PENDING', 'STAFF_PORTAL'));

ALTER TABLE staff_member
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_access_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_access_disabled_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_member_user_id
  ON staff_member(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_member_portal_access
  ON staff_member(restaurant_id, portal_access_enabled)
  WHERE portal_access_enabled = true;

COMMENT ON COLUMN staff_member.user_id IS 'Linked app_user for staff portal login (role STAFF_PORTAL).';
COMMENT ON COLUMN staff_member.portal_access_enabled IS 'When false, staff cannot use portal login or magic links.';
