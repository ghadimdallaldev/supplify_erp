-- Migration: 0180_user_preferred_locale.sql
-- Persist per-user UI locale preference (Wave 3 SA-13).

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(5) NOT NULL DEFAULT 'en'
  CHECK (preferred_locale IN ('en', 'ar'));
