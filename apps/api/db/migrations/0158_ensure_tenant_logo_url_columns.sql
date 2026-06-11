-- Idempotent repair: logo_url on tenant tables (safe if 0005/0015 already applied)

ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS logo_url TEXT;
