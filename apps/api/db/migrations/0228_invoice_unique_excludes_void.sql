-- A voided invoice must not block issuing a corrected one for the same order.
-- The one-invoice-per-order-per-supplier rule now only covers non-void invoices.
DROP INDEX IF EXISTS uq_invoice_order_supplier;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_order_supplier
  ON invoice (order_id, supplier_id)
  WHERE order_id IS NOT NULL AND status <> 'VOID';
