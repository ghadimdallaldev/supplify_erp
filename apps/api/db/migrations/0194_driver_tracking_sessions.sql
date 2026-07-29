-- Additive driver tracking sessions and idempotent telemetry columns.
-- Existing driver_location_ping rows and the legacy order location API remain readable.

CREATE TABLE IF NOT EXISTS driver_tracking_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  route_id UUID REFERENCES delivery_route(id) ON DELETE SET NULL,
  started_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'STOPPED', 'EXPIRED', 'CANCELLED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ,
  stop_reason VARCHAR(40),
  last_valid_latitude NUMERIC(10,8),
  last_valid_longitude NUMERIC(11,8),
  last_accuracy_meters NUMERIC(10,2),
  last_recorded_at TIMESTAMPTZ,
  current_stop_id UUID REFERENCES route_stop(id) ON DELETE SET NULL,
  gps_state VARCHAR(40) NOT NULL DEFAULT 'TRACKING_ACTIVE',
  network_state VARCHAR(20) NOT NULL DEFAULT 'online',
  battery_percent NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_tracking_session_active_driver
  ON driver_tracking_session(driver_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_driver_tracking_session_supplier_status
  ON driver_tracking_session(supplier_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_tracking_session_route
  ON driver_tracking_session(route_id, status) WHERE route_id IS NOT NULL;

ALTER TABLE driver_location_ping
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES driver_tracking_session(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_point_id UUID,
  ADD COLUMN IF NOT EXISTS sequence_number BIGINT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS raw_latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS raw_longitude NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS display_latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS display_longitude NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(80),
  ADD COLUMN IF NOT EXISTS battery_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS is_mocked BOOLEAN,
  ADD COLUMN IF NOT EXISTS network_state VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_location_ping_session_client_id
  ON driver_location_ping(session_id, client_point_id)
  WHERE session_id IS NOT NULL AND client_point_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_location_ping_session_sequence
  ON driver_location_ping(session_id, sequence_number)
  WHERE session_id IS NOT NULL;

ALTER TABLE driver_latest_location
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES driver_tracking_session(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gps_state VARCHAR(40),
  ADD COLUMN IF NOT EXISTS network_state VARCHAR(20),
  ADD COLUMN IF NOT EXISTS battery_percent NUMERIC(5,2);

CREATE INDEX IF NOT EXISTS idx_driver_latest_location_session
  ON driver_latest_location(session_id) WHERE session_id IS NOT NULL;
