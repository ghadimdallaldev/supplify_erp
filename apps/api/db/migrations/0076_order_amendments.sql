-- Migration: 0076_order_amendments.sql
-- Structured order change requests between restaurant and supplier

CREATE TABLE IF NOT EXISTS order_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  requested_by_role VARCHAR(20) NOT NULL
    CHECK (requested_by_role IN ('restaurant', 'supplier')),
  requested_by UUID NOT NULL REFERENCES app_user(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  change_type VARCHAR(30) NOT NULL
    CHECK (change_type IN (
      'quantity_change', 'item_substitution', 'item_removal',
      'delivery_date_change', 'other'
    )),
  description TEXT NOT NULL,
  responded_by UUID REFERENCES app_user(id),
  response_notes TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_amendment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amendment_id UUID NOT NULL REFERENCES order_amendments(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_item(id) ON DELETE SET NULL,
  original_product_id UUID REFERENCES product(id),
  substitute_product_id UUID REFERENCES product(id),
  original_quantity NUMERIC(12, 3),
  requested_quantity NUMERIC(12, 3),
  unit_price NUMERIC(12, 3),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_amendments_order_id ON order_amendments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_amendments_order_status ON order_amendments(order_id, status);
CREATE INDEX IF NOT EXISTS idx_order_amendment_items_amendment ON order_amendment_items(amendment_id);
