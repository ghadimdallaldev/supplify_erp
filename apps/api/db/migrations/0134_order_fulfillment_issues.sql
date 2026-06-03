-- Supplier shortage / substitution issues linked to orders, chat, and amendments

CREATE TABLE IF NOT EXISTS order_fulfillment_issue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_item(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES app_user(id),
  issue_type TEXT NOT NULL CHECK (issue_type IN ('shortage', 'substitution')),
  status TEXT NOT NULL DEFAULT 'shortage_reported' CHECK (status IN (
    'shortage_reported',
    'substitution_suggested',
    'waiting_restaurant_approval',
    'accepted',
    'rejected'
  )),
  ordered_quantity NUMERIC(14, 3),
  shortage_quantity NUMERIC(14, 3),
  available_quantity NUMERIC(14, 3),
  replacement_product_id UUID REFERENCES product(id) ON DELETE SET NULL,
  replacement_quantity NUMERIC(14, 3),
  replacement_unit TEXT,
  message TEXT,
  amendment_id UUID REFERENCES order_amendments(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversation(id) ON DELETE SET NULL,
  message_id UUID REFERENCES message(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_issue_order ON order_fulfillment_issue(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_issue_restaurant ON order_fulfillment_issue(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_issue_supplier ON order_fulfillment_issue(supplier_id, status);

-- Allow item_shortage amendment type (additive)
ALTER TABLE order_amendments DROP CONSTRAINT IF EXISTS order_amendments_change_type_check;
ALTER TABLE order_amendments ADD CONSTRAINT order_amendments_change_type_check
  CHECK (change_type IN (
    'quantity_change', 'item_substitution', 'item_removal',
    'delivery_date_change', 'item_shortage', 'other'
  ));

COMMENT ON TABLE order_fulfillment_issue IS 'Supplier-reported shortages/substitutions awaiting restaurant response';
