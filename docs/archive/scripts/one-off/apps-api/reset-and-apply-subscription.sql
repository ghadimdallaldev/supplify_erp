-- Reset and apply subscription system migration
-- Run this with: psql $DATABASE_URL -f apps/api/scripts/reset-and-apply-subscription.sql

-- Step 1: Drop existing subscription tables (if they exist)
DROP TABLE IF EXISTS feature_flag_override CASCADE;
DROP TABLE IF EXISTS feature_flag CASCADE;
DROP TABLE IF EXISTS usage_meter CASCADE;
DROP TABLE IF EXISTS subscription CASCADE;
DROP TABLE IF EXISTS subscription_plan CASCADE;
DROP TABLE IF EXISTS admin_audit_log CASCADE;

-- Step 2: Drop invoice.subscription_id column if it exists
ALTER TABLE invoice DROP COLUMN IF EXISTS subscription_id;

-- Step 3: Apply the migration
\i apps/api/db/migrations/0022_subscription_system.sql

-- Step 4: Verify
SELECT name, code, price_per_month, type FROM subscription_plan ORDER BY display_order;

