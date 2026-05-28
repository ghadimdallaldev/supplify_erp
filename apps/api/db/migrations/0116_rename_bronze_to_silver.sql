-- Migration: 0116_rename_bronze_to_silver.sql
-- Rename plan code bronze -> silver and display name Bronze -> Silver.
-- Preserves limits, features, and pricing. Idempotent where possible.

-- ========================================
-- 1) Denormalized subscription / snapshot text
-- ========================================
UPDATE subscription
SET plan_name = 'Silver', updated_at = now()
WHERE plan_name = 'Bronze';

UPDATE subscription
SET previous_plan_code = 'silver', updated_at = now()
WHERE previous_plan_code = 'bronze';

UPDATE tenant_plan_snapshot
SET plan_code = 'silver',
    plan_name = 'Silver'
WHERE plan_code = 'bronze';

UPDATE tenant_plan_snapshot
SET plan_name = 'Silver'
WHERE plan_name = 'Bronze' AND plan_code = 'silver';

UPDATE restaurant
SET subscription_tier = 'SILVER'
WHERE subscription_tier = 'BRONZE';

-- ========================================
-- 2) Merge when both bronze and silver exist (same tenant_type)
-- ========================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT sp_b.tenant_type, sp_b.id AS bronze_id, sp_s.id AS silver_id
    FROM subscription_plan sp_b
    INNER JOIN subscription_plan sp_s
      ON sp_s.tenant_type = sp_b.tenant_type AND sp_s.code = 'silver'
    WHERE sp_b.code = 'bronze'
  LOOP
    UPDATE subscription
    SET plan_id = r.silver_id, plan_name = 'Silver', updated_at = now()
    WHERE plan_id = r.bronze_id;

    UPDATE plan_limit_override
    SET plan_id = r.silver_id, updated_at = now()
    WHERE plan_id = r.bronze_id;

    DELETE FROM subscription_plan WHERE id = r.bronze_id;
  END LOOP;
END $$;

-- ========================================
-- 3) Rename remaining bronze catalog rows (no silver duplicate)
-- ========================================
UPDATE subscription_plan
SET code = 'silver',
    name = 'Silver',
    updated_at = now()
WHERE code = 'bronze';

COMMENT ON COLUMN subscription_plan.code IS 'Unique plan code (free, silver, gold, platinum) for programmatic access';
