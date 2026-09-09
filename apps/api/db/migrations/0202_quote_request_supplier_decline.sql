-- Quote inbox: let a supplier decline to quote, and record why.
--
-- `declined` was already an allowed quote_request_suppliers.status but no code
-- path could set it, so a request the supplier could not serve stayed `pending`
-- and the restaurant had no signal to stop waiting on it.

ALTER TABLE quote_request_suppliers
  ADD COLUMN IF NOT EXISTS decline_reason TEXT,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

COMMENT ON COLUMN quote_request_suppliers.decline_reason IS
  'Optional supplier-supplied reason shown to the restaurant when status = declined';
COMMENT ON COLUMN quote_request_suppliers.viewed_at IS
  'First time the supplier opened this inbox entry; drives the unread count';

-- Inbox counts filter on (supplier_id, status) and sort by request recency.
CREATE INDEX IF NOT EXISTS idx_quote_request_suppliers_supplier_unviewed
  ON quote_request_suppliers (supplier_id, created_at DESC)
  WHERE status = 'pending' AND viewed_at IS NULL;
