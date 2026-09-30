-- Account deletion readiness: explicit organization close (never implicit via personal delete).
-- Personal account deletion is handled in application code; this migration only adds org-close markers.

ALTER TABLE supplier_organizations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID NULL REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS close_reason TEXT NULL;

ALTER TABLE restaurant_organizations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID NULL REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS close_reason TEXT NULL;

COMMENT ON COLUMN supplier_organizations.closed_at IS
  'When set, the organization is closed. Personal account deletion never sets this implicitly.';
COMMENT ON COLUMN restaurant_organizations.closed_at IS
  'When set, the organization is closed. Personal account deletion never sets this implicitly.';

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL;

COMMENT ON COLUMN app_user.deleted_at IS
  'Set when the user completes self-service account deletion (is_active also set false).';
