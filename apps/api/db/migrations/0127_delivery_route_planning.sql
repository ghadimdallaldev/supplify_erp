-- Delivery route planning: link routes to drivers and label/area metadata

ALTER TABLE delivery_route
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

ALTER TABLE delivery_route
  ADD COLUMN IF NOT EXISTS route_label TEXT;

ALTER TABLE delivery_route
  ADD COLUMN IF NOT EXISTS area TEXT;

CREATE INDEX IF NOT EXISTS idx_delivery_route_driver ON delivery_route(driver_id);

COMMENT ON COLUMN delivery_route.driver_id IS 'Assigned driver for this route run';
COMMENT ON COLUMN delivery_route.route_label IS 'Optional display name for the route';
COMMENT ON COLUMN delivery_route.area IS 'Optional delivery area label for grouping';
