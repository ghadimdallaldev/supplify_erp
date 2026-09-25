-- Ensure a delivery leg cannot acquire two active drivers during concurrent dispatch.
-- Keep the newest historical assignment and make earlier duplicate live rows terminal.
WITH ranked_active_assignments AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY order_id, COALESCE(warehouse_assignment_id, '00000000-0000-0000-0000-000000000000'::uuid)
           ORDER BY assigned_at DESC NULLS LAST, created_at DESC, id DESC
         ) AS rank
  FROM driver_assignments
  WHERE status IN ('assigned', 'picked_up', 'out_for_delivery')
)
UPDATE driver_assignments da
SET status = 'reassigned',
    notes = CONCAT_WS(' | ', da.notes, 'Reassigned by active-assignment integrity migration'),
    updated_at = now()
FROM ranked_active_assignments ranked
WHERE da.id = ranked.id AND ranked.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_driver_assignment_order_unassigned
  ON driver_assignments(order_id)
  WHERE warehouse_assignment_id IS NULL
    AND status IN ('assigned', 'picked_up', 'out_for_delivery');

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_driver_assignment_warehouse_leg
  ON driver_assignments(order_id, warehouse_assignment_id)
  WHERE warehouse_assignment_id IS NOT NULL
    AND status IN ('assigned', 'picked_up', 'out_for_delivery');
