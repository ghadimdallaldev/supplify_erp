-- Smart reorder cadence detection + quick list branch scoping

CREATE TABLE IF NOT EXISTS restaurant_order_cadence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_category(id) ON DELETE CASCADE,
  cadence_level TEXT NOT NULL CHECK (cadence_level IN ('product', 'category', 'supplier')),
  day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  label TEXT NOT NULL,
  confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  min_orders_met INT NOT NULL DEFAULT 0,
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_cadence_restaurant ON restaurant_order_cadence(restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_order_cadence_supplier ON restaurant_order_cadence(supplier_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_cadence_unique_product
  ON restaurant_order_cadence(restaurant_id, supplier_id, product_id, day_of_week)
  WHERE cadence_level = 'product' AND product_id IS NOT NULL AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_cadence_unique_category
  ON restaurant_order_cadence(restaurant_id, supplier_id, category_id, day_of_week)
  WHERE cadence_level = 'category' AND category_id IS NOT NULL AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_cadence_unique_supplier
  ON restaurant_order_cadence(restaurant_id, supplier_id, day_of_week)
  WHERE cadence_level = 'supplier' AND is_active = true;

CREATE TABLE IF NOT EXISTS reorder_cadence_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id UUID NOT NULL REFERENCES restaurant_order_cadence(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  restaurant_notified BOOLEAN NOT NULL DEFAULT false,
  supplier_notified BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cadence_id, reminder_date)
);

ALTER TABLE quick_list ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id) ON DELETE SET NULL;
ALTER TABLE quick_list_item ADD COLUMN IF NOT EXISTS default_unit TEXT;

CREATE INDEX IF NOT EXISTS idx_quick_list_branch ON quick_list(branch_id) WHERE branch_id IS NOT NULL;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS notify_reorder_cadence BOOLEAN DEFAULT true;

COMMENT ON TABLE restaurant_order_cadence IS 'Detected weekday ordering patterns for smart reorder reminders';
