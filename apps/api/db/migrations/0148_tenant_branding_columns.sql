-- Tenant brand colors and display name (custom_branding plan feature)

ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120);

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120);

COMMENT ON COLUMN restaurant.brand_primary IS 'Hex primary brand color (#RRGGBB)';
COMMENT ON COLUMN supplier.brand_primary IS 'Hex primary brand color (#RRGGBB)';
