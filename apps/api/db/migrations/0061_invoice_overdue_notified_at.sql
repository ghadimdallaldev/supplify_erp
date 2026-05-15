-- apps/api/db/migrations/0061_invoice_overdue_notified_at.sql
-- Tracks when an overdue notification was last sent for an invoice
-- so the daily job doesn't re-notify.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_overdue_check
  ON invoice (status, due_date, overdue_notified_at)
  WHERE status IN ('ISSUED', 'PARTIALLY_PAID');
