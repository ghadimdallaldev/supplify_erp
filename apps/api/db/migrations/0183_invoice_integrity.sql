-- Migration: 0183_invoice_integrity.sql
-- Invoice duplicate prevention, receiving uniqueness, unified numbering, branch denorm

-- Denormalize branch from order for fast invoice lists/exports
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_branch ON invoice(branch_id) WHERE branch_id IS NOT NULL;

-- One commercial invoice per order per supplier
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_order_supplier
  ON invoice (order_id, supplier_id)
  WHERE order_id IS NOT NULL;

-- One receiving report per order (prevents concurrent double-receive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_report_order
  ON receiving_report (order_id);

-- Composite list performance
CREATE INDEX IF NOT EXISTS idx_invoice_restaurant_status_due
  ON invoice (restaurant_id, status, due_date);

-- Unified invoice number generation (6-digit sequence, consistent with app service)
CREATE OR REPLACE FUNCTION generate_invoice_number(supplier_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  prefix_val TEXT := 'INV';
  year_val INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  month_val INTEGER := EXTRACT(MONTH FROM CURRENT_DATE);
  next_num INTEGER;
  seq_prefix TEXT;
BEGIN
  INSERT INTO invoice_sequence (supplier_id, year, month, current_number, next_number, prefix)
  VALUES (supplier_uuid, year_val, month_val, 0, 1, prefix_val)
  ON CONFLICT (supplier_id, year, month)
  DO UPDATE SET next_number = invoice_sequence.next_number + 1
  RETURNING next_number, prefix INTO next_num, seq_prefix;

  RETURN COALESCE(seq_prefix, prefix_val) || '-' || year_val || '-' ||
         LPAD(month_val::TEXT, 2, '0') || '-' ||
         LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Collision-safe payment numbers
CREATE OR REPLACE FUNCTION generate_payment_number(prefix TEXT DEFAULT 'PAY')
RETURNS TEXT AS $$
BEGIN
  RETURN prefix || '-' || to_char(CURRENT_DATE, 'YYYY-MM-DD') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
END;
$$ LANGUAGE plpgsql;
