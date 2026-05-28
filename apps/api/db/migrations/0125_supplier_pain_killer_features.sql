-- Supplier pain-killer features: product substitutes, reorder reminder drafts, rescheduled delivery status

CREATE TABLE IF NOT EXISTS product_substitute (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  substitute_product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT product_substitute_distinct CHECK (product_id <> substitute_product_id),
  CONSTRAINT product_substitute_unique UNIQUE (supplier_id, product_id, substitute_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_substitute_product ON product_substitute(product_id);
CREATE INDEX IF NOT EXISTS idx_product_substitute_supplier ON product_substitute(supplier_id);

CREATE TABLE IF NOT EXISTS supplier_reorder_reminder_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  created_by UUID REFERENCES app_user(id),
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  suggested_products JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'discarded')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reorder_reminder_draft_supplier ON supplier_reorder_reminder_draft(supplier_id, status);

-- Allow rescheduled delivery status on driver assignments
ALTER TABLE driver_assignments DROP CONSTRAINT IF EXISTS driver_assignments_status_check;
ALTER TABLE driver_assignments ADD CONSTRAINT driver_assignments_status_check
  CHECK (status IN (
    'assigned',
    'picked_up',
    'out_for_delivery',
    'delivered',
    'failed',
    'reassigned',
    'rescheduled'
  ));
