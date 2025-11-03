-- Migration: 0032_remove_feature_flags.sql
-- Description: Remove feature flag system - features are now determined solely by subscription plans

-- Drop feature flag override table first (due to foreign key)
DROP TABLE IF EXISTS feature_flag_override CASCADE;

-- Drop feature flag table
DROP TABLE IF EXISTS feature_flag CASCADE;

-- Drop the trigger function if it exists
DROP TRIGGER IF EXISTS update_feature_flag_updated_at_trigger ON feature_flag;
DROP FUNCTION IF EXISTS update_feature_flag_updated_at();

-- Note: Features are now exclusively controlled by subscription_plan.features JSONB field
-- To enable/disable features, update the plan's features JSONB directly

