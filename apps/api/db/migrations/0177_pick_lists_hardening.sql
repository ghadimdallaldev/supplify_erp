-- Pick lists API hardening for warehouse wave picking

ALTER TABLE pick_list_item
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_item(id) ON DELETE SET NULL;

ALTER TABLE pick_list
  ADD COLUMN IF NOT EXISTS picker_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pick_list_item_order_item
  ON pick_list_item (order_item_id) WHERE order_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_wave_supplier_date
  ON delivery_wave (supplier_id, scheduled_date);

COMMENT ON COLUMN pick_list_item.order_item_id IS 'Links pick line to originating order_item';
COMMENT ON COLUMN pick_list.picker_user_id IS 'App user assigned as picker';
