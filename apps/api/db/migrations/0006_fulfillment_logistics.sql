-- Migration: 0006_fulfillment_logistics.sql
-- Description: Add fulfillment and logistics features

-- Create delivery_wave table for batch processing
CREATE TABLE IF NOT EXISTS delivery_wave (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  wave_number TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, wave_number)
);

-- Create pick_list table
CREATE TABLE IF NOT EXISTS pick_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id UUID NOT NULL REFERENCES delivery_wave(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouse(id),
  picker_id UUID,
  picked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create pick_list_item table
CREATE TABLE IF NOT EXISTS pick_list_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_list_id UUID NOT NULL REFERENCES pick_list(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id),
  quantity_ordered NUMERIC(12,3) NOT NULL,
  quantity_picked NUMERIC(12,3),
  location_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create delivery_route table
CREATE TABLE IF NOT EXISTS delivery_route (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  route_number TEXT NOT NULL,
  driver_name TEXT,
  vehicle_info TEXT,
  scheduled_date DATE NOT NULL,
  estimated_weight NUMERIC(10,2),
  estimated_volume NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'PLANNED',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, route_number)
);

-- Create route_stop table for sequencing
CREATE TABLE IF NOT EXISTS route_stop (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES delivery_route(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  estimated_arrival TIME,
  actual_arrival TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  address_json JSONB,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create proof_of_delivery table
CREATE TABLE IF NOT EXISTS proof_of_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  route_stop_id UUID REFERENCES route_stop(id),
  delivery_date DATE NOT NULL,
  delivered_by TEXT,
  recipient_name TEXT,
  recipient_signature TEXT,
  signature_image_url TEXT,
  delivery_photo_url TEXT,
  delivery_gps_lat NUMERIC(10,8),
  delivery_gps_lng NUMERIC(11,8),
  delivery_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  temperature_log JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create delivery_exception table
CREATE TABLE IF NOT EXISTS delivery_exception (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  route_stop_id UUID REFERENCES route_stop(id),
  exception_type TEXT NOT NULL,
  product_id UUID REFERENCES product(id),
  quantity_expected NUMERIC(12,3),
  quantity_actual NUMERIC(12,3),
  damage_description TEXT,
  photos_json JSONB,
  requires_redelivery BOOLEAN DEFAULT false,
  redelivery_date DATE,
  created_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create return_pickup table for RMA
CREATE TABLE IF NOT EXISTS return_pickup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  rma_number TEXT UNIQUE NOT NULL,
  return_reason TEXT NOT NULL,
  requested_date DATE NOT NULL,
  scheduled_date DATE,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  pickup_location JSONB NOT NULL,
  items_json JSONB NOT NULL,
  pickup_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_delivery_wave_supplier ON delivery_wave(supplier_id);
CREATE INDEX idx_delivery_wave_date ON delivery_wave(scheduled_date);
CREATE INDEX idx_pick_list_wave ON pick_list(wave_id);
CREATE INDEX idx_pick_list_order ON pick_list(order_id);
CREATE INDEX idx_pick_list_item_list ON pick_list_item(pick_list_id);
CREATE INDEX idx_delivery_route_supplier ON delivery_route(supplier_id);
CREATE INDEX idx_delivery_route_date ON delivery_route(scheduled_date);
CREATE INDEX idx_route_stop_route ON route_stop(route_id);
CREATE INDEX idx_route_stop_order ON route_stop(order_id);
CREATE INDEX idx_route_stop_sequence ON route_stop(route_id, sequence_number);
CREATE INDEX idx_pod_order ON proof_of_delivery(order_id);
CREATE INDEX idx_delivery_exception_order ON delivery_exception(order_id);
CREATE INDEX idx_return_pickup_order ON return_pickup(order_id);
CREATE INDEX idx_return_pickup_status ON return_pickup(status);

-- Add comments for documentation
COMMENT ON COLUMN delivery_wave.status IS 'Wave status: PENDING, PICKING, PICKED, LOADED, IN_TRANSIT';
COMMENT ON COLUMN pick_list.status IS 'Pick list status: PENDING, IN_PROGRESS, COMPLETED, EXCEPTION';
COMMENT ON COLUMN delivery_route.status IS 'Route status: PLANNED, IN_PROGRESS, COMPLETED, CANCELLED';
COMMENT ON COLUMN route_stop.status IS 'Stop status: PLANNED, IN_TRANSIT, COMPLETED, FAILED';
COMMENT ON COLUMN delivery_exception.exception_type IS 'Exception type: SHORT, OVER, DAMAGED, MISSING, WRONG_ITEM, REFUSED, OTHER';
COMMENT ON COLUMN return_pickup.status IS 'Return status: REQUESTED, SCHEDULED, IN_TRANSIT, COMPLETED, CANCELLED';
