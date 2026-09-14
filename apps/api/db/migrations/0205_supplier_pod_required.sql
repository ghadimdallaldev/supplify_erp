-- Supplier-level proof-of-delivery requirement for marking deliveries complete

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS pod_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN supplier.pod_required IS
  'When true, drivers/suppliers must attach proof of delivery before marking an order delivered';
