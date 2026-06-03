-- Driver GPS location pings and latest position cache for live tracking

CREATE TABLE IF NOT EXISTS driver_location_ping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  driver_assignment_id UUID REFERENCES driver_assignments(id) ON DELETE SET NULL,
  route_id UUID REFERENCES delivery_route(id) ON DELETE SET NULL,
  route_stop_id UUID REFERENCES route_stop(id) ON DELETE SET NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  accuracy_meters NUMERIC(10, 2),
  speed_mps NUMERIC(10, 3),
  heading_degrees NUMERIC(6, 2),
  source VARCHAR(30) NOT NULL DEFAULT 'browser',
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT driver_location_ping_lat_range CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT driver_location_ping_lng_range CHECK (longitude >= -180 AND longitude <= 180)
);

CREATE INDEX IF NOT EXISTS idx_driver_location_ping_supplier_driver_time
  ON driver_location_ping (supplier_id, driver_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_location_ping_order_time
  ON driver_location_ping (order_id, recorded_at DESC)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_location_ping_assignment_time
  ON driver_location_ping (driver_assignment_id, recorded_at DESC)
  WHERE driver_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_location_ping_route_time
  ON driver_location_ping (route_id, recorded_at DESC)
  WHERE route_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS driver_latest_location (
  driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  driver_assignment_id UUID REFERENCES driver_assignments(id) ON DELETE SET NULL,
  route_id UUID REFERENCES delivery_route(id) ON DELETE SET NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  accuracy_meters NUMERIC(10, 2),
  speed_mps NUMERIC(10, 3),
  heading_degrees NUMERIC(6, 2),
  recorded_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_latest_location_supplier
  ON driver_latest_location (supplier_id, recorded_at DESC);
