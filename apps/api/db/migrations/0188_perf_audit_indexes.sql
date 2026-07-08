-- Performance audit 2026-07: align invoice list sort with supplier-scoped index.
-- Invoice list orders by issue_date DESC, invoice_number DESC (invoices.routes.js).
-- Existing idx_invoice_supplier_date uses invoice_date, not issue_date.

CREATE INDEX IF NOT EXISTS idx_invoice_supplier_issue_date
  ON invoice (supplier_id, issue_date DESC, invoice_number DESC)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_restaurant_issue_date
  ON invoice (restaurant_id, issue_date DESC, invoice_number DESC)
  WHERE restaurant_id IS NOT NULL;
