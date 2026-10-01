-- Platform admin toggle: mobile guest + CONSUMER public shop surfaces.
-- Not a tenant plan key. Fail-closed until Admin → Features sets global override ON.

INSERT INTO feature_flag (feature_key, feature_name, description, global_override)
VALUES (
  'mobile_public_shop',
  'Mobile public shop (guest + consumer catalogs)',
  'Controls Login guest browse / shopper signup and CONSUMER Discover on Expo apps. Web public catalogs are unaffected. Inherit or Off = disabled; On = enabled.',
  false
)
ON CONFLICT (feature_key) DO UPDATE
SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  updated_at = now();
