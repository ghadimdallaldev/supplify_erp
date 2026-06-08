-- Delivery rollover: scheduled delivery date and rollover audit fields on driver assignments.

ALTER TABLE driver_assignments
  ADD COLUMN IF NOT EXISTS scheduled_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS rolled_over_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rollover_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN driver_assignments.scheduled_delivery_date IS
  'Operational delivery day for dispatch/rollover (defaults from route date or assigned_at).';
COMMENT ON COLUMN driver_assignments.rolled_over_at IS
  'When this assignment was last moved to the next delivery day by rollover.';

-- Backfill from active route date or assignment date.
UPDATE driver_assignments da
SET scheduled_delivery_date = COALESCE(
  (
    SELECT dr.scheduled_date
    FROM route_stop rs
    JOIN delivery_route dr ON dr.id = rs.route_id
    WHERE rs.order_id = da.order_id
      AND dr.supplier_id = da.supplier_id
      AND dr.status IN ('PLANNED', 'IN_PROGRESS')
    ORDER BY dr.scheduled_date DESC
    LIMIT 1
  ),
  da.assigned_at::date,
  da.created_at::date
)
WHERE da.scheduled_delivery_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_assignments_scheduled_delivery_date
  ON driver_assignments (supplier_id, scheduled_delivery_date)
  WHERE status IN ('assigned', 'picked_up', 'out_for_delivery', 'rescheduled');
