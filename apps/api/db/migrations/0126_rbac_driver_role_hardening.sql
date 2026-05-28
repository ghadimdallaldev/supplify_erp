-- Link supplier drivers to app users for Driver role portal access
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_supplier_user
  ON drivers (supplier_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers (user_id) WHERE user_id IS NOT NULL;
