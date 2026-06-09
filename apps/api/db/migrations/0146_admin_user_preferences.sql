-- Migration: 0146_admin_user_preferences.sql
-- Per-admin UI preferences (landing tab, compact layout, theme).

CREATE TABLE IF NOT EXISTS admin_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  default_landing_tab TEXT NOT NULL DEFAULT 'overview',
  compact_mode BOOLEAN NOT NULL DEFAULT false,
  theme_preference TEXT NOT NULL DEFAULT 'system'
    CHECK (theme_preference IN ('light', 'dark', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_preferences_updated
  ON admin_user_preferences(updated_at DESC);

COMMENT ON TABLE admin_user_preferences IS 'Platform admin personal UI preferences';
