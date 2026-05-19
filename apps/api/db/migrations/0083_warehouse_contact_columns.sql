-- Align warehouse table with routes (0023 fields missing on DBs created from 0005 only)

ALTER TABLE warehouse
  ADD COLUMN IF NOT EXISTS capacity JSONB,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT FALSE;

UPDATE warehouse
SET is_main = COALESCE(is_main, is_default, FALSE)
WHERE is_main IS NULL;

COMMENT ON COLUMN warehouse.capacity IS 'Legacy JSON capacity metadata (optional)';
