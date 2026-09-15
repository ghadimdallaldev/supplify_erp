-- Delivery retry provenance: keep failed attempts auditable while allowing a new active attempt.
ALTER TABLE order_warehouse_assignment
  ADD COLUMN IF NOT EXISTS retry_of_assignment_id UUID REFERENCES order_warehouse_assignment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_assignment_id UUID REFERENCES order_warehouse_assignment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

ALTER TABLE order_warehouse_assignment DROP CONSTRAINT IF EXISTS order_warehouse_assignment_status_check;
ALTER TABLE order_warehouse_assignment
  ADD CONSTRAINT order_warehouse_assignment_status_check
  CHECK (status IN ('pending', 'picking', 'packed', 'dispatched', 'delivered', 'failed', 'superseded'));

ALTER TABLE order_warehouse_assignment DROP CONSTRAINT IF EXISTS order_warehouse_assignment_order_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_order_warehouse_assignment_item
  ON order_warehouse_assignment(order_item_id)
  WHERE order_item_id IS NOT NULL AND status NOT IN ('failed', 'superseded');
CREATE INDEX IF NOT EXISTS idx_order_warehouse_assignment_retry
  ON order_warehouse_assignment(retry_of_assignment_id);

ALTER TABLE driver_assignments
  ADD COLUMN IF NOT EXISTS retry_of_assignment_id UUID REFERENCES driver_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_assignment_id UUID REFERENCES driver_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

ALTER TABLE driver_assignments DROP CONSTRAINT IF EXISTS driver_assignments_status_check;
ALTER TABLE driver_assignments
  ADD CONSTRAINT driver_assignments_status_check
  CHECK (status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'reassigned', 'rescheduled', 'superseded'));
CREATE INDEX IF NOT EXISTS idx_driver_assignments_retry
  ON driver_assignments(retry_of_assignment_id);