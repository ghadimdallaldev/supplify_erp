-- Migration: 0079_advanced_roles_feature.sql
-- Feature flag and plan defaults for advanced_roles (tenant role management).

INSERT INTO feature_flag (feature_key, feature_name, description, global_override) VALUES
  ('advanced_roles', 'Advanced roles', 'Named roles and custom role builder for team permissions', NULL)
ON CONFLICT (feature_key) DO NOTHING;

-- Enable on Bronze (Silver tier), Gold, and Platinum for both tenant types.
UPDATE subscription_plan
SET features = features || '{"advanced_roles": true}'::jsonb,
    updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum')
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER');

-- Explicitly off on Free
UPDATE subscription_plan
SET features = jsonb_set(
      COALESCE(features, '{}'::jsonb),
      '{advanced_roles}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
WHERE code = 'free'
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER');
