-- Idempotent repair: tenant branding columns (safe if 0148 already applied)

ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120);

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120);
