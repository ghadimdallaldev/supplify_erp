-- Feature flags: fulfillment + driver_management (Bronze+ on supplier plans)

INSERT INTO feature_flag (feature_key, feature_name, description, global_override) VALUES
  ('fulfillment', 'Fulfillment & logistics', 'Dispatch board, waves, and delivery tracking', NULL),
  ('driver_management', 'Driver management', 'Driver profiles and order assignment', NULL)
ON CONFLICT (feature_key) DO NOTHING;

-- Enable on paid supplier plans (not Free)
UPDATE subscription_plan
SET features = features || '{"fulfillment": true, "driver_management": true}'::jsonb
WHERE tenant_type = 'SUPPLIER'
  AND code IN ('bronze', 'gold', 'platinum');
