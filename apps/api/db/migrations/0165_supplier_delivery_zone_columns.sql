-- Unify delivery_zone: consumer B2C zones use branch_id; supplier warehouse zones use supplier_id + warehouse_id.
-- Migration 0161 may have created delivery_zone with only branch columns when the supplier table did not exist yet.

ALTER TABLE delivery_zone
  ADD COLUMN IF NOT EXISTS supplier_id UUID,
  ADD COLUMN IF NOT EXISTS warehouse_id UUID,
  ADD COLUMN IF NOT EXISTS coverage_area_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_time_days INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS zone_type VARCHAR(20) DEFAULT 'polygon',
  ADD COLUMN IF NOT EXISTS geometry JSONB,
  ADD COLUMN IF NOT EXISTS postal_codes TEXT[],
  ADD COLUMN IF NOT EXISTS radius_km NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS center_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS center_lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS estimated_delivery_hours INTEGER;

CREATE INDEX IF NOT EXISTS idx_delivery_zone_supplier ON delivery_zone(supplier_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zone_warehouse ON delivery_zone(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zone_active ON delivery_zone(supplier_id) WHERE is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_zone_type_check') THEN
    ALTER TABLE delivery_zone ADD CONSTRAINT delivery_zone_type_check
      CHECK (zone_type IN ('polygon', 'radius', 'postal_codes'));
  END IF;
END $$;

COMMENT ON COLUMN delivery_zone.branch_id IS 'Restaurant branch for B2C consumer delivery zones';
COMMENT ON COLUMN delivery_zone.supplier_id IS 'Supplier owner for warehouse delivery zones';
COMMENT ON COLUMN delivery_zone.warehouse_id IS 'Warehouse served by this supplier delivery zone';
