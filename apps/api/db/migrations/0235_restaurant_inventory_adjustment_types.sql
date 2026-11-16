-- Match the existing restaurant adjustment API while retaining supplier IN/OUT.
-- Replace the constraint atomically; do not rewrite the historical migration.
DO $$
BEGIN
  ALTER TABLE inventory_adjustment
    DROP CONSTRAINT IF EXISTS inventory_adjustment_adjustment_type_check;
  ALTER TABLE inventory_adjustment
    ADD CONSTRAINT inventory_adjustment_adjustment_type_check
    CHECK (adjustment_type IN ('IN', 'OUT', 'WASTAGE', 'SPOILAGE', 'COUNT_CORRECTION', 'OTHER'));
END $$;
