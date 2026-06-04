-- Restaurant inventory lot / expiry tracking (batch-level, additive to restaurant_inventory)

CREATE TABLE IF NOT EXISTS restaurant_inventory_settings (
  restaurant_id UUID PRIMARY KEY REFERENCES restaurant(id) ON DELETE CASCADE,
  expiring_soon_days INT NOT NULL DEFAULT 7 CHECK (expiring_soon_days >= 1 AND expiring_soon_days <= 90),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_inventory_lot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  product_id UUID REFERENCES product(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES supplier(id) ON DELETE SET NULL,
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES order_item(id) ON DELETE SET NULL,
  receiving_report_id UUID REFERENCES receiving_report(id) ON DELETE SET NULL,
  receiving_line_item_id UUID REFERENCES receiving_line_item(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  product_sku TEXT,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unit',
  batch_lot_number TEXT,
  received_date DATE,
  expiry_date DATE NOT NULL,
  storage_location TEXT,
  notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_lot_restaurant ON restaurant_inventory_lot(restaurant_id)
  WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_inventory_lot_expiry ON restaurant_inventory_lot(restaurant_id, expiry_date)
  WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_inventory_lot_supplier ON restaurant_inventory_lot(supplier_id)
  WHERE is_archived = false AND supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_lot_order ON restaurant_inventory_lot(order_id);

CREATE TABLE IF NOT EXISTS inventory_expiry_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES restaurant_inventory_lot(id) ON DELETE CASCADE,
  alert_kind TEXT NOT NULL CHECK (alert_kind IN ('expiring_soon', 'expired', 'grouped_expiring_soon', 'grouped_expired')),
  dedup_key TEXT NOT NULL,
  notification_log_id UUID REFERENCES notification_log(id) ON DELETE SET NULL,
  snoozed_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, dedup_key, alert_kind)
);

CREATE INDEX IF NOT EXISTS idx_inventory_expiry_notif_restaurant ON inventory_expiry_notification_log(restaurant_id, sent_at DESC);

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS notify_inventory_expiring BOOLEAN DEFAULT true;

COMMENT ON TABLE restaurant_inventory_lot IS 'Batch/lot-level expiry tracking for restaurant inventory';
COMMENT ON TABLE inventory_expiry_notification_log IS 'Dedup ledger for inventory expiry notifications';
