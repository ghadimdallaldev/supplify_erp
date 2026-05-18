-- Custom branding: disabled on Free/Bronze; Gold (logo + colors); Platinum (white-label).

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"custom_branding": false}'::jsonb,
  updated_at = now()
WHERE code IN ('free', 'bronze');

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"custom_branding": "logo_colors"}'::jsonb,
  updated_at = now()
WHERE code = 'gold';

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"custom_branding": "white_label_domain"}'::jsonb,
  updated_at = now()
WHERE code = 'platinum';
