-- Quote requests (RFQ / request best price) + supplier public catalog toggle

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS public_catalog_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN supplier.public_catalog_enabled IS
  'When true, supplier catalog is visible at /supplier/:slug public mini-store';

CREATE TABLE IF NOT EXISTS quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'cancelled')),
  note TEXT,
  needed_by DATE,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_restaurant_status_created
  ON quote_requests (restaurant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS quote_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_request_items_request
  ON quote_request_items (quote_request_id);

CREATE TABLE IF NOT EXISTS quote_request_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'responded', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_request_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_request_suppliers_supplier_status
  ON quote_request_suppliers (supplier_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_request_suppliers_request
  ON quote_request_suppliers (quote_request_id);

CREATE TABLE IF NOT EXISTS quote_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_supplier_id UUID NOT NULL REFERENCES quote_request_suppliers(id) ON DELETE CASCADE,
  responded_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_request_supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_responses_qrs
  ON quote_responses (quote_request_supplier_id);

CREATE TABLE IF NOT EXISTS quote_response_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_response_id UUID NOT NULL REFERENCES quote_responses(id) ON DELETE CASCADE,
  quote_request_item_id UUID NOT NULL REFERENCES quote_request_items(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  unit_price NUMERIC(14, 3),
  currency TEXT DEFAULT 'USD',
  quantity NUMERIC(14, 3),
  delivery_date DATE,
  note TEXT,
  substitute_product_id UUID REFERENCES product(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_response_id, quote_request_item_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_response_items_response
  ON quote_response_items (quote_response_id);
