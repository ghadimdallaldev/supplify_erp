-- Migration: 0016_receiving_system.sql
-- Description: Add tables for the Receiving & Quality Control feature for restaurants

-- Receiving Report Table
CREATE TABLE IF NOT EXISTS receiving_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  received_by UUID REFERENCES app_user(id), -- Restaurant staff member who received the delivery
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_truck_number TEXT,
  driver_name TEXT,
  delivery_notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED, PARTIAL
  total_items_ordered NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_items_received NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_expected_cost NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_actual_cost NUMERIC(14,3) NOT NULL DEFAULT 0,
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5), -- 1-5 star rating
  quality_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receiving Line Item Table
CREATE TABLE IF NOT EXISTS receiving_line_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_report_id UUID NOT NULL REFERENCES receiving_report(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES order_item(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  ordered_quantity NUMERIC(14,3) NOT NULL,
  received_quantity NUMERIC(14,3) NOT NULL,
  unit TEXT NOT NULL,
  expected_unit_price NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_unit_price NUMERIC(14,3),
  notes TEXT,
  quality_status TEXT NOT NULL DEFAULT 'ACCEPTED', -- ACCEPTED, DAMAGED, EXPIRED, WRONG_ITEM, SHORT
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_receiving_report_order ON receiving_report(order_id);
CREATE INDEX idx_receiving_report_restaurant ON receiving_report(restaurant_id);
CREATE INDEX idx_receiving_report_supplier ON receiving_report(supplier_id);
CREATE INDEX idx_receiving_report_received_at ON receiving_report(received_at);

CREATE INDEX idx_receiving_line_item_report ON receiving_line_item(receiving_report_id);
CREATE INDEX idx_receiving_line_item_product ON receiving_line_item(product_id);
CREATE INDEX idx_receiving_line_item_order_item ON receiving_line_item(order_item_id);

