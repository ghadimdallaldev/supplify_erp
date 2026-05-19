-- Drivers, order assignments, fulfillment exceptions, POD extensions

CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  vehicle_type VARCHAR(50),
  vehicle_plate VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_supplier_active ON drivers(supplier_id, is_active);
CREATE INDEX IF NOT EXISTS idx_drivers_warehouse ON drivers(warehouse_id);

CREATE TABLE IF NOT EXISTS driver_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  warehouse_assignment_id UUID REFERENCES order_warehouse_assignment(id) ON DELETE SET NULL,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  supplier_id UUID NOT NULL REFERENCES supplier(id),
  assigned_by UUID REFERENCES app_user(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(30) DEFAULT 'assigned'
    CHECK (status IN (
      'assigned',
      'picked_up',
      'out_for_delivery',
      'delivered',
      'failed',
      'reassigned'
    )),
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_assignments_order ON driver_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver_status ON driver_assignments(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_supplier_status ON driver_assignments(supplier_id, status);

CREATE TABLE IF NOT EXISTS fulfillment_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  driver_assignment_id UUID REFERENCES driver_assignments(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  type VARCHAR(40) NOT NULL CHECK (type IN (
    'failed_delivery',
    'no_pod',
    'overdue',
    'dispute_raised',
    'short_delivery',
    'unassigned_overdue'
  )),
  status VARCHAR(20) DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'ignored')),
  description TEXT,
  resolved_by UUID REFERENCES app_user(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_exceptions_supplier_status
  ON fulfillment_exceptions(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_exceptions_order ON fulfillment_exceptions(order_id);

ALTER TABLE proof_of_delivery
  ADD COLUMN IF NOT EXISTS driver_assignment_id UUID REFERENCES driver_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_key VARCHAR(500),
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

INSERT INTO feature_flag (feature_key, feature_name, description, global_override) VALUES
  ('fulfillment', 'Fulfillment', 'Fulfillment board, waves, and dispatch', NULL),
  ('driver_management', 'Driver management', 'Driver profiles and order delivery assignment', NULL)
ON CONFLICT (feature_key) DO NOTHING;

UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"fulfillment": true, "driver_management": true}'::jsonb,
    updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET features = jsonb_set(
      jsonb_set(
        COALESCE(features, '{}'::jsonb),
        '{fulfillment}',
        'false'::jsonb,
        true
      ),
      '{driver_management}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';
