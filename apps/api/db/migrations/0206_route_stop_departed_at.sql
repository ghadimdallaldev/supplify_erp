-- Route stops recorded a driver *departure* (IN_TRANSIT) into actual_arrival, which
-- made actual-vs-estimated arrival comparisons meaningless. Give departure its own
-- column so actual_arrival can mean what it says.

ALTER TABLE route_stop
  ADD COLUMN IF NOT EXISTS departed_at TIMESTAMPTZ;

COMMENT ON COLUMN route_stop.departed_at IS
  'When the driver set this stop out for delivery (IN_TRANSIT)';
COMMENT ON COLUMN route_stop.actual_arrival IS
  'When the driver actually arrived at this stop (set on completion)';
