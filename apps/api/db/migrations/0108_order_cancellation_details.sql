-- Track who cancelled/declined an order and why (required for supplier declines).
ALTER TABLE customer_order
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

COMMENT ON COLUMN customer_order.cancel_reason IS 'Reason provided when order was cancelled or declined';
COMMENT ON COLUMN customer_order.cancelled_by IS 'RESTAURANT or SUPPLIER — party that cancelled the order';
