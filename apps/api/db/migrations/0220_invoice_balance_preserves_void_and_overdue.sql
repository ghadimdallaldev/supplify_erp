-- Payments must not revive a voided or draft invoice, and a partial
-- payment on a past-due invoice must stay overdue until it is paid in full.
CREATE OR REPLACE FUNCTION calculate_invoice_balance()
RETURNS TRIGGER AS $$
DECLARE
  paid NUMERIC;
  inv_status TEXT;
  inv_total NUMERIC;
  inv_due DATE;
BEGIN
  SELECT status, total_amount, due_date
    INTO inv_status, inv_total, inv_due
  FROM invoice
  WHERE id = NEW.invoice_id;

  SELECT COALESCE(SUM(payment_amount), 0)
    INTO paid
  FROM payment
  WHERE invoice_id = NEW.invoice_id
    AND status = 'COMPLETED';

  UPDATE invoice
  SET
    paid_amount = paid,
    balance_due = inv_total - paid,
    status = CASE
      WHEN inv_status IN ('VOID', 'DRAFT') THEN inv_status
      WHEN inv_total <= paid THEN 'PAID'
      WHEN paid > 0 AND (inv_status = 'OVERDUE' OR inv_due < CURRENT_DATE) THEN 'OVERDUE'
      WHEN paid > 0 THEN 'PARTIALLY_PAID'
      ELSE inv_status
    END,
    payment_date = CASE
      WHEN inv_status NOT IN ('VOID', 'DRAFT') AND inv_total <= paid THEN CURRENT_DATE
      ELSE payment_date
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
